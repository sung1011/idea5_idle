import { isWorkerInTreasureMine, treasureMineBlockReason } from './treasureMineQuery'
import {
  enemyRankFor,
  ensureEnemyIntel,
  formatWeaknessCritTip,
  formatWeaknessLabels,
  hashString,
  resolveWorkerAttack,
  roll01Bag,
  scaledAttackDamage,
} from './combatAttrs'
import {
  attackIntervalMul,
  breakEchoMul,
  firstStrikeCutS,
  marchDurationMs,
  reinforceFirstMul,
  runeAtkMul,
  workerAtkMul,
  workerHpMul,
  woundedTakenMul,
} from './tech'
import { combatPhaseOf } from './march'
import { findCombatPartyWorker, isAssistWorker } from './combatAssist'
import { drawEnemyTargetRule, pickEnemyTargets, type CombatTarget } from './combatTarget'
import { jitterWorkerAtkInterval } from './atkInterval'
import {
  applyCombatAffixStats,
  DUNGEON_AFFIX_FX,
  DUNGEON_PARTY_MAX,
  dungeonBossCounterKeep,
  dungeonBossJaggedExtra,
  dungeonBossReinforceDelayMs,
  dungeonBossWorkshopMul,
  dungeonPhaseIndex,
  dungeonStunS,
  encounterAffixIds,
  hasEncounterAffix,
  isDungeonEncounter,
  maybeRotateDungeonTarget,
  onDungeonBreak,
  onDungeonWake,
} from './dungeonTables'
import { offerRestFood } from './food'
import {
  fighterRuneId,
  hasInsightRune,
  runeBloodXp,
  runeBreakBonus,
  runeDealMul,
  runeSpdMul,
  runeTakenMul,
} from './runes'
import { roll01 } from './rng'
import { applyDownedRecovery, HP_WOUNDED_RATIO, isWoundedHp, releaseDeadWorker, restHealAmount, workerFatigueDebt, workerWearHp } from './workshopHp'
import { chapterCombatMul } from './mainChapter'
import {
  addWorkerXp,
  workerLevelAtkMul,
  workerLevelHpMul,
  workerLevelSpdMul,
  WORKER_LEVEL_SPD_FLOOR,
} from './workerLevel'
import type {
  ClassId,
  CombatAttrId,
  CombatFighter,
  CombatLogEntry,
  CombatOutcome,
  CombatReturnee,
  CombatStats,
  EncounterQuality,
  EnemyCombat,
  EnemyEncounter,
  EnemyRank,
  QualityTier,
  RuneItemId,
  Save,
  Worker,
} from './types'

export const COMBAT_PARTY_MAX = 3
/** 按阶超时：杂兵 / 精英 15 分钟，首领 30 分钟。 */
export const COMBAT_TIMEOUT_BY_RANK: Readonly<Record<EnemyRank, number>> = {
  minion: 900,
  elite: 900,
  boss: 1800,
}
/** 全局上限，等于首领超时。 */
export const COMBAT_TIMEOUT_S = COMBAT_TIMEOUT_BY_RANK.boss
export const COMBAT_LOG_CAP = 8
export const REST_HEAL_EVERY_S = 10
/** 开战掷盾：杂兵 2～3、精英 4～5、首领 6～8。 */
export const ENEMY_SHIELD_COUNT: Readonly<Record<EnemyRank, { min: number; max: number }>> = {
  minion: { min: 2, max: 3 },
  elite: { min: 4, max: 5 },
  boss: { min: 6, max: 8 },
}
/** 破防硬直秒数。 */
export const ENEMY_STUN_S: Readonly<Record<EnemyRank, number>> = {
  minion: 3,
  elite: 4,
  boss: 5,
}
/** 破防期间受伤倍率。 */
export const BREAK_VULN_MUL = 1.5
export const BREAK_TIP = '破防！'

export function rollEnemyShield(rank: EnemyRank, roll: () => number): number {
  const { min, max } = ENEMY_SHIELD_COUNT[rank]
  const span = max - min + 1
  return min + Math.min(span - 1, Math.max(0, Math.floor(roll() * span)))
}

export function enemyStunMs(rank: EnemyRank): number {
  return ENEMY_STUN_S[rank] * 1000
}

export function isCombatStunned(combat: EnemyCombat, at: number): boolean {
  return typeof combat.stunnedUntil === 'number' && at < combat.stunnedUntil
}

export function combatTimeoutS(rank: EnemyRank): number {
  return COMBAT_TIMEOUT_BY_RANK[rank]
}

export const WORKER_COMBAT_BY_TIER: Readonly<Record<QualityTier, CombatStats>> = {
  1: { hp: 24, atk: 4, spd: 5 },
  2: { hp: 28, atk: 5, spd: 5 },
  3: { hp: 32, atk: 6, spd: 4 },
  4: { hp: 36, atk: 7, spd: 4 },
  5: { hp: 42, atk: 8, spd: 4 },
  6: { hp: 48, atk: 9, spd: 3 },
  7: { hp: 54, atk: 10, spd: 3 },
  8: { hp: 62, atk: 12, spd: 3 },
  9: { hp: 72, atk: 14, spd: 3 },
  10: { hp: 84, atk: 16, spd: 2 },
}

/** 职业小修正。spd 为间隔增减，负值更快。 */
export const CLASS_COMBAT_MOD: Readonly<Record<ClassId, CombatStats>> = {
  laborer: { hp: 2, atk: 0, spd: 0 },
  artisan: { hp: 0, atk: 0, spd: 0 },
  wanderer: { hp: 0, atk: 1, spd: 0 },
  miner: { hp: 3, atk: 0, spd: 0 },
  fisher: { hp: 1, atk: 0, spd: 0 },
  hunter: { hp: 0, atk: 2, spd: 0 },
  cook: { hp: 2, atk: 0, spd: 0 },
  herbalist: { hp: 1, atk: 0, spd: 0 },
  smith: { hp: 0, atk: 2, spd: 0 },
  alchemist: { hp: 0, atk: 1, spd: 0 },
  steward: { hp: 3, atk: 0, spd: 0 },
  knight: { hp: 4, atk: 2, spd: -1 },
}

/**
 * 单一底版。按两名约 5 档工人（atk 8 / spd 4，合计约 240 伤/分）来定。
 * 绿杂兵 HP ≈ 10 分钟。出手必须慢：敌人会集火，先倒下一人后 DPS 减半。
 */
export const ENEMY_COMBAT_BASE: CombatStats = { hp: 2400, atk: 2, spd: 32 }

/**
 * 全阶共用强度乘区。SPD 是出手间隔，越小越快。
 * 小兵 / 精英 / Boss 都吃这一处，改表即可。
 */
export const ENEMY_COMBAT_POWER_MUL: Readonly<{ atk: number; spd: number }> = {
  atk: 1.35,
  spd: 0.65,
}

/** 敌人出手间隔（秒）。叠完全部乘区后再夹到这个闭区间。 */
export const ENEMY_SPD_MIN_S = 10
export const ENEMY_SPD_MAX_S = 30

/** 品质只微调 HP / ATK。橙首领再叠阶级倍率后约 20 分钟（×1.2）可斩杀。 */
export const ENEMY_COMBAT_QUALITY_MUL: Readonly<Record<EncounterQuality, number>> = {
  gray: 0.9,
  green: 1,
  blue: 1.08,
  purple: 1.12,
  orange: 1.2,
}

/** 阶级放大 HP / ATK，并拉长出手间隔。首领打得重但慢，无弱点时工人先倒下。 */
export const ENEMY_COMBAT_RANK_MUL: Readonly<Record<EnemyRank, CombatStats>> = {
  minion: { hp: 1, atk: 1, spd: 1 },
  elite: { hp: 1.3, atk: 1.2, spd: 1.25 },
  boss: { hp: 2.1, atk: 2, spd: 4 },
}

export type CombatStatus = 'idle' | 'fighting' | 'win' | 'lose' | 'claimed'

export const COMBAT_STATUS_LABEL: Record<CombatStatus, string> = {
  idle: '待战',
  fighting: '战斗中',
  win: '胜可领',
  lose: '战败',
  claimed: '已领',
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.floor(value)))
}

function scaleStat(qty: number, mul: number): number {
  if (!Number.isFinite(qty) || qty <= 0) return 1
  return Math.max(1, Math.round(qty * mul))
}

export function workerCombatStats(
  qualityTier: QualityTier,
  classId?: ClassId | null,
  level = 1,
  save?: Save,
  runeId?: RuneItemId,
): CombatStats {
  const base = WORKER_COMBAT_BY_TIER[qualityTier]
  const mod = classId ? CLASS_COMBAT_MOD[classId] : { hp: 0, atk: 0, spd: 0 }
  const raw: CombatStats = {
    hp: Math.max(1, base.hp + mod.hp),
    atk: Math.max(1, base.atk + mod.atk),
    spd: Math.max(1, base.spd + mod.spd),
  }
  return applyCombatTechStats(applyWorkerLevelStats(raw, level), save, runeId)
}

function applyCombatTechStats(stats: CombatStats, save?: Save, runeId?: RuneItemId): CombatStats {
  if (!save) return stats
  const runeMul = runeId ? runeAtkMul(save) : 1
  return {
    hp: Math.max(1, Math.round(stats.hp * workerHpMul(save))),
    atk: Math.max(1, Math.round(stats.atk * workerAtkMul(save) * runeMul)),
    spd: Math.max(1, stats.spd * attackIntervalMul(save)),
  }
}

/** 在品质底版 + 职业修正之上叠等级加成。 */
export function applyWorkerLevelStats(base: CombatStats, level = 1): CombatStats {
  const hpMul = workerLevelHpMul(level)
  const atkMul = workerLevelAtkMul(level)
  const spdMul = workerLevelSpdMul(level)
  const spdFloor = base.spd * WORKER_LEVEL_SPD_FLOOR
  return {
    hp: Math.max(1, Math.round(base.hp * hpMul)),
    atk: Math.max(1, Math.round(base.atk * atkMul)),
    spd: Math.max(1, Math.max(spdFloor, base.spd * spdMul)),
  }
}

export function workerLiveStats(worker: Worker, save?: Save, runeId?: RuneItemId): CombatStats {
  const stats = workerCombatStats(worker.qualityTier, worker.classId, worker.level ?? 1, save, runeId)
  return { ...stats, spd: jitterWorkerAtkInterval(stats.spd, worker.id) }
}

export function enemyCombatStats(
  quality: EncounterQuality,
  rank?: EnemyRank,
  chapter = 1,
): CombatStats {
  const resolvedRank = rank ?? enemyRankFor(quality)
  const qMul = ENEMY_COMBAT_QUALITY_MUL[quality]
  const rMul = ENEMY_COMBAT_RANK_MUL[resolvedRank]
  const cMul = chapterCombatMul(chapter)
  const power = ENEMY_COMBAT_POWER_MUL
  return {
    hp: scaleStat(ENEMY_COMBAT_BASE.hp, qMul * rMul.hp * cMul),
    atk: scaleStat(ENEMY_COMBAT_BASE.atk, qMul * rMul.atk * cMul * power.atk),
    spd: clampInt(Math.round(ENEMY_COMBAT_BASE.spd * rMul.spd * power.spd), ENEMY_SPD_MIN_S, ENEMY_SPD_MAX_S),
  }
}

export function fillWorkerHp(worker: Worker, rawHp?: unknown): Worker {
  const stats = workerLiveStats(worker)
  worker.hpMax = stats.hp
  if (typeof rawHp === 'number' && Number.isFinite(rawHp)) {
    worker.hp = clampInt(rawHp, 0, worker.hpMax)
  } else {
    worker.hp = worker.hpMax
  }
  return worker
}

export function isEnemyCombat(value: unknown): value is EnemyCombat {
  if (!value || typeof value !== 'object') return false
  const c = value as EnemyCombat
  return (
    typeof c.startedAt === 'number' &&
    typeof c.timeoutAt === 'number' &&
    Array.isArray(c.workerIds) &&
    Array.isArray(c.workers) &&
    !!c.enemy &&
    typeof c.enemy.id === 'string' &&
    typeof c.enemy.hp === 'number' &&
    Array.isArray(c.logs) &&
    (c.outcome === null || c.outcome === 'win' || c.outcome === 'lose')
  )
}

export function isFighting(enc: EnemyEncounter): boolean {
  return !!enc.combat && enc.combat.outcome === null && !enc.lootClaimed
}

export function isCombatWon(enc: EnemyEncounter): boolean {
  return !!enc.combat && enc.combat.outcome === 'win' && !enc.lootClaimed
}

export function isCombatLost(enc: EnemyEncounter): boolean {
  return !!enc.combat && enc.combat.outcome === 'lose' && !enc.lootClaimed
}

export function combatStatus(enc: EnemyEncounter): CombatStatus {
  if (enc.lootClaimed) return 'claimed'
  if (isFighting(enc)) return 'fighting'
  if (isCombatWon(enc)) return 'win'
  if (isCombatLost(enc)) return 'lose'
  return 'idle'
}

export function combatPartyCap(enc?: EnemyEncounter | null): number {
  return isDungeonEncounter(enc) ? DUNGEON_PARTY_MAX : COMBAT_PARTY_MAX
}

function addBusyCombatIds(ids: Set<string>, combat: EnemyCombat | null | undefined): void {
  if (!combat) return
  const phase = combatPhaseOf(combat)
  if (phase === 'marchOut') {
    for (const id of combat.workerIds) ids.add(id)
  } else if (phase === 'fighting' || phase === 'marchHomeWin' || phase === 'marchHomeLose') {
    for (const fighter of combat.workers) {
      if (fighter.hp > 0) ids.add(fighter.id)
    }
  }
  for (const row of combat.incoming ?? []) ids.add(row.id)
  for (const row of combat.returning ?? []) ids.add(row.id)
}

export function fightingWorkerIds(save: Save): Set<string> {
  const ids = new Set<string>()
  const boards = [...(save.encounters ?? [])]
  for (const enc of save.dungeon?.encounters ?? []) boards.push(enc)
  for (const enc of boards) {
    if (enc.kind !== 'enemy') continue
    addBusyCombatIds(ids, enc.combat)
  }
  return ids
}

/** 与工人页劳损底色一致：wearHp/hpMax 铺满才算出战满血。 */
export function isFullCombatHp(worker: Worker): boolean {
  return workerWearHp(worker) >= Math.max(1, Math.floor(worker.hpMax))
}

export function workerCombatNotReadyTip(worker: Worker): string | null {
  if (isFullCombatHp(worker)) return null
  return '未满血（含劳损）'
}

/** 订单卡友方栏：只列仍在场且 HP>0 的人，不留 0 血壳或空位。 */
export function combatRosterFighters(combat: EnemyCombat | null | undefined): CombatFighter[] {
  if (!combat) return []
  return combat.workers.filter((fighter) => fighter.hp > 0)
}

export function fieldFighterCount(enc: EnemyEncounter): number {
  const combat = enc.combat
  if (!combat) return 0
  const phase = combatPhaseOf(combat)
  if (phase === 'marchOut') {
    const ids = new Set(combat.workerIds)
    for (const row of combat.incoming ?? []) ids.add(row.id)
    return ids.size
  }
  if (phase !== 'fighting') return 0
  const ids = new Set(combatRosterFighters(combat).map((fighter) => fighter.id))
  for (const row of combat.incoming ?? []) ids.add(row.id)
  return ids.size
}

export function canReinforceCombat(enc: EnemyEncounter): boolean {
  if (!isFighting(enc)) return false
  const phase = combatPhaseOf(enc.combat)
  if (phase !== 'fighting' && phase !== 'marchOut') return false
  return fieldFighterCount(enc) < combatPartyCap(enc)
}

/** 胜负已定但人还在路上，或仍有个人溃退。不能把这张单重开掉。 */
export function combatReturnBlockReason(enc: EnemyEncounter): string | null {
  const combat = enc.combat
  if (!combat) return null
  const phase = combatPhaseOf(combat)
  if (phase === 'marchHomeWin' || phase === 'marchHomeLose') return '工人尚未归来'
  if (combat.outcome && (combat.returning?.length ?? 0) > 0) return '工人尚未归来'
  return null
}

export function isWorkerInCombat(save: Save, workerId: string): boolean {
  return fightingWorkerIds(save).has(workerId)
}

export function restCombatCandidates(save: Save): Worker[] {
  const busy = fightingWorkerIds(save)
  return save.workers.filter(
    (w) =>
      w.guest !== true &&
      !w.id.startsWith('assist-') &&
      w.assignment === null &&
      !busy.has(w.id) &&
      !isWorkerInTreasureMine(save, w.id),
  )
}

export function selectableCombatWorkers(save: Save): Worker[] {
  return restCombatCandidates(save).filter(isFullCombatHp)
}

export type CombatTipKind = 'ok' | 'err'
export type CombatLogSink = (encounterId: string, text: string, kind: CombatTipKind) => void

export function combatPartyBlockReason(
  save: Save,
  workerIds: readonly string[],
  guests: readonly Worker[] = [],
  maxParty = COMBAT_PARTY_MAX,
): string | null {
  if (!workerIds.length) return '请选择出战工人'
  if (workerIds.length > maxParty) return `最多选 ${maxParty} 人`
  const seen = new Set<string>()
  const busy = fightingWorkerIds(save)
  for (const id of workerIds) {
    if (seen.has(id)) return '不能重复选同一个人'
    seen.add(id)
    const roster = save.workers.find((w) => w.id === id && w.guest !== true && !w.id.startsWith('assist-'))
    const worker = roster ?? guests.find((w) => w.id === id && (w.guest === true || w.id.startsWith('assist-')))
    if (!worker) return '没有这个工人'
    if (worker.assignment !== null) return `${worker.name ?? worker.id} 不在休息`
    const mineBusy = treasureMineBlockReason(save, id)
    if (mineBusy) return `${worker.name ?? worker.id} ${mineBusy}`
    if (busy.has(id)) return `${worker.name ?? worker.id} 正在战斗`
    if (!isFullCombatHp(worker)) return `${worker.name ?? worker.id} 未满血`
  }
  return null
}

function pushLog(combat: EnemyCombat, at: number, text: string): void {
  combat.logs.push({ at, text })
  if (combat.logs.length > COMBAT_LOG_CAP) {
    combat.logs.splice(0, combat.logs.length - COMBAT_LOG_CAP)
  }
}

function emitLog(
  enc: EnemyEncounter,
  combat: EnemyCombat,
  at: number,
  text: string,
  kind: CombatTipKind,
  onLog?: CombatLogSink,
): void {
  pushLog(combat, at, text)
  onLog?.(enc.id, text, kind)
}

export function recentCombatLogs(enc: EnemyEncounter, n = 4): CombatLogEntry[] {
  const logs = enc.combat?.logs ?? []
  return logs.slice(-n)
}

/** 出手周期（毫秒）。结算与卡面蓄力条共用，展示不得另写一套间隔。 */
export function actIntervalMs(spd: number): number {
  return Math.max(1, spd) * 1000
}

/** 场上没活人时敌方 nextActAt 停在这里。有限大数，存档可写；蓄力条算出来是 0。 */
export const ENEMY_ACT_HELD_AT = Number.MAX_SAFE_INTEGER

function holdEnemyIfFieldEmpty(combat: EnemyCombat): void {
  if (combat.enemy.hp <= 0) return
  if (livingWorkers(combat).length > 0) return
  combat.enemy.nextActAt = ENEMY_ACT_HELD_AT
}

function releaseEnemyAct(combat: EnemyCombat, now: number): void {
  let next = now + actIntervalMs(combat.enemy.spd)
  const stunUntil = combat.stunnedUntil
  if (typeof stunUntil === 'number' && stunUntil > next && (combat.shield ?? 0) <= 0) next = stunUntil
  combat.enemy.nextActAt = next
}

function makeFighter(
  id: string,
  label: string,
  stats: CombatStats,
  hp: number,
  now: number,
  combatAttrs?: CombatAttrId[],
  actImmediately = false,
  save?: Save,
  runeId?: RuneItemId,
  openingSwing = false,
): CombatFighter {
  const spd = Math.max(1, stats.spd * runeSpdMul(runeId))
  const hpMax = Math.max(1, stats.hp)
  const intervalMs = actIntervalMs(spd)
  const firstCutMs = openingSwing && save ? Math.round(firstStrikeCutS(save) * 1000) : 0
  return {
    id,
    label,
    hp: clampInt(hp, 0, hpMax),
    hpMax,
    atk: Math.max(1, stats.atk),
    spd,
    nextActAt: actImmediately ? now : now + Math.max(0, intervalMs - firstCutMs),
    ...(combatAttrs && combatAttrs.length ? { combatAttrs: [...combatAttrs] } : {}),
    ...(runeId ? { runeId } : {}),
  }
}

function fighterFromWorker(
  worker: Worker,
  now: number,
  save?: Save,
  runeId?: RuneItemId,
  openingSwing = false,
  reinforced = false,
): CombatFighter {
  const stats = workerLiveStats(worker, save, runeId)
  const hpMax = Math.max(1, stats.hp)
  const hp = worker.hpMax > 0 ? Math.round((worker.hp / worker.hpMax) * hpMax) : hpMax
  const fighter = makeFighter(
    worker.id,
    worker.name ?? worker.id,
    { ...stats, hp: hpMax },
    hp,
    now,
    worker.combatAttrs,
    false,
    save,
    runeId,
    openingSwing,
  )
  if (reinforced) {
    fighter.reinforced = true
    fighter.reinforceHitPending = true
  }
  return fighter
}

function revealInsightWeakness(enc: EnemyEncounter, combat: EnemyCombat): void {
  if (combat.insightUsed) return
  if (!hasInsightRune(combat.workers)) return
  const hidden = enc.weaknesses.filter((id) => !enc.revealedWeaknesses.includes(id))
  if (!hidden.length) {
    combat.insightUsed = true
    return
  }
  enc.revealedWeaknesses = [...enc.revealedWeaknesses, hidden[0]]
  combat.insightUsed = true
}

function shieldRoll(enc: EnemyEncounter, now: number, save?: Save): () => number {
  if (save) return () => roll01(save)
  return roll01Bag(hashString(`${enc.id}:${now}`))
}

export function ensureCombatShield(enc: EnemyEncounter, now: number, save?: Save): void {
  const combat = enc.combat
  if (!combat) return
  const max = combat.shieldMax
  if (typeof max === 'number' && Number.isFinite(max) && max >= 1) {
    if (typeof combat.shield !== 'number' || !Number.isFinite(combat.shield)) {
      combat.shield = max
    } else {
      combat.shield = clampInt(combat.shield, 0, max)
    }
    if (combat.stunnedUntil === undefined) combat.stunnedUntil = null
    return
  }
  const rolled = rollEnemyShield(enc.enemyRank, shieldRoll(enc, now, save))
  combat.shieldMax = rolled
  combat.shield = rolled
  combat.stunnedUntil = null
}

function dungeonPhaseLocked(enc: EnemyEncounter): boolean {
  return isDungeonEncounter(enc) && dungeonPhaseIndex(enc.dungeonPhase) < 3
}

function dungeonJaggedBonus(save: Save, enc: EnemyEncounter): number {
  const affix = hasEncounterAffix(save, enc, 'jagged') ? DUNGEON_AFFIX_FX.jaggedExtra : 0
  return affix + dungeonBossJaggedExtra(enc)
}

function wakeCombatShield(enc: EnemyEncounter, combat: EnemyCombat, at: number): void {
  if (isDungeonEncounter(enc) && onDungeonWake(enc, combat, at)) return
  const max = Math.max(1, Math.floor(combat.shieldMax ?? 1))
  combat.shieldMax = max
  combat.shield = max
  combat.stunnedUntil = null
}

function applyBreak(
  enc: EnemyEncounter,
  combat: EnemyCombat,
  at: number,
  onLog?: CombatLogSink,
  save?: Save,
): void {
  combat.shield = 0
  const shortStun = hasEncounterAffix(save, enc, 'shortStun')
  const stunMs = isDungeonEncounter(enc)
    ? onDungeonBreak(enc, dungeonStunS(shortStun))
    : Math.max(1000, enemyStunMs(enc.enemyRank) + (shortStun ? DUNGEON_AFFIX_FX.shortStunDelta * 1000 : 0))
  combat.stunnedUntil = at + stunMs
  if (combat.enemy.nextActAt < combat.stunnedUntil) {
    combat.enemy.nextActAt = combat.stunnedUntil
  }
  emitLog(enc, combat, at, BREAK_TIP, 'ok', onLog)
}

export type BeginCombatOpts = {
  stats?: CombatStats
  shield?: number
  timeoutS?: number
  runes?: Partial<Record<string, RuneItemId>>
}

function buildEnemyCombat(
  enc: EnemyEncounter,
  workers: Worker[],
  now: number,
  chapter = 1,
  onLog?: CombatLogSink,
  save?: Save,
  opts?: BeginCombatOpts,
): EnemyCombat {
  ensureEnemyIntel(enc, 0, 0, save)
  const eStats =
    opts?.stats ??
    applyCombatAffixStats(enemyCombatStats(enc.quality, enc.enemyRank, chapter), encounterAffixIds(save, enc))
  const timeoutS = opts?.timeoutS ?? combatTimeoutS(enc.enemyRank)
  const runes = opts?.runes ?? {}
  const combat: EnemyCombat = {
    startedAt: now,
    timeoutAt: now + timeoutS * 1000,
    workerIds: workers.map((w) => w.id),
    workers: workers.map((w) => fighterFromWorker(w, now, save, runes[w.id], true)),
    enemy: makeFighter('enemy', enc.label, eStats, eStats.hp, now, undefined, true),
    logs: [],
    outcome: null,
    stunnedUntil: null,
    insightUsed: false,
    runeLoadout: { ...runes },
    phase: 'fighting',
    returning: [],
    incoming: [],
  }
  enc.combat = combat
  revealInsightWeakness(enc, combat)
  const rolled =
    typeof opts?.shield === 'number' && opts.shield >= 1
      ? Math.floor(opts.shield)
      : rollEnemyShield(enc.enemyRank, shieldRoll(enc, now, save)) +
        (hasEncounterAffix(save, enc, 'ironShield') ? DUNGEON_AFFIX_FX.ironShieldBonus : 0)
  combat.shieldMax = rolled
  combat.shield = rolled
  emitLog(enc, combat, now, `${workers.map((w) => w.name ?? w.id).join('、')} 出战`, 'ok', onLog)
  enc.departed = true
  enc.lootClaimed = false
  return combat
}

/** 直接开打。测试和行军到点后走这里。选人确认走 `openCombatMarch`。 */
export function beginEnemyCombat(
  enc: EnemyEncounter,
  workers: Worker[],
  now: number,
  chapter = 1,
  onLog?: CombatLogSink,
  save?: Save,
  opts?: BeginCombatOpts,
): EnemyCombat {
  const combat = buildEnemyCombat(enc, workers, now, chapter, onLog, save, opts)
  if (save) stepEnemyCombat(save, enc, now, onLog)
  return combat
}

/** 选人确认：人立刻离开休息，到点才 `beginEnemyCombat`。 */
export function openCombatMarch(
  enc: EnemyEncounter,
  workers: Worker[],
  now: number,
  chapter = 1,
  onLog?: CombatLogSink,
  save?: Save,
  opts?: BeginCombatOpts,
): EnemyCombat {
  ensureEnemyIntel(enc, 0, 0, save)
  const eStats =
    opts?.stats ??
    applyCombatAffixStats(enemyCombatStats(enc.quality, enc.enemyRank, chapter), encounterAffixIds(save, enc))
  const dur = marchDurationMs(save)
  const runes = opts?.runes ?? {}
  const guests = workers.filter((worker) => worker.guest === true || worker.id.startsWith('assist-'))
  const combat: EnemyCombat = {
    startedAt: now,
    timeoutAt: now,
    workerIds: workers.map((w) => w.id),
    workers: [],
    enemy: makeFighter('enemy', enc.label, eStats, eStats.hp, now + dur, undefined, false),
    logs: [],
    outcome: null,
    stunnedUntil: null,
    insightUsed: false,
    runeLoadout: { ...runes },
    phase: 'marchOut',
    phaseStartedAt: now,
    phaseEndsAt: now + dur,
    returning: [],
    incoming: [],
    marchPlan: {
      chapter,
      runes: { ...runes },
      stats: opts?.stats,
      shield: opts?.shield,
      timeoutS: opts?.timeoutS,
      guests: guests.map((worker) => structuredClone(worker)),
    },
  }
  enc.combat = combat
  emitLog(enc, combat, now, `${workers.map((w) => w.name ?? w.id).join('、')} 行军`, 'ok', onLog)
  enc.departed = true
  enc.lootClaimed = false
  return combat
}

/** 战斗中增援：满血休息工人入场，不重置敌血与超时。 */
export function addCombatReinforcements(
  enc: EnemyEncounter,
  workers: Worker[],
  now: number,
  onLog?: CombatLogSink,
  save?: Save,
  runes?: Partial<Record<string, RuneItemId>>,
): void {
  const combat = enc.combat
  if (!combat || combat.outcome || enc.lootClaimed || !workers.length) return
  const fieldWasEmpty = livingWorkers(combat).length === 0
  const added: CombatFighter[] = []
  for (const worker of workers) {
    if (combat.workers.some((row) => row.id === worker.id)) continue
    const fighter = fighterFromWorker(worker, now, save, runes?.[worker.id], false, true)
    const reinforceDelay = Math.max(
      dungeonBossReinforceDelayMs(enc),
      save && hasEncounterAffix(save, enc, 'slowReinforce') ? DUNGEON_AFFIX_FX.reinforceDelayMs : 0,
    )
    if (reinforceDelay > 0) fighter.nextActAt = now + reinforceDelay
    combat.workers.push(fighter)
    added.push(fighter)
    if (!combat.workerIds.includes(worker.id)) combat.workerIds.push(worker.id)
    if (runes?.[worker.id]) {
      if (!combat.runeLoadout) combat.runeLoadout = {}
      combat.runeLoadout[worker.id] = runes[worker.id]
    }
  }
  if (!added.length) return
  if (fieldWasEmpty && livingWorkers(combat).length > 0) releaseEnemyAct(combat, now)
  revealInsightWeakness(enc, combat)
  emitLog(enc, combat, now, `${added.map((w) => w.label).join('、')} 增援`, 'ok', onLog)
}

/** 增援先行军，到点再入编。 */
export function queueCombatReinforcements(
  enc: EnemyEncounter,
  workers: Worker[],
  now: number,
  onLog?: CombatLogSink,
  save?: Save,
  runes?: Partial<Record<string, RuneItemId>>,
): void {
  const combat = enc.combat
  if (!combat || combat.outcome || enc.lootClaimed || !workers.length) return
  if (!combat.incoming) combat.incoming = []
  const dur = marchDurationMs(save)
  const added: string[] = []
  for (const worker of workers) {
    if (combat.workers.some((row) => row.id === worker.id)) continue
    if (combat.incoming.some((row) => row.id === worker.id)) continue
    if (combatPhaseOf(combat) === 'marchOut' && combat.workerIds.includes(worker.id)) continue
    combat.incoming.push({
      id: worker.id,
      arrivesAt: now + dur,
      startedAt: now,
      runeId: runes?.[worker.id],
      reinforced: true,
      guest: worker.guest === true || worker.id.startsWith('assist-') ? structuredClone(worker) : undefined,
    })
    if (runes?.[worker.id]) {
      if (!combat.runeLoadout) combat.runeLoadout = {}
      combat.runeLoadout[worker.id] = runes[worker.id]
    }
    added.push(worker.name ?? worker.id)
  }
  if (!added.length) return
  emitLog(enc, combat, now, `${added.join('、')} 行军`, 'ok', onLog)
}

function livingWorkers(combat: EnemyCombat): CombatFighter[] {
  return combatRosterFighters(combat)
}

function dropDownedFighters(combat: EnemyCombat): CombatFighter[] {
  const fallen = combat.workers.filter((fighter) => fighter.hp <= 0)
  if (!fallen.length) return []
  combat.workers = combat.workers.filter((fighter) => fighter.hp > 0)
  return fallen
}

/** 读档：把残留的 0 血壳从订单名单摘掉并写回休息，不补战报。 */
export function hydrateCombatRoster(save: Save, enc: EnemyEncounter): void {
  const combat = enc.combat
  if (!combat) return
  for (const fighter of dropDownedFighters(combat)) {
    writeBackFighterHp(save, fighter)
    const worker = save.workers.find((w) => w.id === fighter.id)
    if (worker && worker.assignment !== null) worker.assignment = null
    if (worker) offerRestFood(save, worker.id, save.lastTick || Date.now())
  }
}

export function pickEnemyTarget(combat: EnemyCombat): CombatFighter | undefined {
  const living = livingWorkers(combat)
  if (!living.length) return undefined
  let best = living[0]
  let bestRatio = best.hp / Math.max(1, best.hpMax)
  let bestOrder = combat.workerIds.indexOf(best.id)
  for (let i = 1; i < living.length; i++) {
    const w = living[i]
    const ratio = w.hp / Math.max(1, w.hpMax)
    const order = combat.workerIds.indexOf(w.id)
    if (ratio < bestRatio || (ratio === bestRatio && (order < bestOrder || (order === bestOrder && w.id < best.id)))) {
      best = w
      bestRatio = ratio
      bestOrder = order
    }
  }
  return best
}

function writeBackFighterHp(save: Save, fighter: CombatFighter): void {
  const worker = save.workers.find((w) => w.id === fighter.id)
  if (!worker) return
  worker.hp = clampInt(fighter.hp, 0, worker.hpMax)
}

/** 倒地归来到点：写回休息，再上绷带和自动吃饭。 */
export function applyDownedReturn(save: Save, workerId: string, hp: number, now: number): void {
  const worker = save.workers.find((row) => row.id === workerId)
  if (!worker || isAssistWorker(worker)) return
  worker.assignment = null
  worker.hp = clampInt(hp, 0, worker.hpMax)
  applyDownedRecovery(save, worker, now)
  offerRestFood(save, workerId, now)
}

function writeBackWorkers(save: Save, combat: EnemyCombat): void {
  for (const fighter of combat.workers) {
    const worker = save.workers.find((w) => w.id === fighter.id)
    if (!worker) continue
    writeBackFighterHp(save, fighter)
    if (worker.assignment !== null) worker.assignment = null
  }
}

function retireFallenFighters(
  save: Save,
  enc: EnemyEncounter,
  combat: EnemyCombat,
  at: number,
  onLog?: CombatLogSink,
): void {
  const fallen = dropDownedFighters(combat)
  if (!fallen.length) return
  if (!combat.returning) combat.returning = []
  const dur = marchDurationMs(save)
  for (const fighter of fallen) {
    writeBackFighterHp(save, fighter)
    const worker = save.workers.find((w) => w.id === fighter.id)
    if (worker && worker.assignment !== null) worker.assignment = null
    if (!combat.returning.some((row) => row.id === fighter.id)) {
      combat.returning.push({
        id: fighter.id,
        until: at + dur,
        startedAt: at,
        reason: 'down',
        hp: clampInt(fighter.hp, 0, fighter.hpMax),
        label: fighter.label,
      })
    }
    emitLog(enc, combat, at, `${fighter.label} 倒下，溃退归来`, 'err', onLog)
  }
}

function settleCombatReturns(save: Save, combat: EnemyCombat, now: number): void {
  const pending = combat.returning ?? []
  if (!pending.length) return
  const stay: CombatReturnee[] = []
  const arrived: string[] = []
  for (const row of pending) {
    if (now < row.until) {
      stay.push(row)
      continue
    }
    if (row.reason === 'down') applyDownedReturn(save, row.id, row.hp, now)
    else {
      const worker = save.workers.find((workerRow) => workerRow.id === row.id)
      if (worker) worker.assignment = null
    }
    arrived.push(row.id)
  }
  combat.returning = stay
  for (const id of arrived) offerRestFood(save, id, now)
}

function releaseHomePhase(combat: EnemyCombat): void {
  delete combat.phase
  delete combat.phaseStartedAt
  delete combat.phaseEndsAt
}

function parkUnfielded(save: Save, combat: EnemyCombat, at: number, dur: number): void {
  if (!combat.returning) combat.returning = []
  const staying = new Set<string>([
    ...combat.workers.filter((fighter) => fighter.hp > 0).map((fighter) => fighter.id),
    ...combat.returning.map((row) => row.id),
  ])
  const extras = [
    ...combat.workerIds.filter((id) => !staying.has(id) && !combat.workers.some((fighter) => fighter.id === id)),
    ...(combat.incoming ?? []).map((row) => row.id),
  ]
  const reason = combat.outcome === 'win' ? 'win' : 'lose'
  for (const id of extras) {
    if (staying.has(id)) continue
    staying.add(id)
    const worker = save.workers.find((row) => row.id === id)
    combat.returning.push({
      id,
      until: at + dur,
      startedAt: at,
      reason,
      hp: worker?.hp ?? 0,
      label: worker?.name ?? id,
    })
  }
  combat.incoming = []
}

function grantRuneBloodXp(save: Save, combat: EnemyCombat): void {
  const loadout = combat.runeLoadout ?? {}
  for (const workerId of combat.workerIds) {
    const bonus = runeBloodXp(loadout[workerId] ?? fighterRuneId(combat.workers.find((row) => row.id === workerId)))
    if (bonus <= 0) continue
    const worker = save.workers.find((row) => row.id === workerId)
    if (!worker || isAssistWorker(worker)) continue
    grantWorkerCombatXp(worker, bonus)
  }
}

function finishCombat(
  save: Save,
  enc: EnemyEncounter,
  combat: EnemyCombat,
  at: number,
  outcome: CombatOutcome,
  text: string,
  onLog?: CombatLogSink,
): void {
  retireFallenFighters(save, enc, combat, at, onLog)
  combat.outcome = outcome
  emitLog(enc, combat, at, text, outcome === 'win' ? 'ok' : 'err', onLog)
  grantRuneBloodXp(save, combat)
  writeBackWorkers(save, combat)
  const dur = marchDurationMs(save)
  combat.phase = outcome === 'win' ? 'marchHomeWin' : 'marchHomeLose'
  combat.phaseStartedAt = at
  combat.phaseEndsAt = at + dur
  parkUnfielded(save, combat, at, dur)
}

export function endEnemyCombat(
  save: Save,
  enc: EnemyEncounter,
  at: number,
  outcome: CombatOutcome,
  text: string,
  onLog?: CombatLogSink,
): void {
  const combat = enc.combat
  if (!combat || combat.outcome) return
  finishCombat(save, enc, combat, at, outcome, text, onLog)
}

function strike(
  save: Save,
  enc: EnemyEncounter,
  combat: EnemyCombat,
  at: number,
  attacker: CombatFighter,
  target: CombatFighter,
  onLog?: CombatLogSink,
): void {
  if (attacker.hp <= 0 || target.hp <= 0) return
  if (attacker.id !== 'enemy') {
    const result = resolveWorkerAttack(enc, attacker.combatAttrs ?? [], attacker.atk, save)
    if (result.newlyRevealed.length) {
      emitLog(enc, combat, at, `揭示弱点：${formatWeaknessLabels(result.newlyRevealed)}`, 'ok', onLog)
    }
    const hits = result.hits.length
    if (hits > 0 && !isCombatStunned(combat, at) && (combat.shield ?? 0) > 0) {
      combat.shield = Math.max(0, (combat.shield ?? 0) - hits - runeBreakBonus(fighterRuneId(attacker)))
      if (combat.shield <= 0) applyBreak(enc, combat, at, onLog, save)
    }
    const stunned = isCombatStunned(combat, at)
    const vuln = stunned ? BREAK_VULN_MUL : 1
    const echo = stunned ? breakEchoMul(save) : 1
    const counterKeep = dungeonBossCounterKeep(enc)
    const dull = hasEncounterAffix(save, enc, 'dullEdge')
      ? DUNGEON_AFFIX_FX.dullEdgeDamageMul
      : counterKeep < 1
        ? 1 + (result.mul - 1) * counterKeep
        : result.mul
    let firstHitMul = 1
    if (attacker.reinforceHitPending) {
      if (attacker.reinforced) firstHitMul = reinforceFirstMul(save)
      attacker.reinforceHitPending = false
    }
    const mul = dull * vuln * echo * runeDealMul(fighterRuneId(attacker)) * firstHitMul
    const damage = scaledAttackDamage(attacker.atk, mul)
    target.hp = Math.max(0, target.hp - damage)
    if (isDungeonEncounter(enc) && dungeonPhaseLocked(enc) && target.id === 'enemy' && target.hp <= 0) {
      target.hp = 1
    }
    const mulText = mul > 1 ? ` ×${mul}` : ''
    const hitText = result.hits.length ? `${formatWeaknessCritTip(result.hits)}${mulText}` : ''
    const tail = hitText ? `（${hitText}）（${target.hp}/${target.hpMax}）` : `（${target.hp}/${target.hpMax}）`
    emitLog(enc, combat, at, `${attacker.label} 对 ${target.label} 造成 ${damage}${tail}`, 'ok', onLog)
    return
  }
  const woundedMul =
    target.hpMax > 0 && target.hp / target.hpMax <= HP_WOUNDED_RATIO ? woundedTakenMul(save) : 1
  const hit = Math.max(
    1,
    Math.round((attacker.atk + dungeonJaggedBonus(save, enc)) * runeTakenMul(fighterRuneId(target)) * woundedMul),
  )
  target.hp = Math.max(0, target.hp - hit)
  writeBackFighterHp(save, target)
  emitLog(
    enc,
    combat,
    at,
    `${attacker.label} 对 ${target.label} 造成 ${hit}（${target.hp}/${target.hpMax}）`,
    'err',
    onLog,
  )
  if (target.hp <= 0) retireFallenFighters(save, enc, combat, at, onLog)
}

/** 工坊在岗：扣同一 hp，可到 0。到 0 与力竭一样立刻回休息，不行军。残血留在岗，不吃伙食。 */
function strikeWorkshop(
  save: Save,
  enc: EnemyEncounter,
  combat: EnemyCombat,
  at: number,
  attacker: CombatFighter,
  target: CombatTarget,
  onLog?: CombatLogSink,
): void {
  if (attacker.hp <= 0) return
  const worker = save.workers.find((w) => w.id === target.id)
  if (!worker || worker.hp <= 0) return
  const affixRage = hasEncounterAffix(save, enc, 'workshopRage') ? DUNGEON_AFFIX_FX.workshopRageMul : 1
  const rage = affixRage * dungeonBossWorkshopMul(enc)
  const woundedMul = isWoundedHp(worker) ? woundedTakenMul(save) : 1
  const hit = Math.max(1, Math.round((attacker.atk + dungeonJaggedBonus(save, enc)) * rage * woundedMul))
  worker.hp = Math.max(0, worker.hp - hit)
  emitLog(
    enc,
    combat,
    at,
    `${attacker.label} 对 ${target.label} 造成 ${hit}（工坊）（${worker.hp}/${worker.hpMax}）`,
    'err',
    onLog,
  )
  const stationId = target.stationId ?? worker.assignment
  if (worker.hp <= 0 && stationId) releaseDeadWorker(save, stationId, worker, at)
}

function resolveEnemyStrikeTargets(
  save: Save,
  enc: EnemyEncounter,
  combat: EnemyCombat,
  at = 0,
): CombatTarget[] {
  if (livingWorkers(combat).length === 0) return []
  if (isDungeonEncounter(enc)) maybeRotateDungeonTarget(enc, at)
  let rule = drawEnemyTargetRule(save, enc)
  if (isDungeonEncounter(enc) && enc.dungeonMechanic === 'cleave' && rule === 'rand1') rule = 'cleave2'
  if (isDungeonEncounter(enc) && enc.dungeonMechanic === 'workshopSmash') rule = 'workshopBias'
  const picked = pickEnemyTargets(save, combat, rule, () => roll01(save))
  if (picked.length) return picked
  const fallback = pickEnemyTarget(combat)
  if (!fallback) return []
  return [
    {
      id: fallback.id,
      label: fallback.label,
      hp: fallback.hp,
      hpMax: fallback.hpMax,
      lane: 'frontline',
      stationId: null,
    },
  ]
}

function actorSort(a: CombatFighter, b: CombatFighter): number {
  const aEnemy = a.id === 'enemy' ? 1 : 0
  const bEnemy = b.id === 'enemy' ? 1 : 0
  if (aEnemy !== bEnemy) return aEnemy - bEnemy
  return a.id.localeCompare(b.id)
}

function nextIncomingAt(combat: EnemyCombat): number | null {
  const times = (combat.incoming ?? []).map((row) => row.arrivesAt)
  if (!times.length) return null
  return Math.min(...times)
}

function flushDueIncoming(
  save: Save,
  enc: EnemyEncounter,
  combat: EnemyCombat,
  at: number,
  onLog?: CombatLogSink,
): void {
  const due = (combat.incoming ?? []).filter((row) => row.arrivesAt <= at)
  if (!due.length) return
  combat.incoming = (combat.incoming ?? []).filter((row) => row.arrivesAt > at)
  const guests = combat.marchPlan?.guests ?? due.flatMap((row) => (row.guest ? [row.guest] : []))
  const extras: Worker[] = []
  const runes: Partial<Record<string, RuneItemId>> = {}
  for (const row of due) {
    const worker = row.guest ?? findCombatPartyWorker(save, row.id, guests)
    if (!worker) continue
    extras.push(worker)
    if (row.runeId) runes[worker.id] = row.runeId
  }
  if (extras.length) addCombatReinforcements(enc, extras, at, onLog, save, runes)
}

function arriveMarch(save: Save, enc: EnemyEncounter, at: number, onLog?: CombatLogSink): void {
  const prev = enc.combat
  if (!prev || combatPhaseOf(prev) !== 'marchOut') return
  const plan = prev.marchPlan ?? { chapter: 1, runes: { ...(prev.runeLoadout ?? {}) } }
  const guests = plan.guests ?? []
  const party = prev.workerIds
    .map((id) => findCombatPartyWorker(save, id, guests))
    .filter((worker): worker is Worker => !!worker)
  const oldLogs = [...prev.logs]
  const returning = [...(prev.returning ?? [])]
  const incoming = [...(prev.incoming ?? [])]
  const armed = buildEnemyCombat(enc, party, at, plan.chapter, onLog, save, {
    stats: plan.stats,
    shield: plan.shield,
    timeoutS: plan.timeoutS,
    runes: plan.runes,
  })
  armed.logs = [...oldLogs, ...armed.logs]
  armed.returning = returning
  const due = incoming.filter((row) => row.arrivesAt <= at)
  armed.incoming = incoming.filter((row) => row.arrivesAt > at)
  if (!due.length) return
  const extras: Worker[] = []
  const runes: Partial<Record<string, RuneItemId>> = {}
  for (const row of due) {
    const worker = row.guest ?? findCombatPartyWorker(save, row.id, guests)
    if (!worker) continue
    extras.push(worker)
    if (row.runeId) runes[worker.id] = row.runeId
  }
  if (extras.length) addCombatReinforcements(enc, extras, at, onLog, save, runes)
}

function closeMarchHome(save: Save, combat: EnemyCombat, now: number): void {
  settleCombatReturns(save, combat, now)
  const phase = combatPhaseOf(combat)
  if ((phase === 'marchHomeWin' || phase === 'marchHomeLose') && now >= (combat.phaseEndsAt ?? 0)) {
    const ids = combat.workers.filter((fighter) => fighter.hp > 0).map((fighter) => fighter.id)
    releaseHomePhase(combat)
    for (const id of ids) offerRestFood(save, id, now)
  }
}

function nextActionAt(combat: EnemyCombat): number | null {
  const living = livingWorkers(combat)
  const times = living.map((f) => f.nextActAt)
  if (living.length > 0 && combat.enemy.hp > 0) {
    const stunUntil = combat.stunnedUntil
    if (typeof stunUntil === 'number' && stunUntil > 0 && (combat.shield ?? 0) <= 0) {
      times.push(stunUntil)
      if (combat.enemy.nextActAt >= stunUntil) times.push(combat.enemy.nextActAt)
    } else {
      times.push(combat.enemy.nextActAt)
    }
  }
  if (!times.length) return null
  return Math.min(...times)
}

export function stepEnemyCombat(save: Save, enc: EnemyEncounter, now: number, onLog?: CombatLogSink): void {
  let combat = enc.combat
  if (!combat) return
  settleCombatReturns(save, combat, now)
  if (enc.lootClaimed) {
    closeMarchHome(save, combat, now)
    return
  }
  if (combatPhaseOf(combat) === 'marchOut') {
    if (now < (combat.phaseEndsAt ?? Number.POSITIVE_INFINITY)) return
    arriveMarch(save, enc, combat.phaseEndsAt ?? now, onLog)
    combat = enc.combat
    if (!combat) return
  }
  const phase = combatPhaseOf(combat)
  if (phase === 'marchHomeWin' || phase === 'marchHomeLose') {
    closeMarchHome(save, combat, now)
    return
  }
  if (combat.outcome || phase === 'settled') {
    settleCombatReturns(save, combat, now)
    return
  }
  ensureCombatShield(enc, combat.startedAt, save)

  let lastAt = combat.startedAt
  while (combat.outcome === null) {
    retireFallenFighters(save, enc, combat, lastAt, onLog)
    if (combat.enemy.hp <= 0) {
      if (dungeonPhaseLocked(enc)) {
        combat.enemy.hp = 1
      } else {
        finishCombat(save, enc, combat, lastAt, 'win', '战斗胜利', onLog)
        break
      }
    }
    if (combat.outcome) break
    holdEnemyIfFieldEmpty(combat)

    const arriveAt = nextIncomingAt(combat)
    const actAt = nextActionAt(combat)
    const nextAt =
      arriveAt == null ? actAt : actAt == null ? arriveAt : Math.min(arriveAt, actAt)
    if (nextAt == null) {
      if (now >= combat.timeoutAt) {
        finishCombat(save, enc, combat, Math.min(now, combat.timeoutAt), 'lose', '超时判败', onLog)
      }
      break
    }
    if (nextAt > combat.timeoutAt || (now >= combat.timeoutAt && nextAt > now)) {
      finishCombat(save, enc, combat, Math.min(now, combat.timeoutAt), 'lose', '超时判败', onLog)
      break
    }
    if (nextAt > now) break

    if (arriveAt != null && arriveAt === nextAt && (actAt == null || arriveAt <= actAt)) {
      flushDueIncoming(save, enc, combat, nextAt, onLog)
      lastAt = nextAt
      continue
    }

    const living = livingWorkers(combat)
    lastAt = nextAt
    if (isCombatStunned(combat, nextAt) === false && (combat.shield ?? 0) <= 0 && typeof combat.stunnedUntil === 'number') {
      wakeCombatShield(enc, combat, nextAt)
    }
    const actors = [...living, combat.enemy]
      .filter((f) => f.hp > 0 && f.nextActAt === nextAt && (f.id !== 'enemy' || !isCombatStunned(combat, nextAt)))
      .sort(actorSort)

    for (const actor of actors) {
      if (combat.outcome) break
      if (actor.hp <= 0) continue
      if (actor.id === 'enemy') {
        const targets = resolveEnemyStrikeTargets(save, enc, combat, nextAt)
        for (const target of targets) {
          if (combat.outcome) break
          if (target.lane === 'workshop') {
            strikeWorkshop(save, enc, combat, nextAt, actor, target, onLog)
            continue
          }
          const fighter = combat.workers.find((w) => w.id === target.id)
          if (fighter) strike(save, enc, combat, nextAt, actor, fighter, onLog)
        }
      } else {
        strike(save, enc, combat, nextAt, actor, combat.enemy, onLog)
      }
      actor.nextActAt = nextAt + actIntervalMs(actor.spd)
    }
  }
  closeMarchHome(save, combat, now)
}

export function stepCombats(save: Save, now: number, onLog?: CombatLogSink): void {
  for (const enc of save.encounters) {
    if (enc.kind === 'enemy') stepEnemyCombat(save, enc, now, onLog)
  }
  for (const dungeonEnc of save.dungeon?.encounters ?? []) {
    if (dungeonEnc?.kind === 'enemy') stepEnemyCombat(save, dungeonEnc, now, onLog)
  }
}

export function applyRestHeal(save: Save): void {
  if (save.elapsedS <= 0 || save.elapsedS % REST_HEAL_EVERY_S !== 0) return
  const busy = fightingWorkerIds(save)
  for (const worker of save.workers) {
    if (worker.assignment !== null) continue
    if (busy.has(worker.id)) continue
    const max = workerLiveStats(worker, save).hp
    const heal = restHealAmount(worker.hpMax)
    const debt = workerFatigueDebt(worker)
    if (debt > 0) {
      const cut = Math.min(debt, heal)
      worker.fatigueDebt = debt - cut
      const leftover = heal - cut
      if (leftover > 0) worker.hp = Math.min(max, worker.hp + leftover)
    } else if (worker.hp < max) {
      worker.hp = Math.min(max, worker.hp + heal)
    }
    if (worker.hp >= max && workerFatigueDebt(worker) <= 0) {
      worker.hp = max
      worker.fatigueDebt = 0
    }
  }
}

export function writeBackCombatWorkers(save: Save, combat: EnemyCombat): void {
  writeBackWorkers(save, combat)
}

/** 升级时重算 hpMax，当前 hp 按升级前比例留到新上限。 */
export function applyWorkerLevelHpRatio(worker: Worker, oldHp: number, oldHpMax: number): void {
  const stats = workerLiveStats(worker)
  const ratio = oldHpMax > 0 ? Math.max(0, oldHp) / oldHpMax : 1
  worker.hpMax = stats.hp
  worker.hp = clampInt(Math.round(ratio * worker.hpMax), 0, worker.hpMax)
}

/**
 * 给参战工人加 XP。连升后按升级前血量比例重算上限。
 * 返回实际发放量与升了几级。
 */
export function grantWorkerCombatXp(
  worker: Worker,
  amount: number,
): { xpGranted: number; levelsGained: number } {
  const before = Math.max(1, Math.floor(worker.level || 1))
  const oldHp = worker.hp
  const oldHpMax = worker.hpMax
  const xpGranted = addWorkerXp(worker, amount)
  const levelsGained = Math.max(0, worker.level - before)
  if (levelsGained > 0) applyWorkerLevelHpRatio(worker, oldHp, oldHpMax)
  return { xpGranted, levelsGained }
}

export function legacyMarchAsWin(enc: EnemyEncounter, now = 0, chapter = 1): EnemyCombat {
  const stats = enemyCombatStats(enc.quality, enc.enemyRank, chapter)
  return {
    startedAt: now,
    timeoutAt: now,
    workerIds: [],
    workers: [],
    enemy: {
      id: 'enemy',
      label: enc.label,
      hp: 0,
      hpMax: stats.hp,
      atk: stats.atk,
      spd: stats.spd,
      nextActAt: now,
    },
    logs: [{ at: now, text: '旧档行军已结束，可领战利品' }],
    outcome: 'win',
  }
}
