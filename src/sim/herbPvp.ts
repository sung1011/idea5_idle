import { addToBank } from './bank'
import { applyDownedReturn, isWorkerInCombat, workerLiveStats } from './combat'
import { scaledAttackDamage } from './combatAttrs'
import { offerRestFood } from './food'
import { isWorkerInHerbPvp } from './herbPvpQuery'
import { pushMessage } from './messages'
import { pickMineAvatarId, pickSnapshotPlayerName, addVault } from './treasureMine'
import { treasureMineBlockReason } from './treasureMineQuery'
import { HERBALISM_DROP_TABLE, ITEM_DEF } from './tables'
import type {
  ActionResult,
  HerbOfflineNote,
  HerbPlot,
  HerbPlotKind,
  HerbPvpState,
  HerbRival,
  ItemId,
  QualityTier,
  Save,
  Worker,
} from './types'
import { isFullWorkshopHp } from './workshopHp'

/** 一组固定 49 个假玩家，加上玩家共 50 人。 */
export const HERB_PVP_RIVAL_COUNT = 49
export const HERB_PVP_MAP_SIZE = 8
export const HERB_PVP_PLOT_COUNT = HERB_PVP_MAP_SIZE * HERB_PVP_MAP_SIZE
/** 一块地 3 分钟。 */
export const HERB_PVP_WEED_S = 3 * 60
/** 玩家同时最多占 3 块，每块 1 人。 */
export const HERB_PVP_PLAYER_CAP = 3
export const HERB_PVP_STAMINA_MAX = 10
/** 每 30 分钟回 1 点体力，离线也走。 */
export const HERB_PVP_STAMINA_REGEN_S = 30 * 60

export const HERB_PVP_BARREN_P = 0.35
export const HERB_PVP_COMMON_P = 0.4
export const HERB_PVP_PRECIOUS_P = 0.15
export const HERB_PVP_PROBE_P = 0.1
export const HERB_PVP_PROBE_P1 = 0.05
export const HERB_PVP_PROBE_P2 = 0.03
export const HERB_PVP_PROBE_P4 = 0.02
export const HERB_PVP_COMMON_QTY_MIN = 1
export const HERB_PVP_COMMON_QTY_MAX = 3
export const HERB_PVP_PRECIOUS_LOW_P = 0.6
export const HERB_PVP_PRECIOUS_MID_P = 0.3
export const HERB_PVP_PRECIOUS_LOW_SCORE = 20
export const HERB_PVP_PRECIOUS_MID_SCORE = 40
export const HERB_PVP_PRECIOUS_HIGH_SCORE = 80

/** 同时在线 0～5。每人一次在线 10～30 分钟，占 1～3 块。 */
export const HERB_PVP_RIVAL_ONLINE_MAX = 5
export const HERB_PVP_SESSION_MIN_S = 10 * 60
export const HERB_PVP_SESSION_MAX_S = 30 * 60
export const HERB_PVP_RIVAL_PLOTS_MIN = 1
export const HERB_PVP_RIVAL_PLOTS_MAX = 3
export const HERB_PVP_TARGET_REROLL_S = 10 * 60
/** 下线后休息 2～8 小时再来。 */
export const HERB_PVP_RIVAL_REST_MIN_S = 2 * 3600
export const HERB_PVP_RIVAL_REST_MAX_S = 8 * 3600
/**
 * 玩家正在除草、且有假玩家在线时，平均约 90 分钟才判定一次撞车。
 * 假玩家不是一直在线，落到玩家身上大约是几小时一两次。
 */
export const HERB_PVP_BUMP_MEAN_S = 90 * 60

const BEIJING_SHIFT_MS = 8 * 3600 * 1000

export type HerbRankReward = {
  label: string
  maxRank: number
  sandGold: number
  jewel: number
  jade: number
  probe1: number
  probe2: number
  probe4: number
}

/**
 * 日结五档。第 1 名砂金大约两次守洞缴获（30）再多一点，仍低于刷新价 100；
 * 古玉远低于战旗第一档 150，珠宝低于加固 60。名次越低越少，五档都有砂金、珠宝、古玉和至少 1 个侦测。
 */
export const HERB_PVP_RANK_REWARDS: readonly HerbRankReward[] = [
  { label: '第1名', maxRank: 1, sandGold: 80, jewel: 24, jade: 6, probe1: 2, probe2: 1, probe4: 1 },
  { label: '第2–3名', maxRank: 3, sandGold: 48, jewel: 14, jade: 3, probe1: 1, probe2: 1, probe4: 1 },
  { label: '第4–10名', maxRank: 10, sandGold: 28, jewel: 8, jade: 2, probe1: 1, probe2: 1, probe4: 0 },
  { label: '第11–25名', maxRank: 25, sandGold: 14, jewel: 4, jade: 1, probe1: 1, probe2: 0, probe4: 0 },
  { label: '第26–50名', maxRank: 50, sandGold: 6, jewel: 2, jade: 1, probe1: 1, probe2: 0, probe4: 0 },
]

export type HerbRankRow = {
  id: string
  name: string
  avatarId: string
  score: number
  rank: number
  self: boolean
}

export type HerbPvpNotice = { text: string; kind: 'ok' | 'err' }

const notices: HerbPvpNotice[] = []
let herbRollOverride: (() => number) | null = null

/** 测试用。测完必须传 null。 */
export function setHerbRollOverride(fn: (() => number) | null): void {
  herbRollOverride = fn
}

export function takeHerbPvpNotices(): HerbPvpNotice[] {
  if (!notices.length) return []
  return notices.splice(0, notices.length)
}

function note(text: string, kind: HerbPvpNotice['kind'], offline: boolean): void {
  if (offline) return
  notices.push({ text, kind })
}

function finite(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.floor(value)
}

function clampCount(value: unknown, fallback: number): number {
  return Math.max(0, finite(value, fallback))
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  if (value >= 1) return 0.999999
  return value
}

function nextHerbRoll(state: HerbPvpState): number {
  if (herbRollOverride) return clamp01(herbRollOverride())
  let seed = state.roll >>> 0
  if (seed === 0) seed = 1
  seed = (Math.imul(seed ^ (seed >>> 15), seed | 1) ^ (seed + Math.imul(seed ^ (seed >>> 7), seed | 61))) >>> 0
  state.roll = seed === 0 ? 1 : seed
  return state.roll / 4294967296
}

function intBetween(state: HerbPvpState, min: number, max: number): number {
  const span = Math.max(1, max - min + 1)
  return min + Math.min(span - 1, Math.floor(nextHerbRoll(state) * span))
}

/** 北京时间日期。没有夏令时，固定东八区。 */
export function beijingDayKey(epochMs: number): string {
  if (!Number.isFinite(epochMs)) return '1970-01-01'
  const shifted = new Date(epochMs + BEIJING_SHIFT_MS)
  const y = shifted.getUTCFullYear()
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const d = String(shifted.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function beijingDayRemainS(epochMs: number): number {
  if (!Number.isFinite(epochMs)) return 0
  const shifted = epochMs + BEIJING_SHIFT_MS
  const day = 86400000
  const into = ((shifted % day) + day) % day
  return Math.max(0, Math.ceil((day - into) / 1000))
}

export function formatHerbDuration(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds))
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

/** 0～1 的一掷落到地块种类。侦测再按 5% / 3% / 2% 分成 1 / 2 / 4 格。 */
export function classifyHerbRoll(roll: number): { kind: HerbPlotKind; probeSize: 1 | 2 | 4 | null } {
  const r = clamp01(roll)
  const band = Math.min(999, Math.floor(r * 1000 + 1e-9))
  const barren = Math.round(HERB_PVP_BARREN_P * 1000)
  const common = barren + Math.round(HERB_PVP_COMMON_P * 1000)
  const precious = common + Math.round(HERB_PVP_PRECIOUS_P * 1000)
  const probe1 = precious + Math.round(HERB_PVP_PROBE_P1 * 1000)
  const probe2 = probe1 + Math.round(HERB_PVP_PROBE_P2 * 1000)
  if (band < barren) return { kind: 'barren', probeSize: null }
  if (band < common) return { kind: 'common', probeSize: null }
  if (band < precious) return { kind: 'precious', probeSize: null }
  if (band < probe1) return { kind: 'probe', probeSize: 1 }
  if (band < probe2) return { kind: 'probe', probeSize: 2 }
  return { kind: 'probe', probeSize: 4 }
}

export function herbPreciousOf(roll: number): { tier: 'low' | 'mid' | 'high'; score: number } {
  const r = clamp01(roll)
  if (r < HERB_PVP_PRECIOUS_LOW_P) return { tier: 'low', score: HERB_PVP_PRECIOUS_LOW_SCORE }
  if (r < HERB_PVP_PRECIOUS_LOW_P + HERB_PVP_PRECIOUS_MID_P) return { tier: 'mid', score: HERB_PVP_PRECIOUS_MID_SCORE }
  return { tier: 'high', score: HERB_PVP_PRECIOUS_HIGH_SCORE }
}

export function herbCommonQty(roll: number): number {
  const span = HERB_PVP_COMMON_QTY_MAX - HERB_PVP_COMMON_QTY_MIN + 1
  return HERB_PVP_COMMON_QTY_MIN + Math.min(span - 1, Math.floor(clamp01(roll) * span))
}

/** 工坊采药掉落表里的产物。现表草和香料从 1 级就在，没有再按站等级拆档。 */
export function unlockedHerbalismProducts(save: Save): { itemId: ItemId; weight: number }[] {
  const level = Math.max(1, Math.floor(save.stations?.herbalism?.stationLevel ?? 1))
  const rows = HERBALISM_DROP_TABLE.filter((row) => row.weight > 0 && level >= 1)
  if (!rows.length) return [{ itemId: 'herb', weight: 1 }]
  return rows.map((row) => ({ itemId: row.itemId, weight: row.weight }))
}

function pickProduct(products: { itemId: ItemId; weight: number }[], roll: number): ItemId {
  const total = products.reduce((sum, row) => sum + row.weight, 0)
  let cursor = clamp01(roll) * total
  for (const row of products) {
    cursor -= row.weight
    if (cursor < 0) return row.itemId
  }
  return products[products.length - 1]?.itemId ?? 'herb'
}

export function herbRankReward(rank: number): HerbRankReward {
  const safe = Math.min(HERB_PVP_RIVAL_COUNT + 1, Math.max(1, Math.floor(rank)))
  for (const row of HERB_PVP_RANK_REWARDS) {
    if (safe <= row.maxRank) return row
  }
  return HERB_PVP_RANK_REWARDS[HERB_PVP_RANK_REWARDS.length - 1]!
}

export function herbRewardLine(rank: number): string {
  const reward = herbRankReward(rank)
  const parts = [`砂金 ${reward.sandGold}`, `珠宝 ${reward.jewel}`, `古玉 ${reward.jade}`]
  if (reward.probe1 > 0) parts.push(`1格侦测 ×${reward.probe1}`)
  if (reward.probe2 > 0) parts.push(`2格侦测 ×${reward.probe2}`)
  if (reward.probe4 > 0) parts.push(`4格侦测 ×${reward.probe4}`)
  return `第${rank}名：${parts.join('、')}`
}

/** 以选中格为锚。2 格尽量向右，贴边就向左。4 格是 2×2，贴边就往里收。 */
export function herbProbeCells(anchor: number, size: 1 | 2 | 4): number[] {
  const index = Math.max(0, Math.min(HERB_PVP_PLOT_COUNT - 1, Math.floor(anchor)))
  const x = index % HERB_PVP_MAP_SIZE
  const y = Math.floor(index / HERB_PVP_MAP_SIZE)
  if (size === 1) return [index]
  if (size === 2) {
    const x2 = x < HERB_PVP_MAP_SIZE - 1 ? x + 1 : x - 1
    return [index, y * HERB_PVP_MAP_SIZE + x2]
  }
  const x0 = x < HERB_PVP_MAP_SIZE - 1 ? x : x - 1
  const y0 = y < HERB_PVP_MAP_SIZE - 1 ? y : y - 1
  return [
    y0 * HERB_PVP_MAP_SIZE + x0,
    y0 * HERB_PVP_MAP_SIZE + x0 + 1,
    (y0 + 1) * HERB_PVP_MAP_SIZE + x0,
    (y0 + 1) * HERB_PVP_MAP_SIZE + x0 + 1,
  ]
}

export function herbPlotLabel(plot: HerbPlot): string {
  if (plot.cleared) return '已除'
  if (!plot.revealed) return '杂草'
  if (plot.kind === 'barren') return '荒芜'
  if (plot.kind === 'common') {
    const label = plot.payload in ITEM_DEF ? ITEM_DEF[plot.payload as ItemId].label : '草药'
    return `${label} ×${plot.qty}`
  }
  if (plot.kind === 'precious') {
    const name = plot.payload === 'high' ? '高档' : plot.payload === 'mid' ? '中档' : '低档'
    return `${name} ${plot.qty}`
  }
  return `${plot.payload}格侦测`
}

export function herbPlotShort(plot: HerbPlot): string {
  if (plot.cleared) return '·'
  if (!plot.revealed) return '杂'
  if (plot.kind === 'barren') return '荒'
  if (plot.kind === 'common') return plot.payload === 'spice' ? `香${plot.qty}` : `草${plot.qty}`
  if (plot.kind === 'precious') return String(plot.qty)
  return `探${plot.payload}`
}

function blankPlot(index: number, kind: HerbPlotKind, payload: string, qty: number): HerbPlot {
  return {
    index,
    kind,
    payload,
    qty,
    revealed: false,
    cleared: false,
    weeder: null,
    workerId: null,
    progressS: 0,
  }
}

function rollOnePlot(state: HerbPvpState, index: number, products: { itemId: ItemId; weight: number }[]): HerbPlot {
  const classified = classifyHerbRoll(nextHerbRoll(state))
  if (classified.kind === 'barren') return blankPlot(index, 'barren', '', 0)
  if (classified.kind === 'common') {
    return blankPlot(index, 'common', pickProduct(products, nextHerbRoll(state)), herbCommonQty(nextHerbRoll(state)))
  }
  if (classified.kind === 'precious') {
    const precious = herbPreciousOf(nextHerbRoll(state))
    return blankPlot(index, 'precious', precious.tier, precious.score)
  }
  return blankPlot(index, 'probe', String(classified.probeSize ?? 1), 1)
}

function rollPlots(save: Save, state: HerbPvpState): HerbPlot[] {
  const products = unlockedHerbalismProducts(save)
  const plots: HerbPlot[] = []
  for (let index = 0; index < HERB_PVP_PLOT_COUNT; index += 1) plots.push(rollOnePlot(state, index, products))
  return plots
}

function rivalWorker(save: Save, rival: HerbRival): Worker {
  const tier = Math.min(10, Math.max(1, Math.floor(rival.qualityTier))) as QualityTier
  return {
    id: rival.id,
    qualityTier: tier,
    classId: 'herbalist',
    assignment: null,
    foodSlot: null,
    hp: 1,
    hpMax: 1,
    level: Math.max(1, Math.floor(save.knightLevel) || 1),
    xp: 0,
    combatAttrs: [],
    fatigueDebt: 0,
    isNew: false,
  }
}

function refreshRivalCombat(save: Save, rival: HerbRival): void {
  const stats = workerLiveStats(rivalWorker(save, rival), save)
  rival.hpMax = Math.max(1, stats.hp)
  rival.hp = rival.hpMax
  rival.atk = Math.max(1, stats.atk)
}

function createRivals(save: Save, state: HerbPvpState): HerbRival[] {
  const taken = new Set<string>()
  const rivals: HerbRival[] = []
  for (let i = 0; i < HERB_PVP_RIVAL_COUNT; i += 1) {
    const name = pickSnapshotPlayerName(nextHerbRoll(state), taken)
    taken.add(name)
    const rival: HerbRival = {
      id: `herb-rival-${i}`,
      name,
      avatarId: pickMineAvatarId(nextHerbRoll(state)),
      qualityTier: 1 + (i % 5),
      score: 0,
      hp: 1,
      hpMax: 1,
      atk: 1,
      nextOnlineAtS: save.elapsedS + Math.floor(nextHerbRoll(state) * (HERB_PVP_RIVAL_REST_MAX_S + 1)),
      onlineUntilS: null,
      plotCap: 0,
    }
    refreshRivalCombat(save, rival)
    rivals.push(rival)
  }
  return rivals
}

export function createHerbPvp(save: Save, now = Date.now()): HerbPvpState {
  const state: HerbPvpState = {
    roll: 1,
    dayKey: beijingDayKey(now),
    plots: [],
    rivals: [],
    stamina: HERB_PVP_STAMINA_MAX,
    staminaAccS: 0,
    probe1: 1,
    probe2: 1,
    probe4: 1,
    playerScore: 0,
    onlineTarget: 0,
    targetUntilS: save.elapsedS + HERB_PVP_TARGET_REROLL_S,
    lastRewardText: '',
    offline: null,
  }
  state.onlineTarget = Math.min(HERB_PVP_RIVAL_ONLINE_MAX, Math.floor(nextHerbRoll(state) * (HERB_PVP_RIVAL_ONLINE_MAX + 1)))
  state.rivals = createRivals(save, state)
  state.plots = rollPlots(save, state)
  return state
}

function isPlotKind(value: unknown): value is HerbPlotKind {
  return value === 'barren' || value === 'common' || value === 'precious' || value === 'probe'
}

function tidyState(save: Save, state: HerbPvpState, now: number): void {
  state.roll = finite(state.roll, 1) || 1
  if (typeof state.dayKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(state.dayKey)) state.dayKey = beijingDayKey(now)
  state.stamina = Math.min(HERB_PVP_STAMINA_MAX, clampCount(state.stamina, HERB_PVP_STAMINA_MAX))
  state.staminaAccS = Math.min(HERB_PVP_STAMINA_REGEN_S, clampCount(state.staminaAccS, 0))
  if (state.stamina >= HERB_PVP_STAMINA_MAX) state.staminaAccS = 0
  state.probe1 = clampCount(state.probe1, 1)
  state.probe2 = clampCount(state.probe2, 1)
  state.probe4 = clampCount(state.probe4, 1)
  state.playerScore = clampCount(state.playerScore, 0)
  state.onlineTarget = Math.min(HERB_PVP_RIVAL_ONLINE_MAX, clampCount(state.onlineTarget, 0))
  state.targetUntilS = Math.max(0, finite(state.targetUntilS, save.elapsedS))
  state.lastRewardText = typeof state.lastRewardText === 'string' ? state.lastRewardText : ''
  state.offline = null
  const rivalIds = new Set(state.rivals.map((rival) => rival.id))
  const workerIds = new Set(save.workers.map((worker) => worker.id))
  const seenWorkers = new Set<string>()
  let playerPlots = 0
  for (const plot of state.plots) {
    plot.revealed = plot.revealed === true
    plot.cleared = plot.cleared === true
    plot.qty = clampCount(plot.qty, 0)
    plot.payload = typeof plot.payload === 'string' ? plot.payload : ''
    plot.progressS = Math.max(0, finite(plot.progressS, 0))
    if (plot.cleared) {
      plot.weeder = null
      plot.workerId = null
      plot.progressS = 0
      continue
    }
    plot.weeder = typeof plot.weeder === 'string' && rivalIds.has(plot.weeder) ? plot.weeder : null
    const workerId = typeof plot.workerId === 'string' ? plot.workerId : ''
    if (!workerId || !workerIds.has(workerId) || seenWorkers.has(workerId) || playerPlots >= HERB_PVP_PLAYER_CAP) {
      plot.workerId = null
    } else {
      plot.workerId = workerId
      plot.weeder = null
      seenWorkers.add(workerId)
      playerPlots += 1
    }
    if (!plot.workerId && !plot.weeder) plot.progressS = 0
  }
  for (const rival of state.rivals) {
    if (typeof rival.avatarId !== 'string' || !rival.avatarId) rival.avatarId = 'helm'
    if (typeof rival.name !== 'string' || !rival.name) rival.name = '采药人'
    rival.score = clampCount(rival.score, 0)
    rival.qualityTier = Math.min(10, Math.max(1, finite(rival.qualityTier, 1)))
    rival.hpMax = Math.max(1, finite(rival.hpMax, 1))
    rival.hp = Math.min(rival.hpMax, Math.max(0, finite(rival.hp, rival.hpMax)))
    rival.atk = Math.max(1, finite(rival.atk, 1))
    rival.nextOnlineAtS = Math.max(0, finite(rival.nextOnlineAtS, 0))
    rival.onlineUntilS =
      typeof rival.onlineUntilS === 'number' && Number.isFinite(rival.onlineUntilS) ? rival.onlineUntilS : null
    rival.plotCap = Math.min(HERB_PVP_RIVAL_PLOTS_MAX + 1, clampCount(rival.plotCap, 0))
  }
}

export function hydrateHerbPvp(save: Save, now = save.lastTick || Date.now()): void {
  const raw = save.herbPvp as HerbPvpState | undefined
  const plotsOk = Array.isArray(raw?.plots) && raw.plots.length === HERB_PVP_PLOT_COUNT
  const rivalsOk = Array.isArray(raw?.rivals) && raw.rivals.length === HERB_PVP_RIVAL_COUNT
  if (!raw || !plotsOk || !rivalsOk || raw.plots.some((plot, index) => !plot || plot.index !== index || !isPlotKind(plot.kind))) {
    save.herbPvp = createHerbPvp(save, Date.now())
    return
  }
  if (raw.rivals.some((rival, index) => !rival || rival.id !== `herb-rival-${index}`)) {
    save.herbPvp = createHerbPvp(save, Date.now())
    return
  }
  tidyState(save, raw, now)
  save.herbPvp = raw
}

function ensureHerbPvp(save: Save, now = Date.now()): HerbPvpState {
  if (!save.herbPvp || save.herbPvp.plots?.length !== HERB_PVP_PLOT_COUNT || save.herbPvp.rivals?.length !== HERB_PVP_RIVAL_COUNT) {
    hydrateHerbPvp(save, now)
  }
  return save.herbPvp
}

function playerNameOf(save: Save): string {
  if (typeof save.playerName !== 'string') return '见习勇者'
  const trimmed = save.playerName.trim()
  return trimmed || '见习勇者'
}

export function herbLeaderboard(save: Save): HerbRankRow[] {
  const state = ensureHerbPvp(save)
  const rows: HerbRankRow[] = [
    {
      id: 'player',
      name: playerNameOf(save),
      avatarId: typeof save.playerAvatarId === 'string' ? save.playerAvatarId : 'helm',
      score: state.playerScore,
      rank: 0,
      self: true,
    },
  ]
  for (const rival of state.rivals) {
    rows.push({
      id: rival.id,
      name: rival.name,
      avatarId: rival.avatarId,
      score: rival.score,
      rank: 0,
      self: false,
    })
  }
  rows.sort((a, b) => b.score - a.score || Number(b.self) - Number(a.self) || (a.id < b.id ? -1 : 1))
  rows.forEach((row, index) => {
    row.rank = index + 1
  })
  return rows
}

export function herbPlayerRank(save: Save): number {
  return herbLeaderboard(save).find((row) => row.self)?.rank ?? HERB_PVP_RIVAL_COUNT + 1
}

export function herbHud(save: Save, now = Date.now()) {
  const state = ensureHerbPvp(save, now)
  return {
    stamina: state.stamina,
    staminaMax: HERB_PVP_STAMINA_MAX,
    staminaNextS: state.stamina >= HERB_PVP_STAMINA_MAX ? 0 : HERB_PVP_STAMINA_REGEN_S - state.staminaAccS,
    rank: herbPlayerRank(save),
    score: state.playerScore,
    dayRemainS: beijingDayRemainS(now),
    probe1: state.probe1,
    probe2: state.probe2,
    probe4: state.probe4,
    lastRewardText: state.lastRewardText,
    playerPlots: state.plots.filter((plot) => plot.workerId).length,
  }
}

function rememberHarvest(state: HerbPvpState, itemId: string, qty: number): void {
  const noteBag = state.offline
  if (!noteBag || qty <= 0) return
  noteBag.harvest[itemId] = (noteBag.harvest[itemId] ?? 0) + qty
}

function grantPlayerLoot(save: Save, plot: HerbPlot, offline: boolean): void {
  const state = save.herbPvp
  if (plot.kind === 'common' && plot.payload in ITEM_DEF && plot.qty > 0) {
    const itemId = plot.payload as ItemId
    addToBank(save, itemId, plot.qty)
    rememberHarvest(state, itemId, plot.qty)
    note(`获得 ${ITEM_DEF[itemId].label} ×${plot.qty}`, 'ok', offline)
    return
  }
  if (plot.kind === 'precious' && plot.qty > 0) {
    state.playerScore += plot.qty
    if (offline && state.offline) state.offline.score += plot.qty
    note(`珍贵草药 +${plot.qty}`, 'ok', offline)
    return
  }
  if (plot.kind === 'probe') {
    const size = plot.payload
    if (size === '4') {
      state.probe4 += 1
      if (offline && state.offline) state.offline.probe4 += 1
    } else if (size === '2') {
      state.probe2 += 1
      if (offline && state.offline) state.offline.probe2 += 1
    } else {
      state.probe1 += 1
      if (offline && state.offline) state.offline.probe1 += 1
    }
    note(`获得 ${size || '1'} 格侦测`, 'ok', offline)
    return
  }
  note('这块地下是荒芜', 'ok', offline)
}

function sendHerbWorkerHome(save: Save, worker: Worker): void {
  const now = save.lastTick || Date.now()
  if (worker.hp <= 0) {
    worker.hp = 0
    applyDownedReturn(save, worker.id, 0, now)
    return
  }
  offerRestFood(save, worker.id, now)
}

function finishPlot(save: Save, plot: HerbPlot, offline: boolean): void {
  const workerId = plot.workerId
  const rivalId = plot.weeder
  const snapshot = { kind: plot.kind, payload: plot.payload, qty: plot.qty }
  plot.cleared = true
  plot.weeder = null
  plot.workerId = null
  plot.progressS = 0
  if (workerId) {
    grantPlayerLoot(save, { ...plot, ...snapshot }, offline)
    const worker = save.workers.find((row) => row.id === workerId)
    if (worker) sendHerbWorkerHome(save, worker)
    return
  }
  if (rivalId && snapshot.kind === 'precious' && snapshot.qty > 0) {
    const rival = save.herbPvp.rivals.find((row) => row.id === rivalId)
    if (rival) rival.score += snapshot.qty
  }
}

function maybeRefreshMap(save: Save): void {
  const state = save.herbPvp
  if (!state.plots.every((plot) => plot.cleared)) return
  state.plots = rollPlots(save, state)
}

/** 一击伤害。采药不带符文、不打弱点，用战斗里同一套基础伤害。 */
export function herbStrikeDamage(atk: number): number {
  return scaledAttackDamage(atk, 1)
}

function exchangeBlow(
  attackerHp: number,
  attackerAtk: number,
  defenderHp: number,
  defenderAtk: number,
): { attackerHp: number; defenderHp: number; took: boolean } {
  const nextDefender = Math.max(0, defenderHp - herbStrikeDamage(attackerAtk))
  if (nextDefender <= 0) return { attackerHp, defenderHp: 0, took: true }
  const nextAttacker = Math.max(0, attackerHp - herbStrikeDamage(defenderAtk))
  return { attackerHp: nextAttacker, defenderHp: nextDefender, took: false }
}

function knockOutRival(state: HerbPvpState, rival: HerbRival, elapsed: number): void {
  for (const plot of state.plots) {
    if (plot.weeder !== rival.id) continue
    plot.weeder = null
    plot.progressS = 0
  }
  rival.hp = 0
  rival.onlineUntilS = null
  rival.plotCap = 0
  rival.nextOnlineAtS = elapsed + HERB_PVP_RIVAL_REST_MIN_S
}

function playerHitsRival(save: Save, plot: HerbPlot, worker: Worker, rival: HerbRival): ActionResult {
  const stats = workerLiveStats(worker, save)
  const blow = exchangeBlow(worker.hp, Math.max(1, stats.atk), Math.max(0, rival.hp), Math.max(1, rival.atk))
  worker.hp = blow.attackerHp
  rival.hp = blow.defenderHp
  if (blow.took) {
    plot.weeder = null
    plot.workerId = worker.id
    knockOutRival(save.herbPvp, rival, save.elapsedS)
    return { ok: true, message: `撞上${rival.name}，对方退走，接着除` }
  }
  sendHerbWorkerHome(save, worker)
  if (worker.hp <= 0) return { ok: true, message: `被${rival.name}打倒，回休息区` }
  return { ok: true, message: `没打退${rival.name}，工人回来了` }
}

function rivalHitsPlayer(save: Save, plot: HerbPlot, rival: HerbRival, offline: boolean): void {
  const worker = plot.workerId ? save.workers.find((row) => row.id === plot.workerId) : undefined
  if (!worker) {
    plot.workerId = null
    return
  }
  const stats = workerLiveStats(worker, save)
  const blow = exchangeBlow(Math.max(0, rival.hp), Math.max(1, rival.atk), worker.hp, Math.max(1, stats.atk))
  rival.hp = blow.attackerHp
  worker.hp = blow.defenderHp
  const bag = offline ? save.herbPvp.offline : null
  if (bag) bag.bumps += 1
  if (blow.took) {
    if (bag) bag.plotsLost += 1
    plot.workerId = null
    plot.weeder = rival.id
    if (rival.onlineUntilS == null || save.elapsedS >= rival.onlineUntilS) {
      const remain = Math.max(1, HERB_PVP_WEED_S - plot.progressS)
      rival.onlineUntilS = save.elapsedS + remain
      rival.plotCap = Math.max(rival.plotCap, heldPlots(save.herbPvp, rival.id).length)
    }
    sendHerbWorkerHome(save, worker)
    note(`被${rival.name}撞飞，这块地让出去了`, 'err', offline)
    return
  }
  if (rival.hp <= 0) {
    knockOutRival(save.herbPvp, rival, save.elapsedS)
    note(`还手打倒了${rival.name}`, 'ok', offline)
    return
  }
  note(`被${rival.name}撞了一下，还在除`, 'err', offline)
}

export function applyHerbRivalBump(save: Save, plotIndex: number, rivalId: string, offline = false): ActionResult {
  const state = ensureHerbPvp(save)
  const plot = state.plots[plotIndex]
  const rival = state.rivals.find((row) => row.id === rivalId)
  if (!plot || plot.cleared || !plot.workerId) return { ok: false, reason: '这块没有在除草' }
  if (!rival) return { ok: false, reason: '没有这个对手' }
  rivalHitsPlayer(save, plot, rival, offline)
  return { ok: true }
}

function freePlots(state: HerbPvpState): HerbPlot[] {
  return state.plots.filter((plot) => !plot.cleared && !plot.weeder && !plot.workerId)
}

function claimPlots(state: HerbPvpState, rival: HerbRival, count: number): void {
  const free = freePlots(state)
  let left = count
  while (left > 0 && free.length) {
    const pick = Math.min(free.length - 1, Math.floor(nextHerbRoll(state) * free.length))
    const plot = free.splice(pick, 1)[0]
    if (!plot) break
    plot.weeder = rival.id
    plot.workerId = null
    plot.progressS = 0
    left -= 1
  }
}

function heldPlots(state: HerbPvpState, rivalId: string): HerbPlot[] {
  return state.plots.filter((plot) => plot.weeder === rivalId && !plot.cleared)
}

function endRivalSession(state: HerbPvpState, rival: HerbRival, elapsed: number): void {
  for (const plot of heldPlots(state, rival.id)) {
    plot.weeder = null
    plot.progressS = 0
  }
  rival.onlineUntilS = null
  rival.plotCap = 0
  rival.nextOnlineAtS = elapsed + intBetween(state, HERB_PVP_RIVAL_REST_MIN_S, HERB_PVP_RIVAL_REST_MAX_S)
}

function startRivalSession(save: Save, state: HerbPvpState, rival: HerbRival): void {
  refreshRivalCombat(save, rival)
  rival.onlineUntilS = save.elapsedS + intBetween(state, HERB_PVP_SESSION_MIN_S, HERB_PVP_SESSION_MAX_S)
  rival.plotCap = intBetween(state, HERB_PVP_RIVAL_PLOTS_MIN, HERB_PVP_RIVAL_PLOTS_MAX)
  claimPlots(state, rival, rival.plotCap)
}

function stepRivals(save: Save, state: HerbPvpState): void {
  const elapsed = save.elapsedS
  if (elapsed >= state.targetUntilS) {
    state.onlineTarget = Math.floor(nextHerbRoll(state) * (HERB_PVP_RIVAL_ONLINE_MAX + 1))
    state.targetUntilS = elapsed + HERB_PVP_TARGET_REROLL_S
  }
  for (const rival of state.rivals) {
    if (rival.onlineUntilS == null) continue
    const held = heldPlots(state, rival.id)
    if (elapsed >= rival.onlineUntilS && held.length === 0) {
      endRivalSession(state, rival, elapsed)
      continue
    }
    if (elapsed < rival.onlineUntilS && held.length < rival.plotCap) claimPlots(state, rival, rival.plotCap - held.length)
  }
  const online = state.rivals.filter((rival) => rival.onlineUntilS != null).length
  if (online >= Math.min(HERB_PVP_RIVAL_ONLINE_MAX, state.onlineTarget)) return
  const ready = state.rivals.filter((rival) => rival.onlineUntilS == null && rival.nextOnlineAtS <= elapsed)
  if (!ready.length) return
  const rival = ready[Math.min(ready.length - 1, Math.floor(nextHerbRoll(state) * ready.length))]
  if (rival) startRivalSession(save, state, rival)
}

function maybeBump(save: Save, state: HerbPvpState, offline: boolean): void {
  const targets = state.plots.filter((plot) => plot.workerId && !plot.cleared)
  if (!targets.length) return
  const online = state.rivals.filter((rival) => rival.onlineUntilS != null && rival.hp > 0)
  if (!online.length) return
  if (!(nextHerbRoll(state) < 1 / HERB_PVP_BUMP_MEAN_S)) return
  const plot = targets[Math.min(targets.length - 1, Math.floor(nextHerbRoll(state) * targets.length))]
  const rival = online[Math.min(online.length - 1, Math.floor(nextHerbRoll(state) * online.length))]
  if (!plot || !rival) return
  rivalHitsPlayer(save, plot, rival, offline)
}

function regenStamina(state: HerbPvpState): void {
  if (state.stamina >= HERB_PVP_STAMINA_MAX) {
    state.stamina = HERB_PVP_STAMINA_MAX
    state.staminaAccS = 0
    return
  }
  state.staminaAccS += 1
  while (state.stamina < HERB_PVP_STAMINA_MAX && state.staminaAccS >= HERB_PVP_STAMINA_REGEN_S) {
    state.staminaAccS -= HERB_PVP_STAMINA_REGEN_S
    state.stamina += 1
  }
  if (state.stamina >= HERB_PVP_STAMINA_MAX) state.staminaAccS = 0
}

function rollDay(save: Save, now: number, offline: boolean): void {
  if (!Number.isFinite(now)) return
  const state = save.herbPvp
  const key = beijingDayKey(now)
  if (!state.dayKey) {
    state.dayKey = key
    return
  }
  if (key <= state.dayKey) return
  const rank = herbPlayerRank(save)
  const text = herbRewardLine(rank)
  const reward = herbRankReward(rank)
  addVault(save, 'sandGold', reward.sandGold)
  addVault(save, 'jewel', reward.jewel)
  addVault(save, 'jade', reward.jade)
  state.probe1 += reward.probe1
  state.probe2 += reward.probe2
  state.probe4 += reward.probe4
  state.playerScore = 0
  for (const rival of state.rivals) rival.score = 0
  state.lastRewardText = text
  state.dayKey = key
  if (offline && state.offline) state.offline.rewards.push(text)
  else {
    pushMessage(save, { title: '采药结算', body: text, createdAt: now })
    note('采药日结，奖励已入账', 'ok', false)
  }
}

function stepPlots(save: Save, offline: boolean): void {
  const due = save.herbPvp.plots.filter((plot) => !plot.cleared && (!!plot.workerId || !!plot.weeder))
  for (const plot of due) plot.progressS += 1
  for (const plot of due) {
    if (plot.progressS >= HERB_PVP_WEED_S) finishPlot(save, plot, offline)
  }
  maybeRefreshMap(save)
}

/** 在线与离线每秒一次。`elapsedS` 由 applyTick 先加上。 */
export function stepHerbPvp(save: Save, now: number, opts?: { offline?: boolean }): void {
  const offline = opts?.offline === true
  const state = ensureHerbPvp(save, now)
  rollDay(save, now, offline)
  regenStamina(state)
  stepPlots(save, offline)
  stepRivals(save, state)
  maybeBump(save, state, offline)
}

export function startHerbWeed(save: Save, plotIndex: number, workerId: string): ActionResult {
  const state = ensureHerbPvp(save)
  const plot = state.plots[plotIndex]
  if (!plot || plot.index !== plotIndex) return { ok: false, reason: '没有这块地' }
  if (plot.cleared) return { ok: false, reason: '这块已经除过' }
  if (plot.workerId) return { ok: false, reason: '这块已经有人在除' }
  if (state.plots.filter((row) => row.workerId).length >= HERB_PVP_PLAYER_CAP) return { ok: false, reason: '最多同时除 3 块' }
  const worker = save.workers.find((row) => row.id === workerId)
  if (!worker) return { ok: false, reason: '没有这个工人' }
  if (isWorkerInHerbPvp(save, workerId)) return { ok: false, reason: '正在采药' }
  if (worker.assignment) return { ok: false, reason: '不在休息区' }
  if (isWorkerInCombat(save, workerId)) return { ok: false, reason: '正在战斗' }
  const mineBusy = treasureMineBlockReason(save, workerId)
  if (mineBusy) return { ok: false, reason: mineBusy }
  if (!isFullWorkshopHp(worker)) return { ok: false, reason: '满血才能上岗' }
  if (state.stamina < 1) return { ok: false, reason: '体力不足' }
  state.stamina -= 1
  const rival = plot.weeder ? state.rivals.find((row) => row.id === plot.weeder) : undefined
  if (rival) return playerHitsRival(save, plot, worker, rival)
  plot.workerId = worker.id
  plot.weeder = null
  plot.progressS = 0
  const name = worker.name ?? '工人'
  return { ok: true, message: `${name} 开始除草` }
}

export function useHerbProbe(save: Save, plotIndex: number, size: 1 | 2 | 4): ActionResult {
  const state = ensureHerbPvp(save)
  const anchor = state.plots[plotIndex]
  if (!anchor || anchor.cleared) return { ok: false, reason: '只能对未除的地使用' }
  const key = size === 4 ? 'probe4' : size === 2 ? 'probe2' : 'probe1'
  if (state[key] < 1) return { ok: false, reason: '没有这种侦测' }
  state[key] -= 1
  let opened = 0
  for (const index of herbProbeCells(plotIndex, size)) {
    const plot = state.plots[index]
    if (!plot || plot.cleared) continue
    plot.revealed = true
    opened += 1
  }
  return { ok: true, message: opened > 1 ? `揭开 ${opened} 块地` : '揭开了这块地' }
}

export function beginHerbOfflineReport(save: Save): void {
  const state = ensureHerbPvp(save)
  const bag: HerbOfflineNote = {
    rankAtStart: herbPlayerRank(save),
    harvest: {},
    score: 0,
    probe1: 0,
    probe2: 0,
    probe4: 0,
    bumps: 0,
    plotsLost: 0,
    rewards: [],
  }
  state.offline = bag
}

function harvestParts(noteBag: HerbOfflineNote): string[] {
  const parts: string[] = []
  for (const [itemId, qty] of Object.entries(noteBag.harvest)) {
    if (!qty) continue
    const label = itemId in ITEM_DEF ? ITEM_DEF[itemId as ItemId].label : itemId
    parts.push(`${label} ×${qty}`)
  }
  if (noteBag.score > 0) parts.push(`排行分 +${noteBag.score}`)
  const probes: string[] = []
  if (noteBag.probe1 > 0) probes.push(`1格 ×${noteBag.probe1}`)
  if (noteBag.probe2 > 0) probes.push(`2格 ×${noteBag.probe2}`)
  if (noteBag.probe4 > 0) probes.push(`4格 ×${noteBag.probe4}`)
  if (probes.length) parts.push(`侦测 ${probes.join('、')}`)
  return parts
}

export function finishHerbOfflineReport(save: Save): string | null {
  const state = save.herbPvp
  const noteBag = state?.offline
  if (!state || !noteBag) return null
  state.offline = null
  const rankNow = herbPlayerRank(save)
  const parts = harvestParts(noteBag)
  const quiet =
    parts.length === 0 &&
    noteBag.bumps <= 0 &&
    noteBag.rewards.length === 0 &&
    noteBag.rankAtStart === rankNow
  if (quiet) return null
  const bump =
    noteBag.bumps <= 0
      ? '被撞：没有'
      : noteBag.plotsLost > 0
        ? `被撞：${noteBag.bumps} 次，丢掉 ${noteBag.plotsLost} 块地`
        : `被撞：${noteBag.bumps} 次，地还在`
  const rank =
    noteBag.rankAtStart === rankNow
      ? `名次：仍是第 ${rankNow} 名`
      : `名次：第 ${noteBag.rankAtStart} 名 → 第 ${rankNow} 名`
  const reward = noteBag.rewards.length ? `昨日奖励：${noteBag.rewards.join('；')}` : '昨日奖励：没有'
  return [`除草收获：${parts.length ? parts.join('、') : '没有'}`, bump, rank, reward].join('\n')
}
