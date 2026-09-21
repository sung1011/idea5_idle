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
import { canAffordCosts, missingCostLabels, takeCosts } from './costs'
import {
  DUNGEON_AFFIX_DEFS,
  DUNGEON_AFFIX_FX,
  DUNGEON_ATTEMPTS_PER_DAY,
  DUNGEON_BOSS_STATS,
  DUNGEON_CHAPTER_FX,
  DUNGEON_CHEST,
  dungeonChapterScale,
  DUNGEON_NEEDS,
  DUNGEON_PARTY_MAX,
  DUNGEON_TIMEOUT_S,
  applyCombatAffixStats,
  applyDungeonPhaseToEncounter,
  battlefieldAffixEffect,
  DUNGEON_AFFIX_COUNT,
  dungeonChestTier,
  dungeonPhaseShield,
  isDungeonAffixId,
  isDungeonEncounter,
  makeDungeonEncounter,
  rollDungeonAffixes,
  type DungeonAffixId,
  type DungeonChestTier,
} from './dungeonTables'
import { hashString, roll01Bag } from './combatAttrs'
import { DAY_LENGTH_S, ITEM_DEF, formatClock, gameDay, timeOfDayS, type IoRule } from './tables'
import { workerLootXp } from './workerLevel'
import { consumeRunePicks, normalizeRunePicks, runePickBlockReason, type RunePickMap } from './runes'
import type { ActionResult, CombatStats, DungeonState, EncounterNeedMap, EnemyEncounter, ItemId, Save, Worker } from './types'

export {
  DUNGEON_AFFIX_DEFS,
  DUNGEON_AFFIX_FX,
  DUNGEON_AFFIX_IDS,
  DUNGEON_ATTEMPTS_PER_DAY,
  DUNGEON_CHAPTER_FX,
  DUNGEON_BOSS_ID,
  DUNGEON_BOSS_LABEL,
  DUNGEON_BOSS_STATS,
  DUNGEON_CHEST,
  DUNGEON_MECHANIC_LABEL,
  DUNGEON_NEEDS,
  DUNGEON_PARTY_MAX,
  DUNGEON_PHASES,
  DUNGEON_STUN_S,
  DUNGEON_TARGET_ROTATION,
  DUNGEON_AFFIX_COUNT,
  DUNGEON_TIMEOUT_S,
  applyCombatAffixStats,
  battlefieldAffixEffect,
  dungeonAffixEffect,
  dungeonChapterScale,
  dungeonChestTier,
  dungeonStunS,
  encounterAffixIds,
  hasEncounterAffix,
  isDungeonAffixId,
  isDungeonEncounter,
  makeDungeonEncounter,
  rollDungeonAffixes,
  type CombatAffixScope,
  type DungeonAffixId,
  type DungeonChestTier,
  type DungeonMechanicId,
} from './dungeonTables'

export type { DungeonState }

function needRules(map: EncounterNeedMap): IoRule[] {
  return (Object.entries(map) as Array<[ItemId, number]>).filter(([, qty]) => qty > 0).map(([itemId, qty]) => ({
    itemId,
    qty,
  }))
}

function rollAffixesForDay(day: number, salt = 0): DungeonAffixId[] {
  return rollDungeonAffixes(roll01Bag(hashString(`dungeon-affix:${day}:${salt}`)), DUNGEON_AFFIX_COUNT)
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
  return {
    day,
    chapter: lockedDungeonChapter(save),
    affixIds: rollAffixesForDay(day, save?.nextWorkerId ?? 0),
    attemptsUsed: 0,
    encounter: makeDungeonEncounter(),
  }
}

export function hasDungeonAffix(save: Save, id: DungeonAffixId): boolean {
  return (save.dungeon?.affixIds ?? []).includes(id)
}

export function dungeonBossLiveStats(save: Save): CombatStats {
  const scale = dungeonChapterScale(dungeonScaleChapter(save))
  const base: CombatStats = {
    hp: Math.round(DUNGEON_BOSS_STATS.hp * scale.hpMul),
    atk: Math.max(1, Math.round(DUNGEON_BOSS_STATS.atk * scale.atkMul)),
    spd: Math.max(2, Math.round(DUNGEON_BOSS_STATS.spd * scale.spdMul * 100) / 100),
  }
  return applyCombatAffixStats(base, (save.dungeon?.affixIds ?? []).filter(isDungeonAffixId))
}

function readHydratedAffixIds(raw: unknown): DungeonAffixId[] {
  if (!Array.isArray(raw)) return []
  const out: DungeonAffixId[] = []
  const seen = new Set<DungeonAffixId>()
  for (const id of raw) {
    if (!isDungeonAffixId(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= DUNGEON_AFFIX_COUNT) break
  }
  return out
}

export function dungeonShieldBonus(save: Save): number {
  const scale = dungeonChapterScale(dungeonScaleChapter(save))
  let bonus = scale.shield
  if (hasDungeonAffix(save, 'ironShield')) bonus += DUNGEON_AFFIX_FX.ironShieldBonus
  return bonus
}

export function dungeonEncounterOf(save: Save): EnemyEncounter {
  ensureDungeonDay(save)
  return save.dungeon.encounter
}

export function dungeonAttemptsLeft(save: Save): number {
  ensureDungeonDay(save)
  return Math.max(0, DUNGEON_ATTEMPTS_PER_DAY - save.dungeon.attemptsUsed)
}

export function dungeonAffixLabels(save: Save): string[] {
  return dungeonAffixRows(save).map((row) => row.label)
}

export function dungeonAffixRows(save: Save): Array<{ id: DungeonAffixId; label: string; effect: string }> {
  ensureDungeonDay(save)
  return save.dungeon.affixIds.map((id) => ({
    id,
    label: DUNGEON_AFFIX_DEFS[id].label,
    effect: DUNGEON_AFFIX_DEFS[id].effect,
  }))
}

function dungeonChestBlockReason(enc: EnemyEncounter): string | null {
  if (enc.lootClaimed) return '今日宝箱已领取'
  if (isFighting(enc)) return '战斗未结束'
  if (!enc.combat || !enc.combat.outcome) return '还没有宝箱'
  return null
}

function settleDungeonBeforeRefresh(save: Save, now: number): void {
  const enc = save.dungeon?.encounter
  if (!enc || enc.kind !== 'enemy') return
  if (isFighting(enc)) {
    endEnemyCombat(save, enc, now, 'lose', '日切判败')
  }
  if (!dungeonChestBlockReason(enc)) {
    grantDungeonChestNow(save, enc)
  }
}

export function ensureDungeonDay(save: Save, now = Date.now()): DungeonState {
  const day = gameDay(save.elapsedS)
  if (!save.dungeon || typeof save.dungeon !== 'object') {
    save.dungeon = blankDungeonState(save, day)
    return save.dungeon
  }
  const enc = save.dungeon.encounter
  if (save.dungeon.day === day && isDungeonEncounter(enc)) return save.dungeon
  if (save.dungeon.day !== day) settleDungeonBeforeRefresh(save, now)
  save.dungeon = blankDungeonState(save, day)
  return save.dungeon
}

export function hydrateDungeonFields(save: Save): Save {
  const raw = save.dungeon as Partial<DungeonState> | undefined
  const day = typeof raw?.day === 'number' && Number.isFinite(raw.day) ? Math.max(1, Math.floor(raw.day)) : gameDay(save.elapsedS)
  const affixIds = readHydratedAffixIds(raw?.affixIds)
  const attemptsUsed =
    typeof raw?.attemptsUsed === 'number' && Number.isFinite(raw.attemptsUsed)
      ? Math.max(0, Math.min(DUNGEON_ATTEMPTS_PER_DAY, Math.floor(raw.attemptsUsed)))
      : 0
  const hadChapter = typeof raw?.chapter === 'number' && Number.isFinite(raw.chapter) && raw.chapter >= 1
  const chapter = hadChapter
    ? Math.floor(raw.chapter as number)
    : isDungeonEncounter(raw?.encounter)
      ? 1
      : lockedDungeonChapter(save)
  const encounter = isDungeonEncounter(raw?.encounter) ? raw.encounter : makeDungeonEncounter()
  encounter.dungeon = true
  encounter.needs = { ...DUNGEON_NEEDS }
  hydrateCombatRoster(save, encounter)
  save.dungeon = {
    day,
    chapter,
    affixIds: affixIds.length >= 2 ? affixIds : rollAffixesForDay(day, save.nextWorkerId ?? 0),
    attemptsUsed,
    encounter,
  }
  ensureDungeonDay(save)
  return save
}

export function dungeonSupplyBlockReason(save: Save): string | null {
  const enc = dungeonEncounterOf(save)
  const status = combatStatus(enc)
  if (status === 'fighting') return '战斗中'
  if (status === 'win' || status === 'lose') return '先领取宝箱'
  if (dungeonAttemptsLeft(save) <= 0) return '今日地牢次数已用完'
  const missing = missingCostLabels(save, needRules(DUNGEON_NEEDS))
  if (missing.length) return `货不够：${missing.join('、')}`
  return null
}

export function startDungeonBlockReason(
  save: Save,
  workerIds: readonly string[],
  guests: readonly Worker[] = [],
): string | null {
  const supply = dungeonSupplyBlockReason(save)
  if (supply) return supply
  return combatPartyBlockReason(save, workerIds, guests, DUNGEON_PARTY_MAX)
}

export function reinforceDungeonBlockReason(
  save: Save,
  workerIds: readonly string[],
  guests: readonly Worker[] = [],
): string | null {
  const enc = dungeonEncounterOf(save)
  if (!canReinforceCombat(enc)) {
    if (!isFighting(enc)) return '战斗未进行'
    return `场上已满 ${DUNGEON_PARTY_MAX} 人`
  }
  const room = DUNGEON_PARTY_MAX - fieldFighterCount(enc)
  return combatPartyBlockReason(save, workerIds, guests, room)
}

export function startDungeonCombat(
  save: Save,
  workerIds: readonly string[],
  now = Date.now(),
  onLog?: CombatLogSink,
  guests: readonly Worker[] = [],
  runePicks?: RunePickMap,
): ActionResult {
  const blocked = startDungeonBlockReason(save, workerIds, guests)
  if (blocked) return { ok: false, reason: blocked }
  const runeBlocked = runePickBlockReason(save, runePicks)
  if (runeBlocked) return { ok: false, reason: runeBlocked }
  const enc = dungeonEncounterOf(save)
  const party = workerIds
    .map((id) => findCombatPartyWorker(save, id, guests))
    .filter((w): w is Worker => !!w)
  if (!party.length) return { ok: false, reason: '请选择出战工人' }
  if (!canAffordCosts(save, needRules(DUNGEON_NEEDS))) {
    return { ok: false, reason: dungeonSupplyBlockReason(save) ?? '货不够' }
  }
  const took = takeCosts(save, needRules(DUNGEON_NEEDS))
  if (!took.ok) return took
  const consumed = consumeRunePicks(save, runePicks)
  if (!consumed.ok) return consumed
  save.dungeon.attemptsUsed = Math.min(DUNGEON_ATTEMPTS_PER_DAY, save.dungeon.attemptsUsed + 1)
  enc.dungeonShieldBonus = dungeonShieldBonus(save)
  enc.lootClaimed = false
  enc.dungeonPendingPhase = false
  applyDungeonPhaseToEncounter(enc, 1, now)
  beginEnemyCombat(enc, party, now, 1, onLog, save, {
    stats: dungeonBossLiveStats(save),
    shield: dungeonPhaseShield(1, enc.dungeonShieldBonus),
    timeoutS: DUNGEON_TIMEOUT_S,
    runes: normalizeRunePicks(runePicks),
  })
  return { ok: true }
}

export function reinforceDungeonCombat(
  save: Save,
  workerIds: readonly string[],
  now = Date.now(),
  onLog?: CombatLogSink,
  guests: readonly Worker[] = [],
  runePicks?: RunePickMap,
): ActionResult {
  const blocked = reinforceDungeonBlockReason(save, workerIds, guests)
  if (blocked) return { ok: false, reason: blocked }
  const runeBlocked = runePickBlockReason(save, runePicks)
  if (runeBlocked) return { ok: false, reason: runeBlocked }
  const enc = dungeonEncounterOf(save)
  const party = workerIds
    .map((id) => findCombatPartyWorker(save, id, guests))
    .filter((w): w is Worker => !!w)
  if (!party.length) return { ok: false, reason: '请选择出战工人' }
  const consumed = consumeRunePicks(save, runePicks)
  if (!consumed.ok) return consumed
  addCombatReinforcements(enc, party, now, onLog, save, normalizeRunePicks(runePicks))
  return { ok: true }
}

export function claimDungeonChestBlockReason(save: Save): string | null {
  return dungeonChestBlockReason(dungeonEncounterOf(save))
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
  items: Partial<Record<keyof EncounterNeedMap, number>>
} {
  const tier = dungeonChestTier(enc)
  const row = DUNGEON_CHEST[tier]
  let diamonds = row.diamonds
  if (hasDungeonAffix(save, 'richVein')) diamonds = Math.round(diamonds * DUNGEON_AFFIX_FX.richVeinDiamondMul)
  return { tier, diamonds, items: { ...row.items } }
}

function grantDungeonChestNow(save: Save, enc: EnemyEncounter): ActionResult {
  const blocked = dungeonChestBlockReason(enc)
  if (blocked) return { ok: false, reason: blocked }
  const payout = dungeonChestPayout(save, enc)
  const grantedXp = grantDungeonXp(save, enc)
  enc.lootClaimed = true
  save.diamonds += payout.diamonds
  const itemBits: string[] = []
  for (const [itemId, qty] of Object.entries(payout.items)) {
    if (!qty) continue
    addToBank(save, itemId as keyof EncounterNeedMap, qty)
    itemBits.push(`${ITEM_DEF[itemId as ItemId].label}×${qty}`)
  }
  const xpNote = grantedXp ? '。工人获得经验' : ''
  const itemNote = itemBits.length ? `、${itemBits.join('、')}` : ''
  return { ok: true, message: `地牢宝箱（${payout.tier}）：钻石 ×${payout.diamonds}${itemNote}${xpNote}` }
}

export function claimDungeonChest(save: Save, now = Date.now()): ActionResult {
  ensureDungeonDay(save, now)
  return grantDungeonChestNow(save, save.dungeon.encounter)
}
