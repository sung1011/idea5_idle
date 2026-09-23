import { addToBank } from './bank'
import {
  addCombatReinforcements,
  beginEnemyCombat,
  canReinforceCombat,
  combatPartyBlockReason,
  combatStatus,
  endEnemyCombat,
  fieldFighterCount,
  grantWorkerCombatXp,
  hydrateCombatRoster,
  isCombatWon,
  isFighting,
  type CombatLogSink,
} from './combat'
import { findCombatPartyWorker } from './combatAssist'
import { clearWorkersNew } from './recruit'
import { canAffordCosts, missingCostLabels, takeCosts } from './costs'
import {
  DUNGEON_AFFIX_COUNT,
  DUNGEON_AFFIX_DEFS,
  DUNGEON_AFFIX_IDS,
  DUNGEON_AFFIX_FX,
  DUNGEON_ATTEMPTS_PER_DAY,
  DUNGEON_BROKER_ID,
  DUNGEON_DIAMOND_CHEST,
  DUNGEON_GOLD_CHEST,
  DUNGEON_JAILER_ID,
  DUNGEON_NEEDS,
  DUNGEON_PARTY_MAX,
  DUNGEON_TIMEOUT_S,
  applyCombatAffixStats,
  applyDungeonPhaseToEncounter,
  battlefieldAffixEffect,
  dungeonBossProfile,
  dungeonBossReward,
  dungeonChapterScale,
  dungeonChestTier,
  dungeonGoldAmount,
  dungeonPhaseShield,
  encounterAffixIds,
  hasEncounterAffix,
  isDungeonAffixId,
  isDungeonBossId,
  isDungeonEncounter,
  makeDungeonEncounter,
  rollDungeonAffixes,
  type DungeonAffixId,
  type DungeonBossId,
  type DungeonChestTier,
} from './dungeonTables'
import { hashString, roll01Bag } from './combatAttrs'
import { DAY_LENGTH_S, ITEM_DEF, formatClock, gameDay, timeOfDayS, type IoRule } from './tables'
import { workerLootXp } from './workerLevel'
import { consumeRunePicks, normalizeRunePicks, runePickBlockReason, type RunePickMap } from './runes'
import type { ActionResult, CombatStats, DungeonState, EncounterNeedMap, EnemyEncounter, ItemId, Save, Worker } from './types'

export {
  DUNGEON_AFFIX_COUNT,
  DUNGEON_AFFIX_DEFS,
  DUNGEON_AFFIX_FX,
  DUNGEON_AFFIX_IDS,
  DUNGEON_ATTEMPTS_PER_DAY,
  DUNGEON_BOSS_DEFS,
  DUNGEON_BOSS_ID,
  DUNGEON_BOSS_LABEL,
  DUNGEON_BOSS_STATS,
  DUNGEON_BROKER_ID,
  DUNGEON_BROKER_LABEL,
  DUNGEON_BROKER_PHASES,
  DUNGEON_BROKER_STATS,
  DUNGEON_CHAPTER_FX,
  DUNGEON_CHEST,
  DUNGEON_DIAMOND_CHEST,
  DUNGEON_GOLD_CHAPTER_STEP,
  DUNGEON_GOLD_CHEST,
  DUNGEON_JAILER_ID,
  DUNGEON_JAILER_LABEL,
  DUNGEON_JAILER_PHASES,
  DUNGEON_JAILER_STATS,
  DUNGEON_LEGACY_BOSS_ID,
  DUNGEON_MECHANIC_LABEL,
  DUNGEON_NEEDS,
  DUNGEON_PARTY_MAX,
  DUNGEON_PHASES,
  DUNGEON_STUN_S,
  DUNGEON_TARGET_ROTATION,
  DUNGEON_TIMEOUT_S,
  applyCombatAffixStats,
  battlefieldAffixEffect,
  dungeonAffixEffect,
  dungeonBossProfile,
  dungeonChapterScale,
  dungeonChestTier,
  dungeonGoldAmount,
  dungeonStunS,
  encounterAffixIds,
  hasEncounterAffix,
  isDungeonAffixId,
  isDungeonBossId,
  isDungeonEncounter,
  makeDungeonEncounter,
  rollDungeonAffixes,
  type CombatAffixScope,
  type DungeonAffixId,
  type DungeonBossId,
  type DungeonChestTier,
  type DungeonMechanicId,
  type DungeonRewardKind,
} from './dungeonTables'

export type { DungeonState }

function needRules(map: EncounterNeedMap): IoRule[] {
  return (Object.entries(map) as Array<[ItemId, number]>).filter(([, qty]) => qty > 0).map(([itemId, qty]) => ({
    itemId,
    qty,
  }))
}

function rollOrderAffixes(day: number, bossId: DungeonBossId, salt = 0): DungeonAffixId[] {
  return rollDungeonAffixes(roll01Bag(hashString(`dungeon-affix:${day}:${bossId}:${salt}`)), DUNGEON_AFFIX_COUNT)
}

export function rollBattlefieldAffix(salt: string): DungeonAffixId {
  return rollDungeonAffixes(roll01Bag(hashString(`battlefield-affix:${salt}`)), 1)[0]
}

/** 战场敌人格缺词缀时补 1 条。进行中的战斗不补，避免日中改结算。 */
export function ensureBattlefieldAffix(enc: EnemyEncounter, force = false): EnemyEncounter {
  if (isDungeonEncounter(enc)) return enc
  if (isDungeonAffixId(enc.affixId)) return enc
  const fighting = !!enc.combat && enc.combat.outcome == null
  if (fighting && !force) return enc
  enc.affixId = rollBattlefieldAffix(enc.id)
  return enc
}

export function battlefieldAffixRow(
  enc: EnemyEncounter,
): { id: DungeonAffixId; label: string; effect: string } | null {
  if (isDungeonEncounter(enc) || !isDungeonAffixId(enc.affixId)) return null
  return {
    id: enc.affixId,
    label: DUNGEON_AFFIX_DEFS[enc.affixId].label,
    effect: battlefieldAffixEffect(enc.affixId),
  }
}

function lockedDungeonChapter(save?: Save): number {
  const n = save?.mainChapter
  return typeof n === 'number' && Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1
}

/** 距下一次 `gameDay` 日切（地牢硬刷边界）还剩多少秒。 */
export function dungeonRefreshRemainS(elapsedS: number): number {
  const remain = DAY_LENGTH_S - timeOfDayS(elapsedS)
  return remain > 0 ? remain : DAY_LENGTH_S
}

export function dungeonRefreshCountdownLabel(elapsedS: number): string {
  return `刷新倒计时: ${formatClock(dungeonRefreshRemainS(elapsedS))}`
}

export function dungeonScaleChapter(save: Save): number {
  const n = save.dungeon?.chapter
  if (typeof n === 'number' && Number.isFinite(n) && n >= 1) return Math.floor(n)
  return 1
}

export function blankDungeonState(save?: Save, day = 1): DungeonState {
  const chapter = lockedDungeonChapter(save)
  const salt = save?.nextWorkerId ?? 0
  const jailer = makeDungeonEncounter(DUNGEON_JAILER_ID, rollOrderAffixes(day, DUNGEON_JAILER_ID, salt), chapter)
  const broker = makeDungeonEncounter(DUNGEON_BROKER_ID, rollOrderAffixes(day, DUNGEON_BROKER_ID, salt), chapter)
  return {
    day,
    chapter,
    encounters: [jailer, broker],
    attemptsUsedById: { [DUNGEON_JAILER_ID]: 0, [DUNGEON_BROKER_ID]: 0 },
  }
}

export function dungeonEncounters(save: Save): EnemyEncounter[] {
  ensureDungeonDay(save)
  return save.dungeon.encounters
}

export function dungeonEncounterOf(save: Save, encounterId?: string): EnemyEncounter {
  const list = dungeonEncounters(save)
  if (!encounterId) return list[0]
  return list.find((enc) => enc.id === encounterId) ?? list[0]
}

export function dungeonAttemptsLeft(save: Save, encounterId?: string): number {
  ensureDungeonDay(save)
  const id = encounterId ?? save.dungeon.encounters[0]?.id
  if (!id) return 0
  const used = save.dungeon.attemptsUsedById[id] ?? 0
  return Math.max(0, DUNGEON_ATTEMPTS_PER_DAY - used)
}

export function dungeonAttemptSummary(save: Save): { used: number; total: number } {
  const list = dungeonEncounters(save)
  const used = list.filter((enc) => (save.dungeon.attemptsUsedById[enc.id] ?? 0) >= DUNGEON_ATTEMPTS_PER_DAY).length
  return { used, total: list.length }
}

export function encounterAffixRows(
  enc: EnemyEncounter,
): Array<{ id: DungeonAffixId; label: string; effect: string }> {
  return encounterAffixIds(undefined, enc).map((id) => ({
    id,
    label: DUNGEON_AFFIX_DEFS[id].label,
    effect: isDungeonEncounter(enc) ? DUNGEON_AFFIX_DEFS[id].effect : battlefieldAffixEffect(id),
  }))
}

function orderAffixIds(enc: EnemyEncounter): DungeonAffixId[] {
  return encounterAffixIds(undefined, enc)
}

export function dungeonBossLiveStats(save: Save, encounterId?: string): CombatStats {
  const enc = encounterId ? findDungeonEncounter(save, encounterId) : dungeonEncounterOf(save)
  const boss = dungeonBossProfile(enc?.id ?? DUNGEON_JAILER_ID)
  const scale = dungeonChapterScale(dungeonScaleChapter(save))
  const base: CombatStats = {
    hp: Math.round(boss.stats.hp * scale.hpMul),
    atk: Math.max(1, Math.round(boss.stats.atk * scale.atkMul)),
    spd: Math.max(2, Math.round(boss.stats.spd * scale.spdMul * 100) / 100),
  }
  return applyCombatAffixStats(base, enc ? orderAffixIds(enc) : [])
}

function readAffixIds(raw: unknown, max: number): DungeonAffixId[] {
  if (!Array.isArray(raw)) return []
  const out: DungeonAffixId[] = []
  const seen = new Set<DungeonAffixId>()
  for (const id of raw) {
    if (!isDungeonAffixId(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= max) break
  }
  return out
}

function fillAffixIds(kept: readonly DungeonAffixId[], fill: () => DungeonAffixId[]): DungeonAffixId[] {
  const out = [...kept]
  if (out.length >= DUNGEON_AFFIX_COUNT) return out.slice(0, DUNGEON_AFFIX_COUNT)
  for (const id of fill()) {
    if (out.includes(id)) continue
    out.push(id)
    if (out.length >= DUNGEON_AFFIX_COUNT) break
  }
  return out
}

export function dungeonShieldBonus(save: Save, enc?: EnemyEncounter | null): number {
  const scale = dungeonChapterScale(dungeonScaleChapter(save))
  let bonus = scale.shield
  if (enc && hasEncounterAffix(save, enc, 'ironShield')) bonus += DUNGEON_AFFIX_FX.ironShieldBonus
  return bonus
}

function findDungeonEncounter(save: Save, encounterId: string): EnemyEncounter | null {
  ensureDungeonDay(save)
  return save.dungeon.encounters.find((enc) => enc.id === encounterId) ?? null
}

function dungeonChestBlockReason(enc: EnemyEncounter): string | null {
  if (enc.lootClaimed) return '今日宝箱已领取'
  if (isFighting(enc)) return '战斗未结束'
  if (!enc.combat || !enc.combat.outcome) return '还没有宝箱'
  return null
}

function settleOneDungeon(save: Save, enc: EnemyEncounter, now: number): void {
  if (enc.kind !== 'enemy') return
  if (isFighting(enc)) {
    endEnemyCombat(save, enc, now, 'lose', '日切判败')
  }
  if (!dungeonChestBlockReason(enc)) {
    grantDungeonChestNow(save, enc)
  }
}

function dungeonBoards(state: DungeonState | undefined): EnemyEncounter[] {
  if (!state) return []
  if (Array.isArray(state.encounters)) return state.encounters.filter((enc) => enc?.kind === 'enemy')
  const legacy = (state as { encounter?: EnemyEncounter }).encounter
  return legacy?.kind === 'enemy' ? [legacy] : []
}

function settleDungeonBeforeRefresh(save: Save, now: number): void {
  for (const enc of dungeonBoards(save.dungeon)) settleOneDungeon(save, enc, now)
}

function pairReady(state: DungeonState | undefined): boolean {
  const list = state?.encounters
  if (!Array.isArray(list)) return false
  const jailer = list.find((enc) => enc?.id === DUNGEON_JAILER_ID && isDungeonEncounter(enc))
  const broker = list.find((enc) => enc?.id === DUNGEON_BROKER_ID && isDungeonEncounter(enc))
  return !!jailer && !!broker
}

type LegacyDungeon = Partial<DungeonState> & {
  affixIds?: unknown
  attemptsUsed?: number
  encounter?: EnemyEncounter
}

function adoptLegacyFight(fresh: EnemyEncounter, old: EnemyEncounter): EnemyEncounter {
  const next: EnemyEncounter = {
    ...fresh,
    departed: old.departed,
    combat: old.combat,
    lootClaimed: old.lootClaimed,
    revealedWeaknesses: old.revealedWeaknesses ?? [],
    weaknesses: old.weaknesses?.length ? [...old.weaknesses] : fresh.weaknesses,
    targetRuleId: old.targetRuleId ?? fresh.targetRuleId,
    targetRuleUntil: old.targetRuleUntil ?? null,
    dungeonPhase: old.dungeonPhase ?? 1,
    dungeonPhaseReached: old.dungeonPhaseReached ?? 1,
    dungeonMechanic: old.dungeonMechanic ?? fresh.dungeonMechanic,
    dungeonPendingPhase: old.dungeonPendingPhase ?? false,
    dungeonShieldBonus: old.dungeonShieldBonus ?? 0,
  }
  if (next.combat?.enemy) next.combat.enemy.label = fresh.label
  return next
}

function readAttemptMap(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, number> = {}
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isDungeonBossId(id)) continue
    if (typeof value === 'number' && Number.isFinite(value) && value >= DUNGEON_ATTEMPTS_PER_DAY) out[id] = DUNGEON_ATTEMPTS_PER_DAY
  }
  return out
}

/** 把缺字段或旧单场结构补成当日两单。不在这里做日切。 */
function repairDungeonShape(save: Save): void {
  const raw = (save.dungeon ?? {}) as LegacyDungeon
  const day =
    typeof raw.day === 'number' && Number.isFinite(raw.day) ? Math.max(1, Math.floor(raw.day)) : gameDay(save.elapsedS)
  const spawned = isDungeonEncounter(raw.encounter) || (Array.isArray(raw.encounters) && raw.encounters.some(isDungeonEncounter))
  const hadChapter = typeof raw.chapter === 'number' && Number.isFinite(raw.chapter) && raw.chapter >= 1
  const chapter = hadChapter ? Math.floor(raw.chapter as number) : spawned ? 1 : lockedDungeonChapter(save)
  const salt = save.nextWorkerId ?? 0

  if (pairReady(raw as DungeonState)) {
    const attempts = readAttemptMap(raw.attemptsUsedById)
    const ordered = [DUNGEON_JAILER_ID, DUNGEON_BROKER_ID].map((id) =>
      (raw.encounters as EnemyEncounter[]).find((enc) => enc.id === id),
    ) as EnemyEncounter[]
    const encounters = ordered.map((enc) => {
      enc.dungeon = true
      enc.needs = { ...DUNGEON_NEEDS }
      enc.affixIds = fillAffixIds(readAffixIds(enc.affixIds, DUNGEON_AFFIX_COUNT), () =>
        rollOrderAffixes(day, enc.id as DungeonBossId, salt),
      )
      hydrateCombatRoster(save, enc)
      return enc
    })
    save.dungeon = {
      day,
      chapter,
      encounters,
      attemptsUsedById: {
        [DUNGEON_JAILER_ID]: attempts[DUNGEON_JAILER_ID] ?? 0,
        [DUNGEON_BROKER_ID]: attempts[DUNGEON_BROKER_ID] ?? 0,
      },
    }
    return
  }

  const legacyAffixes = readAffixIds(raw.affixIds, DUNGEON_AFFIX_IDS.length)
  const jailerAffix = fillAffixIds(legacyAffixes.slice(0, DUNGEON_AFFIX_COUNT), () =>
    rollOrderAffixes(day, DUNGEON_JAILER_ID, salt),
  )
  const brokerAffix = fillAffixIds(legacyAffixes.slice(DUNGEON_AFFIX_COUNT, DUNGEON_AFFIX_COUNT * 2), () =>
    rollOrderAffixes(day, DUNGEON_BROKER_ID, salt),
  )
  let jailer = makeDungeonEncounter(DUNGEON_JAILER_ID, jailerAffix, chapter)
  let broker = makeDungeonEncounter(DUNGEON_BROKER_ID, brokerAffix, chapter)
  const attemptsUsedById: Record<string, number> = { [DUNGEON_JAILER_ID]: 0, [DUNGEON_BROKER_ID]: 0 }
  const old = isDungeonEncounter(raw.encounter) ? raw.encounter : null
  if (old) {
    const slot = old.id === DUNGEON_BROKER_ID ? DUNGEON_BROKER_ID : DUNGEON_JAILER_ID
    const fresh = slot === DUNGEON_BROKER_ID ? broker : jailer
    const adopted = adoptLegacyFight(fresh, old)
    adopted.needs = { ...DUNGEON_NEEDS }
    hydrateCombatRoster(save, adopted)
    if (slot === DUNGEON_BROKER_ID) broker = adopted
    else jailer = adopted
    const used =
      (typeof raw.attemptsUsed === 'number' && raw.attemptsUsed >= 1) || !!old.combat || old.departed === true
    if (used) attemptsUsedById[slot] = DUNGEON_ATTEMPTS_PER_DAY
  }
  save.dungeon = { day, chapter, encounters: [jailer, broker], attemptsUsedById }
}

/** 地牢到刷新时间仍强制刷新，两单一起重建。与战场探索保留交战单分开。 */
export function ensureDungeonDay(save: Save, now = Date.now()): DungeonState {
  const day = gameDay(save.elapsedS)
  if (!pairReady(save.dungeon)) repairDungeonShape(save)
  if (save.dungeon.day === day && pairReady(save.dungeon)) return save.dungeon
  if (save.dungeon.day !== day) settleDungeonBeforeRefresh(save, now)
  save.dungeon = blankDungeonState(save, day)
  return save.dungeon
}

export function hydrateDungeonFields(save: Save): Save {
  repairDungeonShape(save)
  ensureDungeonDay(save)
  return save
}

function resolveDungeonEncounter(save: Save, encounterId: string): EnemyEncounter | null {
  return findDungeonEncounter(save, encounterId)
}

export function dungeonSupplyBlockReason(save: Save, encounterId?: string): string | null {
  const enc = encounterId ? resolveDungeonEncounter(save, encounterId) : dungeonEncounterOf(save)
  if (!enc) return '没有这张地牢订单'
  const status = combatStatus(enc)
  if (status === 'fighting') return '战斗中'
  if (status === 'win' || status === 'lose') return '先领取宝箱'
  if (dungeonAttemptsLeft(save, enc.id) <= 0) return '今日地牢次数已用完'
  const missing = missingCostLabels(save, needRules(DUNGEON_NEEDS))
  if (missing.length) return `货不够：${missing.join('、')}`
  return null
}

export function startDungeonBlockReason(
  save: Save,
  encounterId: string,
  workerIds: readonly string[],
  guests: readonly Worker[] = [],
): string | null {
  const supply = dungeonSupplyBlockReason(save, encounterId)
  if (supply) return supply
  return combatPartyBlockReason(save, workerIds, guests, DUNGEON_PARTY_MAX)
}

export function reinforceDungeonBlockReason(
  save: Save,
  encounterId: string,
  workerIds: readonly string[],
  guests: readonly Worker[] = [],
): string | null {
  const enc = resolveDungeonEncounter(save, encounterId)
  if (!enc) return '没有这张地牢订单'
  if (!canReinforceCombat(enc)) {
    if (!isFighting(enc)) return '战斗未进行'
    return `场上已满 ${DUNGEON_PARTY_MAX} 人`
  }
  const room = DUNGEON_PARTY_MAX - fieldFighterCount(enc)
  return combatPartyBlockReason(save, workerIds, guests, room)
}

export function startDungeonCombat(
  save: Save,
  encounterId: string,
  workerIds: readonly string[],
  now = Date.now(),
  onLog?: CombatLogSink,
  guests: readonly Worker[] = [],
  runePicks?: RunePickMap,
): ActionResult {
  const blocked = startDungeonBlockReason(save, encounterId, workerIds, guests)
  if (blocked) return { ok: false, reason: blocked }
  const runeBlocked = runePickBlockReason(save, runePicks)
  if (runeBlocked) return { ok: false, reason: runeBlocked }
  const enc = resolveDungeonEncounter(save, encounterId)
  if (!enc) return { ok: false, reason: '没有这张地牢订单' }
  const party = workerIds
    .map((id) => findCombatPartyWorker(save, id, guests))
    .filter((w): w is Worker => !!w)
  if (!party.length) return { ok: false, reason: '请选择出战工人' }
  if (!canAffordCosts(save, needRules(DUNGEON_NEEDS))) {
    return { ok: false, reason: dungeonSupplyBlockReason(save, enc.id) ?? '货不够' }
  }
  const took = takeCosts(save, needRules(DUNGEON_NEEDS))
  if (!took.ok) return took
  const consumed = consumeRunePicks(save, runePicks)
  if (!consumed.ok) return consumed
  clearWorkersNew(
    save,
    party.filter((w) => !w.guest).map((w) => w.id),
  )
  save.dungeon.attemptsUsedById[enc.id] = DUNGEON_ATTEMPTS_PER_DAY
  enc.dungeonShieldBonus = dungeonShieldBonus(save, enc)
  enc.lootClaimed = false
  enc.dungeonPendingPhase = false
  applyDungeonPhaseToEncounter(enc, 1, now)
  beginEnemyCombat(enc, party, now, 1, onLog, save, {
    stats: dungeonBossLiveStats(save, enc.id),
    shield: dungeonPhaseShield(1, enc.dungeonShieldBonus, enc.id),
    timeoutS: DUNGEON_TIMEOUT_S,
    runes: normalizeRunePicks(runePicks),
  })
  return { ok: true }
}

export function reinforceDungeonCombat(
  save: Save,
  encounterId: string,
  workerIds: readonly string[],
  now = Date.now(),
  onLog?: CombatLogSink,
  guests: readonly Worker[] = [],
  runePicks?: RunePickMap,
): ActionResult {
  const blocked = reinforceDungeonBlockReason(save, encounterId, workerIds, guests)
  if (blocked) return { ok: false, reason: blocked }
  const runeBlocked = runePickBlockReason(save, runePicks)
  if (runeBlocked) return { ok: false, reason: runeBlocked }
  const enc = resolveDungeonEncounter(save, encounterId)
  if (!enc) return { ok: false, reason: '没有这张地牢订单' }
  const party = workerIds
    .map((id) => findCombatPartyWorker(save, id, guests))
    .filter((w): w is Worker => !!w)
  if (!party.length) return { ok: false, reason: '请选择出战工人' }
  const consumed = consumeRunePicks(save, runePicks)
  if (!consumed.ok) return consumed
  clearWorkersNew(
    save,
    party.filter((w) => !w.guest).map((w) => w.id),
  )
  addCombatReinforcements(enc, party, now, onLog, save, normalizeRunePicks(runePicks))
  return { ok: true }
}

export function claimDungeonChestBlockReason(save: Save, encounterId?: string): string | null {
  const enc = encounterId ? resolveDungeonEncounter(save, encounterId) : dungeonEncounterOf(save)
  if (!enc) return '没有这张地牢订单'
  return dungeonChestBlockReason(enc)
}

function grantDungeonXp(save: Save, enc: EnemyEncounter): boolean {
  if (!isCombatWon(enc) || !enc.combat) return false
  const amount = workerLootXp('boss', save.mainChapter)
  let granted = false
  for (const id of enc.combat.workerIds) {
    const worker = findCombatPartyWorker(save, id)
    if (!worker) continue
    grantWorkerCombatXp(worker, amount)
    granted = true
  }
  return granted
}

export function dungeonChestPayout(save: Save, enc: EnemyEncounter): {
  tier: DungeonChestTier
  diamonds: number
  gold: number
  items: Partial<Record<keyof EncounterNeedMap, number>>
} {
  const tier = dungeonChestTier(enc)
  const reward = dungeonBossReward(enc.id)
  const rich = hasEncounterAffix(save, enc, 'richVein') ? DUNGEON_AFFIX_FX.richVeinDiamondMul : 1
  if (reward === 'gold') {
    const row = DUNGEON_GOLD_CHEST[tier]
    return {
      tier,
      diamonds: 0,
      gold: Math.round(dungeonGoldAmount(tier, dungeonScaleChapter(save)) * rich),
      items: { ...row.items },
    }
  }
  const row = DUNGEON_DIAMOND_CHEST[tier]
  return {
    tier,
    diamonds: Math.round(row.diamonds * rich),
    gold: 0,
    items: { ...row.items },
  }
}

function grantDungeonChestNow(save: Save, enc: EnemyEncounter): ActionResult {
  const blocked = dungeonChestBlockReason(enc)
  if (blocked) return { ok: false, reason: blocked }
  const payout = dungeonChestPayout(save, enc)
  const grantedXp = grantDungeonXp(save, enc)
  enc.lootClaimed = true
  if (payout.diamonds > 0) save.diamonds += payout.diamonds
  if (payout.gold > 0) save.gold += payout.gold
  const itemBits: string[] = []
  for (const [itemId, qty] of Object.entries(payout.items)) {
    if (!qty) continue
    addToBank(save, itemId as keyof EncounterNeedMap, qty)
    itemBits.push(`${ITEM_DEF[itemId as ItemId].label}×${qty}`)
  }
  const payBits: string[] = []
  if (payout.diamonds > 0) payBits.push(`钻石 ×${payout.diamonds}`)
  if (payout.gold > 0) payBits.push(`金币 ×${payout.gold}`)
  const xpNote = grantedXp ? '。工人获得经验' : ''
  const itemNote = itemBits.length ? `、${itemBits.join('、')}` : ''
  return { ok: true, message: `${enc.label}宝箱（${payout.tier}）：${payBits.join('、')}${itemNote}${xpNote}` }
}

export function claimDungeonChest(save: Save, encounterId: string, now = Date.now()): ActionResult {
  ensureDungeonDay(save, now)
  const enc = resolveDungeonEncounter(save, encounterId)
  if (!enc) return { ok: false, reason: '没有这张地牢订单' }
  return grantDungeonChestNow(save, enc)
}
