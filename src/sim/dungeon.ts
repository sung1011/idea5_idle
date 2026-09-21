import { addToBank } from './bank'
import {
  addCombatReinforcements,
  beginEnemyCombat,
  canReinforceCombat,
  combatPartyBlockReason,
  combatStatus,
  fieldFighterCount,
  grantWorkerCombatXp,
  isCombatWon,
  isFighting,
  type CombatLogSink,
} from './combat'
import { findCombatPartyWorker } from './combatAssist'
import { canAffordCosts, missingCostLabels, takeCosts } from './costs'
import {
  DUNGEON_AFFIX_DEFS,
  DUNGEON_ATTEMPTS_PER_DAY,
  DUNGEON_BOSS_STATS,
  DUNGEON_CHEST,
  DUNGEON_NEEDS,
  DUNGEON_PARTY_MAX,
  DUNGEON_TIMEOUT_S,
  applyDungeonPhaseToEncounter,
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
import { ITEM_DEF, gameDay, type IoRule } from './tables'
import { workerLootXp } from './workerLevel'
import type { ActionResult, CombatStats, DungeonState, EncounterNeedMap, EnemyEncounter, ItemId, Save, Worker } from './types'

export {
  DUNGEON_AFFIX_DEFS,
  DUNGEON_AFFIX_IDS,
  DUNGEON_ATTEMPTS_PER_DAY,
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
  DUNGEON_TIMEOUT_S,
  dungeonChestTier,
  isDungeonAffixId,
  isDungeonEncounter,
  makeDungeonEncounter,
  rollDungeonAffixes,
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

function rollAffixPairForDay(day: number, salt = 0): DungeonAffixId[] {
  return rollDungeonAffixes(roll01Bag(hashString(`dungeon-affix:${day}:${salt}`)))
}

export function blankDungeonState(save?: Save, day = 1): DungeonState {
  return {
    day,
    affixIds: rollAffixPairForDay(day, save?.nextWorkerId ?? 0),
    attemptsUsed: 0,
    encounter: makeDungeonEncounter(),
  }
}

export function hasDungeonAffix(save: Save, id: DungeonAffixId): boolean {
  return (save.dungeon?.affixIds ?? []).includes(id)
}

export function dungeonBossLiveStats(save: Save): CombatStats {
  let hp = DUNGEON_BOSS_STATS.hp
  let atk = DUNGEON_BOSS_STATS.atk
  let spd = DUNGEON_BOSS_STATS.spd
  if (hasDungeonAffix(save, 'thickHide')) hp = Math.round(hp * 1.25)
  if (hasDungeonAffix(save, 'heavyHands')) atk = Math.round(atk * 1.2)
  if (hasDungeonAffix(save, 'quickened')) spd = Math.max(2, Math.round(spd * 80) / 100)
  return { hp, atk, spd }
}

export function dungeonShieldBonus(save: Save): number {
  return hasDungeonAffix(save, 'ironShield') ? 1 : 0
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
  ensureDungeonDay(save)
  return save.dungeon.affixIds.map((id) => DUNGEON_AFFIX_DEFS[id].label)
}

export function ensureDungeonDay(save: Save): DungeonState {
  const day = gameDay(save.elapsedS)
  if (!save.dungeon || typeof save.dungeon !== 'object') {
    save.dungeon = blankDungeonState(save, day)
    return save.dungeon
  }
  const enc = save.dungeon.encounter
  if (save.dungeon.day === day && isDungeonEncounter(enc)) return save.dungeon
  if (isDungeonEncounter(enc) && isFighting(enc)) return save.dungeon
  save.dungeon = blankDungeonState(save, day)
  return save.dungeon
}

export function hydrateDungeonFields(save: Save): Save {
  const raw = save.dungeon as Partial<DungeonState> | undefined
  const day = typeof raw?.day === 'number' && Number.isFinite(raw.day) ? Math.max(1, Math.floor(raw.day)) : gameDay(save.elapsedS)
  const affixIds = Array.isArray(raw?.affixIds) ? raw.affixIds.filter(isDungeonAffixId).slice(0, 2) : []
  const attemptsUsed =
    typeof raw?.attemptsUsed === 'number' && Number.isFinite(raw.attemptsUsed)
      ? Math.max(0, Math.min(DUNGEON_ATTEMPTS_PER_DAY, Math.floor(raw.attemptsUsed)))
      : 0
  const encounter = isDungeonEncounter(raw?.encounter) ? raw.encounter : makeDungeonEncounter()
  encounter.dungeon = true
  encounter.needs = { ...DUNGEON_NEEDS }
  save.dungeon = {
    day,
    affixIds: affixIds.length === 2 ? affixIds : rollAffixPairForDay(day, save.nextWorkerId ?? 0),
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
): ActionResult {
  const blocked = startDungeonBlockReason(save, workerIds, guests)
  if (blocked) return { ok: false, reason: blocked }
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
  save.dungeon.attemptsUsed = Math.min(DUNGEON_ATTEMPTS_PER_DAY, save.dungeon.attemptsUsed + 1)
  enc.dungeonShieldBonus = dungeonShieldBonus(save)
  enc.lootClaimed = false
  enc.dungeonPendingPhase = false
  applyDungeonPhaseToEncounter(enc, 1, now)
  beginEnemyCombat(enc, party, now, 1, onLog, save, {
    stats: dungeonBossLiveStats(save),
    shield: dungeonPhaseShield(1, enc.dungeonShieldBonus),
    timeoutS: DUNGEON_TIMEOUT_S,
  })
  return { ok: true }
}

export function reinforceDungeonCombat(
  save: Save,
  workerIds: readonly string[],
  now = Date.now(),
  onLog?: CombatLogSink,
  guests: readonly Worker[] = [],
): ActionResult {
  const blocked = reinforceDungeonBlockReason(save, workerIds, guests)
  if (blocked) return { ok: false, reason: blocked }
  const enc = dungeonEncounterOf(save)
  const party = workerIds
    .map((id) => findCombatPartyWorker(save, id, guests))
    .filter((w): w is Worker => !!w)
  if (!party.length) return { ok: false, reason: '请选择出战工人' }
  addCombatReinforcements(enc, party, now, onLog, save)
  return { ok: true }
}

export function claimDungeonChestBlockReason(save: Save): string | null {
  const enc = dungeonEncounterOf(save)
  if (enc.lootClaimed) return '今日宝箱已领取'
  if (isFighting(enc)) return '战斗未结束'
  if (!enc.combat || !enc.combat.outcome) return '还没有宝箱'
  return null
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
  if (hasDungeonAffix(save, 'richVein')) diamonds = Math.round(diamonds * 1.25)
  return { tier, diamonds, items: { ...row.items } }
}

export function claimDungeonChest(save: Save, _now = Date.now()): ActionResult {
  const blocked = claimDungeonChestBlockReason(save)
  if (blocked) return { ok: false, reason: blocked }
  const enc = dungeonEncounterOf(save)
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
