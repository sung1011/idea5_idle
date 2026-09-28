import { addToBank } from './bank'
import { hashString, isCombatAttrId, matchingWeaknesses, pickEnemyWeaknesses } from './combatAttrs'
import { PLAYER_AVATAR_DEFAULT, PLAYER_AVATAR_IDS, type PlayerAvatarId } from './playerAvatarIds'
import { ITEM_DEF } from './tables'
import { applyDownedReturn, isFullCombatHp, workerLiveStats } from './combat'
import { offerRestFood, sendWorkerToRestTail } from './food'
import { raidPhaseOf } from './march'
import { marchDurationS } from './tech'
import { clearWorkerNew } from './recruit'
import {
  confirmableRunePicks,
  consumeRunePicks,
  runeDealMul,
  runeSpdMul,
  runeTakenMul,
  type RunePickMap,
} from './runes'
import { treasureMineBlockReason } from './treasureMineQuery'
import type {
  ActionResult,
  CombatAttrId,
  QualityTier,
  RuneItemId,
  Save,
  BountyTarget,
  MineVein,
  TreasureHaulId,
  TreasureId,
  TreasureKind,
  TreasureMine,
  TreasureMineState,
  TreasureRaid,
  TreasureRaidReturnee,
  TreasureShadow,
  Worker,
} from './types'

export const TREASURE_MINE_CAP = 4
export const TREASURE_RESERVE_MAX = 1000
export const TREASURE_LIFE_S = 60 * 60
/** 战旗 0 级时的开采人数。2 级、4 级各 +1。出战不看这个。 */
export const TREASURE_CREW_CAP = 3
export const TREASURE_DIG_BASE_S = 5
export const TREASURE_RAID_CAP = 3
/** 钻石刷新价。与砂金价二选一。 */
export const TREASURE_REFRESH_COST = 10

/**
 * 宝物消耗起步值，集中在这里方便以后改。收支仍走宝库。
 */
export const TREASURE_STAKE_PER_GUARD = 40
export const TREASURE_SCOUT_COST = 20
export const TREASURE_REFRESH_SAND_COST = 100
/** 我方洞被袭时，增援一名工人。 */
export const TREASURE_REINFORCE_COST = 60
/** 我方开采中的洞，在线每这么多秒判定一次来袭。 */
export const TREASURE_ASSAULT_INTERVAL_S = 10 * 60
/** 判定命中。roll 小于这个值就来袭。 */
export const TREASURE_ASSAULT_CHANCE = 0.2
/** 命中后来袭开战前的预警秒数。 */
export const TREASURE_ASSAULT_WARN_S = 30
/** 守住来袭缴获的砂金。 */
export const TREASURE_ASSAULT_LOOT = 30
/** 加固一层的珠宝价。每洞最多一层。 */
export const TREASURE_FORTIFY_COST = 60
/** 下一场来袭里，我方血上限和当前血同乘这个数。 */
export const TREASURE_FORTIFY_HP_MUL = 1.3
/** 每洞加固层数上限。 */
export const TREASURE_FORTIFY_CAP = 1
/** 战旗最高级。 */
export const TREASURE_BANNER_MAX = 5
/** 升到下一级的古玉价。下标是当前等级，0→1 起。 */
export const TREASURE_BANNER_COSTS = [150, 300, 600, 1000, 1600] as const
/** 每级让新刷洞储量增加的比例。已有洞不改。 */
export const TREASURE_BANNER_RESERVE_PER_LEVEL = 0.1
/** 达到这些等级时，开采人数上限各 +1。 */
export const TREASURE_BANNER_CREW_LEVELS = [2, 4] as const

/** 刷新付法。钻石走账号钻石，砂金走宝库。 */
export type TreasureRefreshPay = 'sandGold' | 'diamonds'

export const TREASURE_LABEL: Record<TreasureId, string> = {
  sandGold: '砂金',
  jewel: '珠宝',
  jade: '古玉',
}

export const TREASURE_KINDS = ['sandGold', 'jewel', 'jade'] as const satisfies readonly TreasureKind[]

export const TREASURE_KIND_LABEL: Record<TreasureKind, string> = {
  sandGold: '砂金洞',
  jewel: '珠宝洞',
  jade: '古玉洞',
}

/**
 * 旧洞的掉落权重，顺序砂金、珠宝、古玉，和为 100。
 * 砂金洞 70/25/5，珠宝洞 20/70/10，古玉洞 15/25/60。新洞不走这张表。
 */
export const TREASURE_DROP_WEIGHTS: Record<TreasureKind, Record<TreasureId, number>> = {
  sandGold: { sandGold: 70, jewel: 25, jade: 5 },
  jewel: { sandGold: 20, jewel: 70, jade: 10 },
  jade: { sandGold: 15, jewel: 25, jade: 60 },
}

export const MINE_VEINS = ['copper', 'iron', 'mithril'] as const satisfies readonly MineVein[]

export const MINE_VEIN_LABEL: Record<MineVein, string> = {
  copper: '铜矿洞',
  iron: '铁矿洞',
  mithril: '秘银洞',
}

export const MINE_VEIN_ORE: Record<MineVein, TreasureHaulId> = {
  copper: 'ore',
  iron: 'ironOre',
  mithril: 'mithrilOre',
}

/** 新洞宝物权重：砂金 40、珠宝 35、古玉 25。先过 40% 才掷这一下。 */
export const TREASURE_ORE_VAULT_CHANCE = 0.4
export const TREASURE_ORE_CRYSTAL_CHANCE = 0.5

export const TREASURE_HAUL_IDS = ['ore', 'ironOre', 'mithrilOre', 'wildCrystal'] as const satisfies readonly TreasureHaulId[]

export const BOUNTY_TARGETS = ['copper', 'iron', 'mithril', 'wildCrystal'] as const satisfies readonly BountyTarget[]

export const BOUNTY_TARGET_LABEL: Record<BountyTarget, string> = {
  copper: '铜矿',
  iron: '铁矿',
  mithril: '秘银',
  wildCrystal: '荒晶',
}

/** 悬赏价，单位珠宝。 */
export const TREASURE_BOUNTY_COST: Record<BountyTarget, number> = {
  copper: 60,
  iron: 100,
  mithril: 150,
  wildCrystal: 150,
}

/** 宝藏洞储量相对普通洞。战旗加成先算进普通储量，再乘这个数。 */
export const TREASURE_BOUNTY_RESERVE_MUL = 1.5
/** 宝藏洞每份目标资源的个数。 */
export const TREASURE_BOUNTY_YIELD = 2
/** 宝藏洞守军等级在普通规则上再加的级数。 */
export const TREASURE_BOUNTY_LEVEL_BONUS = 2

export type TreasureYieldId = TreasureId | TreasureHaulId

export type TreasureDrop = {
  mineId: string
  item: TreasureYieldId
  qty: number
}

export type TreasureDropSink = (drop: TreasureDrop) => void

/** 新洞种类。roll 来自矿洞自己的 `nextMineRoll`，三段各约 1/3。 */
export function treasureKindOfRoll(roll: number): TreasureKind {
  if (roll < 1 / 3) return 'sandGold'
  if (roll < 2 / 3) return 'jewel'
  return 'jade'
}

/** 旧档缺 kind：同一 id 每次都落到同一种。 */
export function treasureKindFromId(id: string): TreasureKind {
  const index = hashString(id) % TREASURE_KINDS.length
  return TREASURE_KINDS[index] ?? 'sandGold'
}

export function isTreasureKind(value: unknown): value is TreasureKind {
  return value === 'sandGold' || value === 'jewel' || value === 'jade'
}

/** 按洞种权重掷 1 件。`roll` 为 0～1。只给旧洞用。 */
export function rollTreasureDrop(kind: TreasureKind, roll: number): TreasureId {
  const weights = TREASURE_DROP_WEIGHTS[isTreasureKind(kind) ? kind : 'sandGold']
  const total = weights.sandGold + weights.jewel + weights.jade
  const mark = Math.max(0, roll) * total
  if (mark < weights.sandGold) return 'sandGold'
  if (mark < weights.sandGold + weights.jewel) return 'jewel'
  return 'jade'
}

export function isMineVein(value: unknown): value is MineVein {
  return value === 'copper' || value === 'iron' || value === 'mithril'
}

export function isBountyTarget(value: unknown): value is BountyTarget {
  return value === 'copper' || value === 'iron' || value === 'mithril' || value === 'wildCrystal'
}

export function isTreasureHaulId(value: unknown): value is TreasureHaulId {
  return value === 'ore' || value === 'ironOre' || value === 'mithrilOre' || value === 'wildCrystal'
}

/** 新洞矿种。0.5 铜、0.85 前铁、其余秘银。 */
export function mineVeinOfRoll(roll: number): MineVein {
  if (roll < 0.5) return 'copper'
  if (roll < 0.85) return 'iron'
  return 'mithril'
}

/** 新洞宝物。砂金 40%、珠宝 35%、古玉 25%。`roll` 为 0～1。 */
export function rollOreVaultTreasure(roll: number): TreasureId {
  if (roll < 0.4) return 'sandGold'
  if (roll < 0.75) return 'jewel'
  return 'jade'
}

/** 宝藏洞守军人数。一半 2 人，一半 3 人。不会是 0。 */
export function bountyCrewCount(roll: number): number {
  return roll < 0.5 ? 2 : 3
}

/** 旧洞：没有矿种、也不是宝藏洞，洞种仍是砂金 / 珠宝 / 古玉。 */
export function isLegacyTreasureMine(mine: Pick<TreasureMine, 'kind' | 'vein' | 'bounty'>): boolean {
  return mine.bounty == null && mine.vein == null && isTreasureKind(mine.kind)
}

export function mineKindLabel(mine: Pick<TreasureMine, 'kind' | 'vein' | 'bounty'>): string {
  if (mine.bounty === 'wildCrystal') return '荒晶洞'
  if (isMineVein(mine.vein)) return MINE_VEIN_LABEL[mine.vein]
  if (isTreasureKind(mine.kind)) return TREASURE_KIND_LABEL[mine.kind]
  return '矿洞'
}

export function bountyTargetLabel(target: BountyTarget): string {
  return BOUNTY_TARGET_LABEL[target]
}

export function bountyButtonLabel(target: BountyTarget | null): string {
  if (!target) return '悬赏'
  return `悬赏·${BOUNTY_TARGET_LABEL[target]}`
}

export function treasureHaulQty(save: Save, id: TreasureHaulId): number {
  const raw = save.treasureMines?.haul?.[id]
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return 0
  return Math.floor(raw)
}

export function treasureHaulRows(save: Save): { id: TreasureHaulId; label: string; qty: number }[] {
  return TREASURE_HAUL_IDS.map((id) => ({ id, label: ITEM_DEF[id].label, qty: treasureHaulQty(save, id) }))
}

/** 我方入库漂字。宝物、矿石、荒晶都走这一句。数量写在后面，可叠。 */
export function treasureDropTip(item: TreasureYieldId, qty = 1): string {
  const label =
    item === 'sandGold' || item === 'jewel' || item === 'jade' ? TREASURE_LABEL[item] : ITEM_DEF[item].label
  return `获得 ${label} ×${qty}`
}

export function sandShortTip(qty: number): string {
  return `砂金不足，需要 ${qty}`
}

export function jewelGap(need: number, have: number): number {
  return Math.max(0, Math.floor(need) - Math.max(0, Math.floor(have)))
}

export function jewelShortTip(need: number, have: number): string {
  return `珠宝还差 ${jewelGap(need, have)}`
}

export function jewelSpentTip(qty: number): string {
  return `珠宝 −${qty}`
}

export function jadeGap(need: number, have: number): number {
  return Math.max(0, Math.floor(need) - Math.max(0, Math.floor(have)))
}

export function jadeShortTip(need: number, have: number): string {
  return `古玉还差 ${jadeGap(need, have)}`
}

export function jadeSpentTip(qty: number): string {
  return `古玉 −${qty}`
}

export type BannerFrame = 'none' | 'copper' | 'silver' | 'gold'

export const BANNER_FRAME_LABEL: Record<BannerFrame, string> = {
  none: '无框',
  copper: '铜色',
  silver: '银色',
  gold: '金色',
}

function keptBannerLevel(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0
  return Math.min(TREASURE_BANNER_MAX, Math.max(0, Math.floor(raw)))
}

/** 战旗等级。缺字段、负数、非数都当 0，高于 5 级夹到 5。 */
export function bannerLevelOf(save: Save): number {
  return keptBannerLevel(save.treasureMines?.bannerLevel)
}

/** 升到下一级要的古玉。已满则没有。 */
export function bannerUpgradeCost(level: number): number | null {
  const current = keptBannerLevel(level)
  if (current >= TREASURE_BANNER_MAX) return null
  return TREASURE_BANNER_COSTS[current] ?? null
}

/** 这一级新刷洞的储量上限。0 级就是基础 1000。 */
export function bannerReserveMax(level: number): number {
  const steps = keptBannerLevel(level)
  return Math.round(TREASURE_RESERVE_MAX * (1 + TREASURE_BANNER_RESERVE_PER_LEVEL * steps))
}

/** 开采人数上限。0～1 级 3 人，2～3 级 4 人，4～5 级 5 人。 */
export function treasureCrewCap(save: Save): number {
  return crewCapAt(bannerLevelOf(save))
}

function crewCapAt(level: number): number {
  const current = keptBannerLevel(level)
  let cap = TREASURE_CREW_CAP
  for (const mark of TREASURE_BANNER_CREW_LEVELS) {
    if (current >= mark) cap += 1
  }
  return cap
}

/** 顶栏头像框。0 级无框，2 级沿用铜，4 级沿用银。 */
export function bannerFrameOf(level: number): BannerFrame {
  const current = keptBannerLevel(level)
  if (current >= 5) return 'gold'
  if (current >= 3) return 'silver'
  if (current >= 1) return 'copper'
  return 'none'
}

/** 升到下一级时页面上列出的奖励。已满为空。 */
export function bannerNextRewards(level: number): string[] {
  const current = keptBannerLevel(level)
  if (current >= TREASURE_BANNER_MAX) return []
  const next = current + 1
  const lines = [
    `新刷洞储量 +10%（${bannerReserveMax(next)}）`,
    '新刷洞守军等级 +1',
  ]
  const capNow = crewCapAt(current)
  const capNext = crewCapAt(next)
  if (capNext > capNow) lines.push(`开采人数上限 ${capNext}`)
  const frameNow = bannerFrameOf(current)
  const frameNext = bannerFrameOf(next)
  if (frameNext !== frameNow) lines.push(`头像框${BANNER_FRAME_LABEL[frameNext]}`)
  return lines
}

/** 古玉够升下一级。已满或不够都不算，界面只在战旗栏上用这个亮红点。 */
export function bannerUpgradeReady(save: Save): boolean {
  const cost = bannerUpgradeCost(bannerLevelOf(save))
  if (cost == null) return false
  return vaultQty(save, 'jade') >= cost
}

/** 花古玉升 1 级。不够或已满都不扣。已有矿洞不改。 */
export function upgradeTreasureBanner(save: Save): ActionResult {
  const state = ensureTreasureMines(save)
  const level = bannerLevelOf(save)
  if (level >= TREASURE_BANNER_MAX) return { ok: false, reason: '战旗已满' }
  const cost = TREASURE_BANNER_COSTS[level]
  if (cost == null) return { ok: false, reason: '战旗已满' }
  if (vaultQty(save, 'jade') < cost) {
    return { ok: false, reason: jadeShortTip(cost, vaultQty(save, 'jade')) }
  }
  trySpendVault(save, 'jade', cost)
  state.bannerLevel = level + 1
  return { ok: true, message: jadeSpentTip(cost) }
}

export function sandSpentTip(qty: number): string {
  return `砂金 −${qty}`
}

export function stakePaidTip(qty: number): string {
  return `押军费 −${qty}`
}

export function stakeRefundTip(qty: number): string {
  return `退回军费 +${qty}`
}

export const STAKE_FORFEIT_TIP = '军费没收'

/** 有守军才押。无人矿 0。 */
export function raidStakeCost(guardCount: number): number {
  const guards = Math.max(0, Math.floor(guardCount))
  return guards * TREASURE_STAKE_PER_GUARD
}

export type TreasureVaultNotice = {
  mineId: string
  text: string
  kind: 'ok' | 'err'
}

const vaultNotices: TreasureVaultNotice[] = []

function noteVault(mineId: string, text: string, kind: TreasureVaultNotice['kind']): void {
  vaultNotices.push({ mineId, text, kind })
}

/** 战斗结算时的退款 / 没收。界面在 tick 后取走漂字。 */
export function takeTreasureVaultNotices(): TreasureVaultNotice[] {
  if (!vaultNotices.length) return []
  return vaultNotices.splice(0, vaultNotices.length)
}

/** 宝库数量。缺字段、负数、非数都当 0。珠宝和古玉以后也走这里。 */
export function vaultQty(save: Save, id: TreasureId): number {
  const raw = ensureTreasureMines(save).vault[id]
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0
  return Math.max(0, Math.floor(raw))
}

export function addVault(save: Save, id: TreasureId, qty: number): void {
  const gain = Math.floor(qty)
  if (gain <= 0) return
  const state = ensureTreasureMines(save)
  state.vault[id] = vaultQty(save, id) + gain
}

/** 不够则不动。0 及以下视为不用花。 */
export function trySpendVault(save: Save, id: TreasureId, qty: number): boolean {
  const cost = Math.floor(qty)
  if (cost <= 0) return true
  const have = vaultQty(save, id)
  if (have < cost) return false
  ensureTreasureMines(save).vault[id] = have - cost
  return true
}

/** 新刷快照守军的显示名。同一局里优先没用过的，名单用尽才重复。 */
export const SNAPSHOT_PLAYER_NAMES = [
  '青石',
  '晚风',
  '小满',
  '阿栗',
  '北巷',
  '白露',
  '南枝',
  '木舟',
  '灯火',
  '远山',
  '清禾',
  '旧桥',
  '星河',
  '落叶',
  '暖阳',
  '微澜',
] as const

const SHADOW_RUNES: RuneItemId[] = ['runeSharp', 'runeArmor', 'runeSwift']
const PLAYER_AVATAR_ID_SET = new Set<string>(PLAYER_AVATAR_IDS)

/** 新刷有守军的洞抽一个头像。roll 来自矿洞自己的 `nextMineRoll`，整洞共用。 */
export function pickMineAvatarId(roll: number): PlayerAvatarId {
  const index = Math.min(PLAYER_AVATAR_IDS.length - 1, Math.max(0, Math.floor(Math.max(0, roll) * PLAYER_AVATAR_IDS.length)))
  return PLAYER_AVATAR_IDS[index] ?? PLAYER_AVATAR_DEFAULT
}

/** 旧洞缺头像时按洞 id 落到固定一张，重复读档不换。 */
export function stableMineAvatarId(mineId: string): PlayerAvatarId {
  return PLAYER_AVATAR_IDS[hashString(mineId) % PLAYER_AVATAR_IDS.length] ?? PLAYER_AVATAR_DEFAULT
}

export function normalizeMineAvatarId(value: unknown, mineId: string): PlayerAvatarId {
  if (typeof value === 'string' && PLAYER_AVATAR_ID_SET.has(value)) return value as PlayerAvatarId
  return stableMineAvatarId(mineId)
}

/** 按矿洞掷骰从名单取一个显示名。`taken` 里已有的尽量跳过。 */
export function pickSnapshotPlayerName(roll: number, taken: ReadonlySet<string>): string {
  const free = SNAPSHOT_PLAYER_NAMES.filter((name) => !taken.has(name))
  const pool = free.length > 0 ? free : SNAPSHOT_PLAYER_NAMES
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(roll * pool.length)))
  return pool[index] ?? SNAPSHOT_PLAYER_NAMES[0]
}

function namesOnBoard(save: Save): Set<string> {
  const taken = new Set<string>()
  for (const mine of save.treasureMines?.mines ?? []) {
    for (const shadow of mine.shadows ?? []) {
      if (shadow.name) taken.add(shadow.name)
    }
  }
  return taken
}

export function blankTreasureMines(): TreasureMineState {
  return { nextId: 1, roll: 1, vault: {}, mines: [], bannerLevel: 0, bounty: null, haul: {} }
}

/** 等级微调：1～5 级 5 秒，之后每 5 级快 1 秒，最快 3 秒。命中矿弱点再快 1 秒。 */
export function mineDigIntervalS(level: number, matchesWeakness = false): number {
  const bonus = Math.min(2, Math.floor(Math.max(0, Math.floor(level) - 1) / 5))
  const weak = matchesWeakness ? 1 : 0
  return Math.max(1, TREASURE_DIG_BASE_S - bonus - weak)
}

/** 与战场相同：工人属性命中矿洞弱点表才算吃到。多条命中也只快 1 秒。 */
export function workerMatchesMineWeakness(
  attrs: readonly CombatAttrId[] | undefined,
  weaknesses: readonly CombatAttrId[] | undefined,
): boolean {
  return matchingWeaknesses(attrs ?? [], weaknesses ?? []).length > 0
}

export function mineRemainS(mine: TreasureMine, elapsedS: number): number {
  return Math.max(0, mine.expiresAtS - elapsedS)
}

export function ensureTreasureMines(save: Save): TreasureMineState {
  const raw = save.treasureMines
  if (!raw || !Array.isArray(raw.mines) || typeof raw.nextId !== 'number') {
    save.treasureMines = blankTreasureMines()
  }
  if (!save.treasureMines.vault || typeof save.treasureMines.vault !== 'object') {
    save.treasureMines.vault = {}
  }
  if (typeof save.treasureMines.roll !== 'number' || !Number.isFinite(save.treasureMines.roll)) {
    save.treasureMines.roll = 1
  }
  save.treasureMines.bannerLevel = keptBannerLevel(save.treasureMines.bannerLevel)
  save.treasureMines.bounty = isBountyTarget(save.treasureMines.bounty) ? save.treasureMines.bounty : null
  save.treasureMines.haul = keptHaul(save.treasureMines.haul)
  return save.treasureMines
}

function keptCount(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return 0
  return Math.floor(raw)
}

function keptHaul(raw: unknown): Partial<Record<TreasureHaulId, number>> {
  const out: Partial<Record<TreasureHaulId, number>> = {}
  if (!raw || typeof raw !== 'object') return out
  const src = raw as Partial<Record<string, unknown>>
  for (const id of TREASURE_HAUL_IDS) {
    const qty = keptCount(src[id])
    if (qty > 0) out[id] = qty
  }
  return out
}

function normalizeMineRule(mine: TreasureMine): void {
  mine.dugOre = keptCount(mine.dugOre)
  mine.dugCrystal = keptCount(mine.dugCrystal)
  if (isBountyTarget(mine.bounty)) {
    mine.vein = mine.bounty === 'wildCrystal' ? null : mine.bounty
    mine.kind = null
    return
  }
  mine.bounty = null
  if (isMineVein(mine.vein)) {
    mine.kind = null
    return
  }
  mine.vein = null
  if (!isTreasureKind(mine.kind)) mine.kind = treasureKindFromId(mine.id)
}

export function hydrateTreasureMines(save: Save): void {
  ensureTreasureMines(save)
  for (const mine of save.treasureMines.mines) {
    if (!Array.isArray(mine.crewIds)) mine.crewIds = []
    if (!Array.isArray(mine.shadows)) mine.shadows = []
    if (!mine.digCharge || typeof mine.digCharge !== 'object') mine.digCharge = {}
    if (mine.raid && !Array.isArray(mine.raid.queue)) mine.raid = null
    if (mine.raid) {
      mine.raid.incoming = mine.raid.incoming === true
      mine.raid.fortified = mine.raid.fortified === true
      const attackLen = mine.raid.incoming
        ? assaultSlotCount(Math.max(mine.raid.queue.length, Array.isArray(mine.raid.attackSlots) ? mine.raid.attackSlots.length : 0))
        : TREASURE_RAID_CAP
      mine.raid.attackSlots = normalizeRaidSlots(mine.raid.attackSlots, mine.raid.queue, attackLen)
      mine.raid.defendSlots = normalizeRaidSlots(
        mine.raid.defendSlots,
        mine.shadows.map((shadow) => shadow.id),
        TREASURE_RAID_CAP,
      )
      ensureRaidVitals(save, mine)
      mine.raid.stakeSand = keptStake(mine.raid.stakeSand)
      mine.raid.reinforced = mine.raid.reinforced === true
    }
    mine.assaultChargeS = keptAssaultCharge(mine.assaultChargeS)
    mine.fortified = mine.owner === 'player' && mine.fortified === true
    mine.assaultParty = keptAssaultParty(mine.assaultParty)
    mine.assaultAvatarId = typeof mine.assaultAvatarId === 'string' && mine.assaultAvatarId ? mine.assaultAvatarId : null
    mine.assaultWarnAtS =
      mine.owner === 'player' &&
      !mine.raid &&
      mine.assaultParty.length > 0 &&
      typeof mine.assaultWarnAtS === 'number' &&
      Number.isFinite(mine.assaultWarnAtS)
        ? mine.assaultWarnAtS
        : null
    if (mine.assaultWarnAtS == null && !mine.raid?.incoming) {
      mine.assaultParty = []
      mine.assaultAvatarId = null
    }
    if (mine.owner !== 'player' && mine.owner !== 'shadow' && mine.owner !== 'empty') {
      mine.owner = mine.shadows.length > 0 ? 'shadow' : 'empty'
    }
    normalizeMineRule(mine)
    mine.ownerAvatarId = normalizeMineAvatarId(mine.ownerAvatarId, mine.id)
    mine.weaknesses = mineWeaknessesOf(mine)
    mine.revealedWeaknesses = keptRevealedWeaknesses(mine)
    const ceiling = Math.round(bannerReserveMax(TREASURE_BANNER_MAX) * TREASURE_BOUNTY_RESERVE_MUL)
    const storedMax =
      typeof mine.reserveMax === 'number' && Number.isFinite(mine.reserveMax) && mine.reserveMax > 0
        ? Math.floor(mine.reserveMax)
        : TREASURE_RESERVE_MAX
    mine.reserveMax = Math.min(ceiling, Math.max(TREASURE_RESERVE_MAX, storedMax))
    mine.reserve = clampInt(mine.reserve, 0, mine.reserveMax)
  }
  refreshTreasureMines(save)
}

/** 钻石刷新留下的洞：战斗中（含行军 / 交战 / 凯旋 / 溃退，即有 raid）或我方开采。 */
function isTreasureRefreshKept(mine: TreasureMine): boolean {
  return mine.raid != null || mine.owner === 'player'
}

/**
 * 花砂金或钻石换一批没在参与的洞。保留战斗中与我方开采，保留洞不拆开采队伍。
 * 无人矿、敌人驻守且无抢夺的照常换新。
 * 四洞都在保留里、或所选货币不够时不扣。
 */
export function refreshTreasureMineBoard(
  save: Save,
  pay: TreasureRefreshPay = 'diamonds',
  rolls?: number[],
): ActionResult {
  const state = ensureTreasureMines(save)
  if (!state.mines.some((mine) => !isTreasureRefreshKept(mine))) return { ok: false, reason: '没有可刷新的矿洞' }
  if (pay === 'sandGold') {
    if (!trySpendVault(save, 'sandGold', TREASURE_REFRESH_SAND_COST)) {
      return { ok: false, reason: sandShortTip(TREASURE_REFRESH_SAND_COST) }
    }
  } else {
    if (save.diamonds < TREASURE_REFRESH_COST) return { ok: false, reason: '钻石不足' }
    save.diamonds -= TREASURE_REFRESH_COST
  }
  const kept: TreasureMine[] = []
  for (const mine of state.mines) {
    if (isTreasureRefreshKept(mine)) {
      kept.push(mine)
      continue
    }
    releaseMineCrew(save, mine)
  }
  state.mines = kept
  while (state.mines.length < TREASURE_MINE_CAP) {
    state.mines.push(spawnMine(save, save.elapsedS, rolls))
  }
  const spent = pay === 'sandGold' ? sandSpentTip(TREASURE_REFRESH_SAND_COST) : `钻石 −${TREASURE_REFRESH_COST}`
  return { ok: true, message: spent }
}

function releaseMineCrew(save: Save, mine: TreasureMine): void {
  const ids = [...mine.crewIds]
  for (const id of ids) {
    const worker = save.workers.find((row) => row.id === id)
    if (worker) worker.assignment = null
    delete mine.digCharge[id]
  }
  mine.crewIds = []
  for (const id of ids) offerRestFood(save, id)
}

export function refreshTreasureMines(save: Save, rolls?: number[]): void {
  const state = ensureTreasureMines(save)
  const elapsed = save.elapsedS
  const kept: TreasureMine[] = []
  for (const mine of state.mines) {
    if (mine.reserve <= 0 || elapsed >= mine.expiresAtS) {
      releaseRaid(save, mine)
      continue
    }
    kept.push(mine)
  }
  state.mines = kept
  while (state.mines.length < TREASURE_MINE_CAP) {
    state.mines.push(spawnMine(save, elapsed, rolls))
  }
}

/** 花珠宝挂一张悬赏。已有悬赏或珠宝不够都不扣。下一座新洞刷出后才清空。 */
export function postTreasureBounty(save: Save, target: BountyTarget): ActionResult {
  const state = ensureTreasureMines(save)
  if (state.bounty) return { ok: false, reason: '已有悬赏' }
  if (!isBountyTarget(target)) return { ok: false, reason: '没有这个悬赏' }
  const cost = TREASURE_BOUNTY_COST[target]
  if (!trySpendVault(save, 'jewel', cost)) {
    return { ok: false, reason: jewelShortTip(cost, vaultQty(save, 'jewel')) }
  }
  state.bounty = target
  return { ok: true, message: jewelSpentTip(cost) }
}

/** 开采态明确拒绝符文。抢夺走 startTreasureRaid。 */
export function rejectTreasureMineRune(): ActionResult {
  return { ok: false, reason: '开采不能装符文' }
}

/** 无人矿按当前开采上限一次选人占领。不改储量、倒计时和弱点。 */
export function claimTreasureMine(save: Save, mineId: string, workerIds: readonly string[]): ActionResult {
  const mine = findMine(save, mineId)
  if (!mine) return { ok: false, reason: '没有这个矿洞' }
  if (mine.owner === 'player') return { ok: false, reason: '这洞不能补采' }
  if (mine.owner !== 'empty') return { ok: false, reason: '这洞现在不能开采' }
  if (!workerIds.length) return { ok: false, reason: '请选择开采苦工' }
  const cap = treasureCrewCap(save)
  if (workerIds.length > cap) return { ok: false, reason: `这洞最多 ${cap} 人` }
  const seen = new Set<string>()
  const party: Worker[] = []
  for (const id of workerIds) {
    if (seen.has(id)) return { ok: false, reason: '不能重复选同一个人' }
    seen.add(id)
    const worker = save.workers.find((row) => row.id === id)
    if (!worker) return { ok: false, reason: '没有这个苦工' }
    if (worker.assignment != null) return { ok: false, reason: '苦工不在休息区' }
    const busy = treasureMineBlockReason(save, id)
    if (busy) return { ok: false, reason: busy }
    party.push(worker)
  }
  mine.owner = 'player'
  mine.shadows = []
  mine.raid = null
  mine.crewIds = party.map((worker) => worker.id)
  mine.digCharge = {}
  clearAssault(mine)
  mine.fortified = false
  for (const worker of party) {
    clearWorkerNew(save, worker.id)
    revealMineWeaknesses(mine, worker.combatAttrs)
  }
  return { ok: true, message: '已占领矿洞' }
}

/** 一键放弃。工人回休息，洞变无人矿。储量、倒计时和弱点不动。 */
export function abandonTreasureMine(save: Save, mineId: string): ActionResult {
  const mine = findMine(save, mineId)
  if (!mine) return { ok: false, reason: '没有这个矿洞' }
  if (mine.owner !== 'player') return { ok: false, reason: '这洞不是你的' }
  if (mine.raid) return { ok: false, reason: '抢夺进行中不能撤出' }
  releaseMineCrew(save, mine)
  mine.owner = 'empty'
  mine.shadows = []
  mine.raid = null
  mine.digCharge = {}
  clearAssault(mine)
  mine.fortified = false
  return { ok: true, message: '已放弃矿洞' }
}

/**
 * 我方开采、且没在战斗时，花珠宝加固 1 层。
 * 已经加固、珠宝不够、或这洞不是正在开采，都不扣。
 */
export function fortifyTreasureMine(save: Save, mineId: string): ActionResult {
  const mine = findMine(save, mineId)
  if (!mine) return { ok: false, reason: '没有这个矿洞' }
  if (mine.owner !== 'player' || mine.raid) return { ok: false, reason: '这洞现在不能加固' }
  if (mine.fortified || TREASURE_FORTIFY_CAP < 1) return { ok: false, reason: '已经加固' }
  if (vaultQty(save, 'jewel') < TREASURE_FORTIFY_COST) {
    return { ok: false, reason: jewelShortTip(TREASURE_FORTIFY_COST, vaultQty(save, 'jewel')) }
  }
  trySpendVault(save, 'jewel', TREASURE_FORTIFY_COST)
  mine.fortified = true
  return { ok: true, message: jewelSpentTip(TREASURE_FORTIFY_COST) }
}

/** 弱点是否都已揭开。没有弱点表不算揭开。 */
export function mineFullyRevealed(mine: TreasureMine): boolean {
  const weaknesses = (mine.weaknesses ?? []).filter(isCombatAttrId)
  if (!weaknesses.length) return false
  const revealed = new Set(Array.isArray(mine.revealedWeaknesses) ? mine.revealedWeaknesses : [])
  return weaknesses.every((id) => revealed.has(id))
}

/**
 * 出兵前花砂金，揭开该洞全部弱点。
 * 揭开后留到洞消失，和开采 / 开战记下的是同一份。已揭开不再收费。
 */
export function scoutTreasureMine(save: Save, mineId: string): ActionResult {
  const mine = findMine(save, mineId)
  if (!mine) return { ok: false, reason: '没有这个矿洞' }
  if (mine.raid) return { ok: false, reason: '这洞抢夺进行中' }
  mine.weaknesses = mineWeaknessesOf(mine)
  if (mineFullyRevealed(mine)) return { ok: false, reason: '弱点已经揭开' }
  if (!trySpendVault(save, 'sandGold', TREASURE_SCOUT_COST)) {
    return { ok: false, reason: sandShortTip(TREASURE_SCOUT_COST) }
  }
  mine.revealedWeaknesses = [...mine.weaknesses]
  return { ok: true, message: sandSpentTip(TREASURE_SCOUT_COST) }
}

/** 只锁这一洞。其它洞的抢夺和开采不看这里。 */
export function isTreasureRaidLocked(mine: TreasureMine): boolean {
  return mine.raid != null
}

export function startTreasureRaid(
  save: Save,
  mineId: string,
  workerIds: readonly string[],
  runePicks?: RunePickMap,
): ActionResult {
  const mine = findMine(save, mineId)
  if (!mine) return { ok: false, reason: '没有这个矿洞' }
  if (isTreasureRaidLocked(mine)) return { ok: false, reason: '这洞抢夺进行中' }
  if (mine.owner === 'empty' || !mine.shadows.length) return { ok: false, reason: '洞里没有守军' }
  if (mine.owner !== 'shadow') return { ok: false, reason: '这洞现在不能抢' }
  if (!workerIds.length) return { ok: false, reason: '请选择抢夺苦工' }
  if (workerIds.length > TREASURE_RAID_CAP) return { ok: false, reason: '抢夺最多 3 人' }
  const seen = new Set<string>()
  const party: Worker[] = []
  for (const id of workerIds) {
    if (seen.has(id)) return { ok: false, reason: '不能重复选同一个人' }
    seen.add(id)
    const worker = save.workers.find((row) => row.id === id)
    if (!worker) return { ok: false, reason: '没有这个苦工' }
    if (worker.assignment != null) return { ok: false, reason: `${worker.name ?? worker.id} 不在休息区` }
    const busy = treasureMineBlockReason(save, id)
    if (busy) return { ok: false, reason: `${worker.name ?? worker.id} ${busy}` }
    party.push(worker)
  }
  const stake = raidStakeCost(mine.shadows.length)
  if (vaultQty(save, 'sandGold') < stake) return { ok: false, reason: sandShortTip(stake) }
  const runes = confirmableRunePicks(save, runePicks, workerIds)
  const spent = consumeRunePicks(save, runes)
  if (!spent.ok) return spent
  trySpendVault(save, 'sandGold', stake)
  for (const worker of party) clearWorkerNew(save, worker.id)
  mine.raid = openRaid(save, mine, party, runes, stake)
  for (const worker of party) revealMineWeaknesses(mine, worker.combatAttrs)
  return { ok: true, message: stakePaidTip(stake) }
}

/** 我方洞被袭、且还在交战时，才能把人补进队列。已经增援过就不行。 */
export function treasureRaidOpenForReinforce(mine: TreasureMine): boolean {
  const raid = mine.raid
  if (!raid || raid.incoming !== true || raid.reinforced === true) return false
  const phase = raidPhaseOf(raid)
  return phase === 'fighting' || phase === 'marchOut'
}

/**
 * 我方洞被袭时，花珠宝从休息区派一名满血工人进入我方队列。
 * 抢别人的洞不能用。每一仗只能一次。人未进场、珠宝未动，除非全部条件都过。
 */
export function reinforceTreasureRaid(save: Save, mineId: string, workerId: string): ActionResult {
  const mine = findMine(save, mineId)
  if (!mine) return { ok: false, reason: '没有这个矿洞' }
  const raid = mine.raid
  if (!raid) return { ok: false, reason: '这洞没有进行中的抢夺' }
  if (raid.incoming !== true) return { ok: false, reason: '抢夺中不能增援' }
  if (raid.reinforced === true) return { ok: false, reason: '本场已经增援' }
  if (!treasureRaidOpenForReinforce(mine)) return { ok: false, reason: '这洞没有进行中的抢夺' }
  const slots = raid.attackSlots ?? []
  const slot = slots.findIndex((id) => id == null)
  if (raid.queue.length >= TREASURE_RAID_CAP || slot < 0 || !raid.attackSlots) {
    return { ok: false, reason: '抢夺最多 3 人' }
  }
  const worker = save.workers.find((row) => row.id === workerId)
  if (!worker) return { ok: false, reason: '没有这个苦工' }
  if (worker.assignment != null) return { ok: false, reason: '苦工不在休息区' }
  const busy = treasureMineBlockReason(save, worker.id)
  if (busy) return { ok: false, reason: busy }
  if (!isFullCombatHp(worker)) return { ok: false, reason: '没有满血苦工' }
  if (vaultQty(save, 'jewel') < TREASURE_REINFORCE_COST) {
    return { ok: false, reason: jewelShortTip(TREASURE_REINFORCE_COST, vaultQty(save, 'jewel')) }
  }
  trySpendVault(save, 'jewel', TREASURE_REINFORCE_COST)
  clearWorkerNew(save, worker.id)
  raid.queue = [...raid.queue, worker.id]
  raid.attackSlots[slot] = worker.id
  const vitals = fortifyVitals(attackerCombatVitals(save, worker, undefined), raid.fortified === true)
  raid.attackSlotHp[slot] = Math.max(1, vitals.hp)
  raid.attackSlotMax[slot] = vitals.hpMax
  raid.reinforced = true
  revealMineWeaknesses(mine, worker.combatAttrs)
  return { ok: true, message: jewelSpentTip(TREASURE_REINFORCE_COST) }
}

function openRaid(
  save: Save,
  mine: TreasureMine,
  party: Worker[],
  runes: Partial<Record<string, RuneItemId>>,
  stakeSand: number,
): TreasureRaid {
  const attackSlots = raidSlotSnapshot(party.map((worker) => worker.id))
  const defendSlots = raidSlotSnapshot(mine.shadows.map((shadow) => shadow.id))
  const attackVitals = attackSlots.map((id) => {
    if (!id) return { hp: 0, hpMax: 0 }
    const worker = party.find((row) => row.id === id)
    if (!worker) return { hp: 0, hpMax: 0 }
    const vitals = attackerCombatVitals(save, worker, runes[id])
    return { hp: Math.max(1, vitals.hp), hpMax: vitals.hpMax }
  })
  const defendVitals = defendSlots.map((id) => {
    if (!id) return { hp: 0, hpMax: 0 }
    const shadow = mine.shadows.find((row) => row.id === id)
    return { hp: Math.max(0, shadow?.hp ?? 0), hpMax: Math.max(0, shadow?.hpMax ?? 0) }
  })
  const raid: TreasureRaid = {
    queue: party.map((worker) => worker.id),
    attackSlots,
    defendSlots,
    attackSlotHp: attackVitals.map((row) => row.hp),
    attackSlotMax: attackVitals.map((row) => row.hpMax),
    defendSlotHp: defendVitals.map((row) => row.hp),
    defendSlotMax: defendVitals.map((row) => row.hpMax),
    garrison: mine.shadows.length,
    atkHp: 1,
    atkMax: 1,
    atkAtk: 1,
    atkSpd: 1,
    atkNext: save.elapsedS,
    defHp: 1,
    defAtk: 1,
    defSpd: 1,
    defNext: save.elapsedS,
    runes,
    phase: 'marchOut',
    phaseStartedAtS: save.elapsedS,
    phaseEndsAtS: save.elapsedS + marchDurationS(save),
    returning: [],
    stakeSand,
    reinforced: false,
  }
  loadAttacker(save, raid, false)
  loadDefender(mine, raid, null)
  raid.atkNext = Number.POSITIVE_INFINITY
  raid.defNext = Number.POSITIVE_INFINITY
  return raid
}

function armRaidFight(save: Save, mine: TreasureMine, raid: TreasureRaid, atS: number): void {
  raid.phase = 'fighting'
  raid.phaseStartedAtS = atS
  delete raid.phaseEndsAtS
  loadAttacker(save, raid, false)
  raid.atkNext = atS + Math.max(1, raid.atkSpd)
  loadDefender(mine, raid, atS)
}

export type TreasureStepOpts = {
  /** 离线追赶不判定来袭。 */
  offline?: boolean
  /** 测例注入的 0～1 骰。来袭按命中、人数、每人名字、头像的顺序取走。 */
  rolls?: number[]
}

export function stepTreasureMines(save: Save, onDrop?: TreasureDropSink, opts?: TreasureStepOpts): void {
  const state = ensureTreasureMines(save)
  for (const mine of state.mines) {
    if (!opts?.offline) stepAssault(save, mine, opts?.rolls)
    if (mine.raid) stepRaid(save, mine)
    if (mine.reserve > 0 && save.elapsedS < mine.expiresAtS) stepDig(save, mine, onDrop, opts?.rolls)
  }
  refreshTreasureMines(save)
}

/** 在线才走。预警和战斗中不计时、不重判。 */
function stepAssault(save: Save, mine: TreasureMine, rolls?: number[]): void {
  if (mine.owner !== 'player' || mine.crewIds.length === 0) return
  if (mine.raid) return
  if (mine.assaultWarnAtS != null) {
    if (save.elapsedS < mine.assaultWarnAtS) return
    beginIncomingFight(save, mine)
    return
  }
  const charge = keptAssaultCharge(mine.assaultChargeS) + 1
  if (charge < TREASURE_ASSAULT_INTERVAL_S) {
    mine.assaultChargeS = charge
    return
  }
  mine.assaultChargeS = 0
  const state = save.treasureMines
  if (!assaultHits(pullRoll(state, rolls))) return
  const count = assaultCrewCount(pullRoll(state, rolls))
  const taken = namesOnBoard(save)
  for (const other of state.mines) {
    for (const shadow of other.assaultParty ?? []) taken.add(shadow.name)
  }
  const party: TreasureShadow[] = []
  for (let i = 0; i < count; i += 1) {
    const shadow = makeShadow(save, mine.id, i, taken, () => pullRoll(state, rolls))
    shadow.id = `${mine.id}-assault-${i}`
    taken.add(shadow.name)
    party.push(shadow)
  }
  mine.assaultParty = party
  mine.assaultAvatarId = pickMineAvatarId(pullRoll(state, rolls))
  mine.assaultWarnAtS = save.elapsedS + TREASURE_ASSAULT_WARN_S
}

function beginIncomingFight(save: Save, mine: TreasureMine): void {
  const party = mine.assaultParty ?? []
  const workers = mine.crewIds
    .map((id) => save.workers.find((row) => row.id === id))
    .filter((row): row is Worker => row != null)
  if (!party.length || !workers.length) {
    clearAssault(mine)
    return
  }
  mine.shadows = party.map((shadow) => ({ ...shadow, hp: shadow.hpMax }))
  if (mine.assaultAvatarId) mine.ownerAvatarId = mine.assaultAvatarId
  mine.raid = openIncomingRaid(save, mine, workers, mine.fortified === true)
  mine.assaultWarnAtS = null
  mine.assaultParty = []
  mine.assaultChargeS = 0
}

function openIncomingRaid(save: Save, mine: TreasureMine, party: Worker[], fortified: boolean): TreasureRaid {
  const attackSlots = padSlots(party.map((worker) => worker.id), assaultSlotCount(party.length))
  const defendSlots = raidSlotSnapshot(mine.shadows.map((shadow) => shadow.id))
  const attackVitals = attackSlots.map((id) => {
    if (!id) return { hp: 0, hpMax: 0 }
    const worker = party.find((row) => row.id === id)
    if (!worker) return { hp: 0, hpMax: 0 }
    const vitals = fortifyVitals(attackerCombatVitals(save, worker, undefined), fortified)
    return { hp: Math.max(1, vitals.hp), hpMax: vitals.hpMax }
  })
  const defendVitals = defendSlots.map((id) => {
    if (!id) return { hp: 0, hpMax: 0 }
    const shadow = mine.shadows.find((row) => row.id === id)
    return { hp: Math.max(0, shadow?.hp ?? 0), hpMax: Math.max(0, shadow?.hpMax ?? 0) }
  })
  const raid: TreasureRaid = {
    queue: party.map((worker) => worker.id),
    attackSlots,
    defendSlots,
    attackSlotHp: attackVitals.map((row) => row.hp),
    attackSlotMax: attackVitals.map((row) => row.hpMax),
    defendSlotHp: defendVitals.map((row) => row.hp),
    defendSlotMax: defendVitals.map((row) => row.hpMax),
    garrison: mine.shadows.length,
    atkHp: 1,
    atkMax: 1,
    atkAtk: 1,
    atkSpd: 1,
    atkNext: save.elapsedS,
    defHp: 1,
    defAtk: 1,
    defSpd: 1,
    defNext: save.elapsedS,
    runes: {},
    phase: 'fighting',
    phaseStartedAtS: save.elapsedS,
    returning: [],
    stakeSand: 0,
    reinforced: false,
    incoming: true,
    fortified,
  }
  loadAttacker(save, raid, false)
  loadDefender(mine, raid, save.elapsedS)
  raid.atkNext = save.elapsedS + Math.max(1, raid.atkSpd)
  return raid
}

function padSlots(ids: readonly string[], count: number): (string | null)[] {
  const slots: (string | null)[] = []
  for (const id of ids) {
    if (slots.length >= count) break
    if (id) slots.push(id)
  }
  while (slots.length < count) slots.push(null)
  return slots
}

/** 守住：立刻结束，不走行军。存活的人继续开采，倒地的回休息队尾。 */
function resolveIncomingHold(save: Save, mine: TreasureMine, raid: TreasureRaid): void {
  if (raid.queue[0]) writeAttackerHp(save, raid)
  const survivors = raid.queue.filter((id) => save.workers.some((worker) => worker.id === id))
  const downed = [...(raid.returning ?? [])]
  mine.raid = null
  mine.shadows = []
  mine.crewIds = survivors
  mine.digCharge = {}
  mine.fortified = false
  clearAssault(mine)
  addVault(save, 'sandGold', TREASURE_ASSAULT_LOOT)
  noteVault(mine.id, assaultLootTip(), 'ok')
  for (const row of downed) {
    if (row.reason === 'down') applyDownedReturn(save, row.id, row.hp, save.lastTick || 0)
    else {
      const worker = save.workers.find((workerRow) => workerRow.id === row.id)
      if (worker) worker.assignment = null
    }
    sendWorkerToRestTail(save, row.id)
  }
}

/** 溃退走完：洞交给剩下的来袭影子，我方工人排到休息队尾。宝库不动。 */
function finishIncomingLoss(save: Save, mine: TreasureMine, raid: TreasureRaid): void {
  const ids: string[] = []
  const pushId = (id: string | null | undefined) => {
    if (id && !ids.includes(id)) ids.push(id)
  }
  for (const id of mine.crewIds) pushId(id)
  for (const id of raid.queue) pushId(id)
  for (const id of raid.attackSlots ?? []) pushId(id)
  for (const row of raid.returning ?? []) pushId(row.id)
  const shadows = mine.shadows.map((shadow) => ({ ...shadow }))
  mine.raid = null
  mine.crewIds = []
  mine.digCharge = {}
  mine.owner = shadows.length ? 'shadow' : 'empty'
  mine.shadows = shadows
  mine.fortified = false
  clearAssault(mine)
  for (const id of ids) {
    const worker = save.workers.find((row) => row.id === id)
    if (worker && worker.assignment !== null) worker.assignment = null
    offerRestFood(save, id, save.lastTick || 0)
    sendWorkerToRestTail(save, id)
  }
}

function pushRaidReturn(
  raid: TreasureRaid,
  workerId: string,
  hp: number,
  atS: number,
  reason: 'down' | 'win' | 'lose',
  dur: number,
): void {
  if (!raid.returning) raid.returning = []
  if (raid.returning.some((row) => row.id === workerId)) return
  raid.returning.push({
    id: workerId,
    untilS: atS + dur,
    startedAtS: atS,
    hp,
    reason,
  })
}

function settleRaidReturns(save: Save, raid: TreasureRaid): void {
  const pending = raid.returning ?? []
  if (!pending.length) return
  const stay: TreasureRaidReturnee[] = []
  const arrived: string[] = []
  for (const row of pending) {
    if (save.elapsedS < row.untilS) {
      stay.push(row)
      continue
    }
    if (row.reason === 'down') applyDownedReturn(save, row.id, row.hp, save.lastTick)
    else {
      const worker = save.workers.find((workerRow) => workerRow.id === row.id)
      if (worker) worker.assignment = null
    }
    arrived.push(row.id)
  }
  raid.returning = stay
  for (const id of arrived) offerRestFood(save, id, save.lastTick || 0)
}

function beginRaidHome(save: Save, mine: TreasureMine, outcome: 'win' | 'lose', atS: number): void {
  const raid = mine.raid
  if (!raid) return
  settleRaidStake(save, mine, outcome)
  const dur = marchDurationS(save)
  raid.phase = outcome === 'win' ? 'marchHomeWin' : 'marchHomeLose'
  raid.phaseStartedAtS = atS
  raid.phaseEndsAtS = atS + dur
  if (outcome === 'win') raid.victors = [...raid.queue]
  raid.atkNext = Number.POSITIVE_INFINITY
  raid.defNext = Number.POSITIVE_INFINITY
}

function finishRaidHome(save: Save, mine: TreasureMine, raid: TreasureRaid): void {
  settleRaidReturns(save, raid)
  if ((raid.returning ?? []).some((row) => row.untilS > save.elapsedS)) return
  if (save.elapsedS < (raid.phaseEndsAtS ?? 0)) return
  if (raid.phase === 'marchHomeWin') {
    raid.queue = (raid.victors ?? raid.queue).filter((id) => save.workers.some((worker) => worker.id === id))
    takeOver(save, mine, raid)
    return
  }
  if (raid.incoming) {
    finishIncomingLoss(save, mine, raid)
    return
  }
  const ids = [...raid.queue]
  for (const id of ids) {
    const worker = save.workers.find((row) => row.id === id)
    sendHome(save, id, worker?.hp ?? 0)
  }
  mine.raid = null
  for (const id of ids) offerRestFood(save, id)
}

function stepRaid(save: Save, mine: TreasureMine): void {
  const raid = mine.raid
  if (!raid) return
  settleRaidReturns(save, raid)
  const phase = raidPhaseOf(raid)
  if (phase === 'marchOut') {
    if (save.elapsedS < (raid.phaseEndsAtS ?? 0)) return
    armRaidFight(save, mine, raid, raid.phaseEndsAtS ?? save.elapsedS)
  }
  if (raid.phase === 'marchHomeWin' || raid.phase === 'marchHomeLose') {
    finishRaidHome(save, mine, raid)
    return
  }
  if (raidPhaseOf(raid) !== 'fighting') return
  let guard = 0
  while (raid.queue.length && mine.shadows.length && guard++ < 64) {
    if (raid.atkNext > save.elapsedS && raid.defNext > save.elapsedS) return
    if (raid.atkNext <= raid.defNext) {
      if (raid.atkNext > save.elapsedS) return
      const atS = raid.atkNext
      const shadow = mine.shadows[0]
      const dealt = strikeDamage(raid.atkAtk, runeDealMul(raid.runes[raid.queue[0]]), runeTakenMul(shadow.runeId))
      shadow.hp -= dealt
      raid.defHp = shadow.hp
      raid.atkNext = atS + raid.atkSpd
        if (shadow.hp <= 0) {
          mine.shadows.shift()
          delete mine.digCharge[shadow.id]
          if (!mine.shadows.length) {
            if (raid.incoming) {
              resolveIncomingHold(save, mine, raid)
              return
            }
            beginRaidHome(save, mine, 'win', atS)
            finishRaidHome(save, mine, raid)
            return
          }
        loadDefender(mine, raid, atS)
      }
    } else {
      if (raid.defNext > save.elapsedS) return
      const atS = raid.defNext
      const dealt = strikeDamage(raid.defAtk, runeDealMul(mine.shadows[0]?.runeId), runeTakenMul(raid.runes[raid.queue[0]]))
      raid.atkHp -= dealt
      writeAttackerHp(save, raid)
      raid.defNext = atS + raid.defSpd
      if (raid.atkHp <= 0) {
        const fallen = raid.queue.shift()
        if (fallen) {
          const worker = save.workers.find((row) => row.id === fallen)
          pushRaidReturn(raid, fallen, 0, atS, 'down', marchDurationS(save))
          if (worker) worker.hp = 0
        }
        if (!raid.queue.length) {
          beginRaidHome(save, mine, 'lose', atS)
          finishRaidHome(save, mine, raid)
          return
        }
        loadAttacker(save, raid, false)
        raid.atkNext = atS + Math.max(1, raid.atkSpd)
      }
    }
  }
  if (!mine.shadows.length && mine.raid && raidPhaseOf(mine.raid) === 'fighting') {
    if (mine.raid.incoming) {
      resolveIncomingHold(save, mine, mine.raid)
      return
    }
    beginRaidHome(save, mine, 'win', save.elapsedS)
    finishRaidHome(save, mine, mine.raid)
  } else if (mine.raid && !mine.raid.queue.length && raidPhaseOf(mine.raid) === 'fighting') {
    beginRaidHome(save, mine, 'lose', save.elapsedS)
    finishRaidHome(save, mine, mine.raid)
  }
}

function takeOver(save: Save, mine: TreasureMine, raid: TreasureRaid): void {
  const lead = raid.queue[0]
  mine.owner = 'player'
  mine.shadows = []
  mine.crewIds = raid.queue.filter((id) => save.workers.some((worker) => worker.id === id))
  mine.raid = null
  mine.digCharge = {}
  clearAssault(mine)
  mine.fortified = false
  const worker = lead ? save.workers.find((row) => row.id === lead) : undefined
  if (worker && raid.atkMax > 0 && raid.atkHp > 0) {
    worker.hp = clampInt(Math.round((raid.atkHp / raid.atkMax) * worker.hpMax), 1, worker.hpMax)
  }
}

/** 整洞共用的开采进度，存在 `digCharge` 的这一格。 */
export const TREASURE_HOLE_DIG = 'hole'

function holeCharge(mine: TreasureMine): number {
  const raw = mine.digCharge[TREASURE_HOLE_DIG]
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, raw) : 0
}

function digRate(intervals: readonly number[]): number {
  return intervals.reduce((sum, intervalS) => sum + (intervalS > 0 ? 1 / intervalS : 0), 0)
}

/** 正在给这洞填条的个人间隔。人选与出货相同。 */
function diggingIntervals(save: Save, mine: TreasureMine): number[] | null {
  if (mine.owner === 'player' && !mine.raid) {
    const intervals: number[] = []
    for (const id of mine.crewIds) {
      const worker = save.workers.find((row) => row.id === id)
      if (!worker) continue
      const matched = workerMatchesMineWeakness(worker.combatAttrs, mine.weaknesses)
      intervals.push(mineDigIntervalS(worker.level, matched))
    }
    return intervals.length ? intervals : null
  }
  if (mine.owner !== 'shadow') return null
  const mining = mine.raid && raidPhaseOf(mine.raid) === 'fighting' ? mine.shadows.slice(1) : mine.shadows
  if (!mining.length) return null
  return mining.map((shadow) => mineDigIntervalS(shadow.level))
}

function stepDig(save: Save, mine: TreasureMine, onDrop?: TreasureDropSink, rolls?: number[]): void {
  const intervals = diggingIntervals(save, mine)
  if (!intervals || mine.reserve <= 0) return
  const rate = digRate(intervals)
  if (rate <= 0) return
  let charge = holeCharge(mine) + rate
  const paying = mine.owner === 'player'
  let guard = 0
  while (charge + 1e-9 >= 1 && mine.reserve > 0 && guard++ < 16) {
    charge -= 1
    mine.reserve -= 1
    if (!paying) continue
    grantPlayerDig(save, mine, onDrop, rolls)
  }
  mine.digCharge = { [TREASURE_HOLE_DIG]: charge < 1e-9 ? 0 : charge }
}

function giveHaul(
  save: Save,
  mine: TreasureMine,
  item: TreasureHaulId,
  qty: number,
  onDrop?: TreasureDropSink,
): void {
  addToBank(save, item, qty)
  const haul = save.treasureMines.haul
  haul[item] = (haul[item] ?? 0) + qty
  if (item === 'wildCrystal') mine.dugCrystal += qty
  else mine.dugOre += qty
  onDrop?.({ mineId: mine.id, item, qty })
}

function giveVault(save: Save, mine: TreasureMine, item: TreasureId, qty: number, onDrop?: TreasureDropSink): void {
  addVault(save, item, qty)
  onDrop?.({ mineId: mine.id, item, qty })
}

/** 我方挖满 1 份。旧洞只掉 1 件宝物；新洞必出矿石，再掷荒晶和宝物。 */
function grantPlayerDig(save: Save, mine: TreasureMine, onDrop: TreasureDropSink | undefined, rolls?: number[]): void {
  const state = save.treasureMines
  if (typeof mine.dugOre !== 'number') mine.dugOre = 0
  if (typeof mine.dugCrystal !== 'number') mine.dugCrystal = 0
  if (isLegacyTreasureMine(mine)) {
    const item = rollTreasureDrop(mine.kind ?? 'sandGold', pullRoll(state, rolls))
    giveVault(save, mine, item, 1, onDrop)
    return
  }
  if (mine.bounty === 'wildCrystal') {
    giveHaul(save, mine, 'wildCrystal', TREASURE_BOUNTY_YIELD, onDrop)
    giveHaul(save, mine, 'ore', 1, onDrop)
  } else {
    const vein = isMineVein(mine.vein) ? mine.vein : 'copper'
    const qty = mine.bounty ? TREASURE_BOUNTY_YIELD : 1
    giveHaul(save, mine, MINE_VEIN_ORE[vein], qty, onDrop)
    if (pullRoll(state, rolls) < TREASURE_ORE_CRYSTAL_CHANCE) {
      giveHaul(save, mine, 'wildCrystal', 1, onDrop)
    }
  }
  if (pullRoll(state, rolls) < TREASURE_ORE_VAULT_CHANCE) {
    giveVault(save, mine, rollOreVaultTreasure(pullRoll(state, rolls)), 1, onDrop)
  }
}

export type MineDigReadout = {
  /** 整洞进度 0～1。满 1 出 1 份。 */
  fill: number
  /** 整洞周期：1 / Σ(1/个人间隔)。进度条按这个速度插值。 */
  intervalS: number
  /** 与整洞周期相同，文案用「最快约 Ns/次」。 */
  fastestS: number
}

/**
 * 卡面开采读数，人选与 `stepDig` 相同。
 * 我方未抢夺且有编制；敌人驻守全员在挖，抢夺中只算非当前交战的守军。
 * 无人矿、我方抢夺中、没人在挖则不给。
 * 多人只加快同一条，满一次出 1 份。
 */
export function mineDigReadout(save: Save, mine: TreasureMine): MineDigReadout | null {
  const intervals = diggingIntervals(save, mine)
  if (!intervals) return null
  const rate = digRate(intervals)
  if (rate <= 0) return null
  const intervalS = 1 / rate
  return { fill: Math.min(1, holeCharge(mine)), intervalS, fastestS: intervalS }
}

/** 我方开采读数。无人矿、敌人驻守、抢夺中不给。 */
export function playerMineDigReadout(save: Save, mine: TreasureMine): MineDigReadout | null {
  if (mine.owner !== 'player') return null
  return mineDigReadout(save, mine)
}

/** 卡面上的开采速度。 */
export function mineDigSpeedLabel(fastestS: number): string {
  const shown = Number.isInteger(fastestS) ? String(fastestS) : fastestS.toFixed(1)
  return `最快约 ${shown}s/次`
}

export function nextMineRoll(state: { roll: number }): number {
  let seed = state.roll >>> 0
  if (seed === 0) seed = 1
  seed = (Math.imul(seed ^ (seed >>> 15), seed | 1) ^ (seed + Math.imul(seed ^ (seed >>> 7), seed | 61))) >>> 0
  state.roll = seed === 0 ? 1 : seed
  return state.roll / 4294967296
}

/** 新洞守军人数。roll 来自矿洞自己的 `nextMineRoll`：50% 0 人、20% 1 人、20% 2 人、10% 3 人。 */
export function shadowCrewCount(roll: number): number {
  if (roll < 0.5) return 0
  if (roll < 0.7) return 1
  if (roll < 0.9) return 2
  return 3
}

/** 来袭判定命中。roll 为 0～1。 */
export function assaultHits(roll: number): boolean {
  return roll < TREASURE_ASSAULT_CHANCE
}

/** 来袭人数。三段各约 1/3，对应 1、2、3 人。不会是 0。 */
export function assaultCrewCount(roll: number): number {
  if (roll < 1 / 3) return 1
  if (roll < 2 / 3) return 2
  return 3
}

export function assaultLootTip(qty = TREASURE_ASSAULT_LOOT): string {
  return `缴获砂金 +${qty}`
}

/** 有我方矿洞正在预警、还没开打。页签上的注意用这个。 */
export function treasureAssaultWarning(save: Save): boolean {
  const elapsed = save.elapsedS
  for (const mine of save.treasureMines?.mines ?? []) {
    if (mine.owner !== 'player' || mine.raid) continue
    if (typeof mine.assaultWarnAtS === 'number' && mine.assaultWarnAtS > elapsed) return true
  }
  return false
}

/**
 * 离线追赶结束：进行中的战斗留下，和平计时和还没开打的预警清掉。
 * 回来后从 0 重新累计，不补判离线那一段。
 */
export function resetTreasureAssaultAfterOffline(save: Save): void {
  const state = save.treasureMines
  if (!state?.mines) return
  for (const mine of state.mines) {
    mine.assaultChargeS = 0
    if (mine.raid) continue
    mine.assaultWarnAtS = null
    mine.assaultParty = []
    mine.assaultAvatarId = null
  }
}

function clearAssault(mine: TreasureMine): void {
  mine.assaultChargeS = 0
  mine.assaultWarnAtS = null
  mine.assaultParty = []
  mine.assaultAvatarId = null
}

/** 来袭槽。1～2 人补到 3，方便增援；3 人以上按实际人数，最多跟开采上限一样。 */
function assaultSlotCount(partySize: number): number {
  const cap = TREASURE_CREW_CAP + TREASURE_BANNER_CREW_LEVELS.length
  return Math.min(cap, Math.max(TREASURE_RAID_CAP, Math.floor(partySize)))
}

function keptAssaultCharge(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return 0
  return Math.min(TREASURE_ASSAULT_INTERVAL_S - 1, Math.floor(raw))
}

function keptAssaultParty(raw: unknown): TreasureShadow[] {
  if (!Array.isArray(raw)) return []
  const out: TreasureShadow[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const shadow = row as TreasureShadow
    if (typeof shadow.id !== 'string' || !shadow.id) continue
    if (typeof shadow.name !== 'string') continue
    out.push(shadow)
    if (out.length >= 3) break
  }
  return out
}

function pullRoll(state: TreasureMineState, rolls?: number[]): number {
  const next = rolls?.shift()
  if (typeof next === 'number' && Number.isFinite(next)) return next
  return nextMineRoll(state)
}

function fortifyVitals(vitals: { hp: number; hpMax: number }, fortified: boolean): { hp: number; hpMax: number } {
  if (!fortified) return vitals
  const hpMax = Math.max(1, Math.round(vitals.hpMax * TREASURE_FORTIFY_HP_MUL))
  if (vitals.hp <= 0) return { hp: 0, hpMax }
  return { hp: Math.min(hpMax, Math.max(1, Math.round(vitals.hp * TREASURE_FORTIFY_HP_MUL))), hpMax }
}

function spawnMine(save: Save, elapsed: number, rolls?: number[]): TreasureMine {
  const state = save.treasureMines
  const id = `mine-${state.nextId}`
  state.nextId += 1
  const bounty = state.bounty
  if (bounty) state.bounty = null
  const vein = bounty == null ? mineVeinOfRoll(pullRoll(state, rolls)) : bounty === 'wildCrystal' ? null : bounty
  const count = bounty ? bountyCrewCount(pullRoll(state, rolls)) : shadowCrewCount(pullRoll(state, rolls))
  const levelBonus = bounty ? TREASURE_BOUNTY_LEVEL_BONUS : 0
  const taken = namesOnBoard(save)
  const shadows: TreasureShadow[] = []
  for (let i = 0; i < count; i += 1) {
    const shadow = makeShadow(save, id, i, taken, () => pullRoll(state, rolls), levelBonus)
    taken.add(shadow.name)
    shadows.push(shadow)
  }
  const reserveMax = bounty
    ? Math.round(bannerReserveMax(bannerLevelOf(save)) * TREASURE_BOUNTY_RESERVE_MUL)
    : bannerReserveMax(bannerLevelOf(save))
  return {
    id,
    kind: null,
    vein,
    bounty,
    dugOre: 0,
    dugCrystal: 0,
    reserve: reserveMax,
    reserveMax,
    bornAtS: elapsed,
    expiresAtS: elapsed + TREASURE_LIFE_S,
    owner: count > 0 ? 'shadow' : 'empty',
    ownerAvatarId: count > 0 ? pickMineAvatarId(pullRoll(state, rolls)) : stableMineAvatarId(id),
    crewIds: [],
    shadows,
    weaknesses: pickEnemyWeaknesses(hashString(id), 0, 'minion'),
    revealedWeaknesses: [],
    raid: null,
    digCharge: {},
    assaultChargeS: 0,
    assaultWarnAtS: null,
    assaultParty: [],
    assaultAvatarId: null,
    fortified: false,
  }
}

function mineWeaknessesOf(mine: TreasureMine): CombatAttrId[] {
  const kept = (mine.weaknesses ?? []).filter(isCombatAttrId)
  if (kept.length) return kept
  return pickEnemyWeaknesses(hashString(mine.id), 0, 'minion')
}

function keptRevealedWeaknesses(mine: TreasureMine): CombatAttrId[] {
  const trueSet = new Set(mine.weaknesses)
  const raw = mine.revealedWeaknesses
  if (!Array.isArray(raw)) return []
  const out: CombatAttrId[] = []
  const seen = new Set<CombatAttrId>()
  for (const id of raw) {
    if (!isCombatAttrId(id) || !trueSet.has(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/** 把工人属性里命中的矿洞弱点记进已揭开。不改开采加速。 */
export function revealMineWeaknesses(mine: TreasureMine, attrs: readonly CombatAttrId[] | undefined): void {
  if (!Array.isArray(mine.revealedWeaknesses)) mine.revealedWeaknesses = []
  for (const id of matchingWeaknesses(attrs ?? [], mine.weaknesses ?? [])) {
    if (mine.revealedWeaknesses.includes(id)) continue
    mine.revealedWeaknesses.push(id)
  }
}

/** 卡面弱点行。长度跟真实弱点表一致，没揭开的是 null，图标显示问号。 */
export function mineWeaknessSlots(mine: TreasureMine): Array<CombatAttrId | null> {
  const revealed = new Set(Array.isArray(mine.revealedWeaknesses) ? mine.revealedWeaknesses : [])
  return (mine.weaknesses ?? []).filter(isCombatAttrId).map((id) => (revealed.has(id) ? id : null))
}

function makeShadow(
  save: Save,
  mineId: string,
  index: number,
  taken: ReadonlySet<string>,
  pull: () => number = () => nextMineRoll(save.treasureMines),
  levelBonus = 0,
): TreasureShadow {
  const tier = (3 + ((save.treasureMines.nextId + index) % 3)) as QualityTier
  const runeId = SHADOW_RUNES[(save.knightLevel + index) % SHADOW_RUNES.length]
  const name = pickSnapshotPlayerName(pull(), taken)
  const fake = {
    id: `${mineId}-shadow-${index}`,
    qualityTier: tier,
    assignment: null,
    foodSlot: null,
    hp: 1,
    hpMax: 1,
    level: Math.max(1, save.knightLevel) + bannerLevelOf(save) + Math.max(0, levelBonus),
    xp: 0,
    combatAttrs: [],
    fatigueDebt: 0,
    isNew: false,
  } satisfies Worker
  const stats = workerLiveStats(fake, save, runeId)
  const spd = Math.max(1, Math.round(stats.spd * runeSpdMul(runeId)))
  return {
    id: fake.id,
    name,
    level: fake.level,
    hp: stats.hp,
    hpMax: stats.hp,
    atk: Math.max(1, stats.atk),
    spd,
    runeId,
  }
}

/** 开战槽位快照。不足 3 个用 null 补空，多出来的丢掉。 */
export function raidSlotSnapshot(ids: readonly string[]): (string | null)[] {
  const slots: (string | null)[] = []
  for (const id of ids) {
    if (slots.length >= TREASURE_RAID_CAP) break
    slots.push(id)
  }
  while (slots.length < TREASURE_RAID_CAP) slots.push(null)
  return slots
}

function normalizeRaidSlots(raw: unknown, fallback: readonly string[], count = TREASURE_RAID_CAP): (string | null)[] {
  const len = Math.max(TREASURE_RAID_CAP, Math.floor(count))
  if (!Array.isArray(raw)) return padSlots(fallback, len)
  const slots = raw.slice(0, len).map((id) => (typeof id === 'string' && id ? id : null))
  while (slots.length < len) slots.push(null)
  return slots
}

function isVitalRow(raw: unknown, count: number): raw is number[] {
  return (
    Array.isArray(raw) &&
    raw.length === count &&
    raw.every((n) => typeof n === 'number' && Number.isFinite(n))
  )
}

/** 与 `loadAttacker` 同一套战斗血。工坊 `worker.hp` 按比例换算，不直接加进血条。 */
function attackerCombatVitals(
  save: Save,
  worker: Worker,
  runeId: RuneItemId | undefined,
): { hp: number; hpMax: number } {
  const stats = workerLiveStats(worker, save, runeId)
  const hpMax = Math.max(1, stats.hp)
  const hp = worker.hp <= 0 ? 0 : worker.hpMax > 0 ? Math.round((worker.hp / worker.hpMax) * hpMax) : hpMax
  return { hp, hpMax }
}

function ensureRaidVitals(save: Save, mine: TreasureMine): void {
  const raid = mine.raid
  if (!raid) return
  if (!raid.runes || typeof raid.runes !== 'object') raid.runes = {}
  const attackLen = raid.attackSlots?.length ?? TREASURE_RAID_CAP
  const defendLen = raid.defendSlots?.length ?? TREASURE_RAID_CAP
  if (!isVitalRow(raid.attackSlotHp, attackLen) || !isVitalRow(raid.attackSlotMax, attackLen)) {
    const hp: number[] = []
    const max: number[] = []
    for (let i = 0; i < attackLen; i += 1) {
      const id = raid.attackSlots[i]
      const worker = id ? save.workers.find((row) => row.id === id) : undefined
      if (!id || !worker) {
        hp.push(0)
        max.push(0)
        continue
      }
      const vitals = fortifyVitals(attackerCombatVitals(save, worker, raid.runes[id]), raid.fortified === true)
      max.push(vitals.hpMax)
      if (!raid.queue.includes(id)) hp.push(0)
      else if (id === raid.queue[0]) hp.push(Math.max(0, raid.atkHp))
      else hp.push(vitals.hp)
    }
    raid.attackSlotHp = hp
    raid.attackSlotMax = max
  }
  if (!isVitalRow(raid.defendSlotHp, defendLen) || !isVitalRow(raid.defendSlotMax, defendLen)) {
    const hp: number[] = []
    const max: number[] = []
    for (let i = 0; i < defendLen; i += 1) {
      const id = raid.defendSlots[i]
      const shadow = id ? mine.shadows.find((row) => row.id === id) : undefined
      if (!id || !shadow) {
        hp.push(0)
        max.push(0)
        continue
      }
      max.push(Math.max(0, shadow.hpMax))
      hp.push(id === mine.shadows[0]?.id ? Math.max(0, raid.defHp) : Math.max(0, shadow.hp))
    }
    raid.defendSlotHp = hp
    raid.defendSlotMax = max
  }
}

function loadAttacker(save: Save, raid: TreasureRaid, armNext: boolean): void {
  const worker = save.workers.find((row) => row.id === raid.queue[0])
  if (!worker) return
  const runeId = raid.runes[worker.id]
  const stats = workerLiveStats(worker, save, runeId)
  const vitals = fortifyVitals(attackerCombatVitals(save, worker, runeId), raid.fortified === true)
  raid.atkMax = vitals.hpMax
  raid.atkHp = Math.max(1, vitals.hp)
  raid.atkAtk = Math.max(1, stats.atk)
  raid.atkSpd = Math.max(1, Math.round(stats.spd * runeSpdMul(runeId)))
  if (armNext) raid.atkNext = save.elapsedS + raid.atkSpd
}

function loadDefender(mine: TreasureMine, raid: TreasureRaid, elapsed: number | null): void {
  const shadow = mine.shadows[0]
  if (!shadow) return
  raid.defHp = Math.max(0, shadow.hp)
  raid.defAtk = shadow.atk
  raid.defSpd = Math.max(1, shadow.spd)
  if (elapsed != null) raid.defNext = elapsed + raid.defSpd
}

function writeAttackerHp(save: Save, raid: TreasureRaid): void {
  const worker = save.workers.find((row) => row.id === raid.queue[0])
  if (!worker) return
  const ratio = raid.atkMax > 0 ? Math.max(0, raid.atkHp) / raid.atkMax : 0
  worker.hp = raid.atkHp <= 0 ? 0 : clampInt(Math.round(ratio * worker.hpMax), 1, worker.hpMax)
}

function sendHome(save: Save, workerId: string, hp: number): void {
  const worker = save.workers.find((row) => row.id === workerId)
  if (worker) {
    worker.assignment = null
    worker.hp = clampInt(hp, 0, worker.hpMax)
  }
  for (const mine of save.treasureMines.mines) {
    mine.crewIds = mine.crewIds.filter((id) => id !== workerId)
    delete mine.digCharge[workerId]
  }
  offerRestFood(save, workerId)
}

function keptStake(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return 0
  return Math.floor(raw)
}

/** 胜退、负没收、洞没了还没分出胜负则退。只结一次。 */
function settleRaidStake(save: Save, mine: TreasureMine, outcome: 'win' | 'lose' | 'abort'): void {
  const raid = mine.raid
  if (!raid) return
  const stake = keptStake(raid.stakeSand)
  raid.stakeSand = 0
  if (stake <= 0) return
  if (outcome === 'lose') {
    noteVault(mine.id, STAKE_FORFEIT_TIP, 'err')
    return
  }
  addVault(save, 'sandGold', stake)
  noteVault(mine.id, stakeRefundTip(stake), 'ok')
}

function releaseRaid(save: Save, mine: TreasureMine): void {
  if (mine.raid && keptStake(mine.raid.stakeSand) > 0) settleRaidStake(save, mine, 'abort')
  const raid = mine.raid
  mine.raid = null
  if (!raid) return
  if (raid.queue[0]) writeAttackerHp(save, raid)
  for (const id of [...raid.queue]) {
    const worker = save.workers.find((row) => row.id === id)
    sendHome(save, id, worker?.hp ?? 0)
  }
  for (const row of raid.returning ?? []) {
    if (row.reason === 'down') applyDownedReturn(save, row.id, row.hp, save.lastTick || 0)
    else sendHome(save, row.id, row.hp)
  }
}

function findMine(save: Save, mineId: string): TreasureMine | undefined {
  return ensureTreasureMines(save).mines.find((mine) => mine.id === mineId)
}

function strikeDamage(atk: number, deal: number, taken: number): number {
  return Math.max(1, Math.round(atk * deal * taken))
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.floor(value)))
}
