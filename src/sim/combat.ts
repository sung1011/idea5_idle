import {
  COMBAT_ATTR_LABEL,
  enemyRankFor,
  ensureEnemyIntel,
  formatWeaknessLabels,
  resolveWorkerAttack,
} from './combatAttrs'
import { chapterCombatMul } from './mainChapter'
import type {
  ClassId,
  CombatAttrId,
  CombatFighter,
  CombatLogEntry,
  CombatOutcome,
  CombatStats,
  EncounterDistance,
  EncounterPower,
  EncounterQuality,
  EnemyCombat,
  EnemyEncounter,
  EnemyRank,
  QualityTier,
  Save,
  Worker,
} from './types'

export const COMBAT_PARTY_MAX = 2
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
export const REST_HEAL_HP = 1

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
 * 底版按两名约 5 档工人（atk 8 / spd 4，合计约 240 伤/分）来定。
 * 绿杂兵 HP ≈ 10 分钟。出手必须慢：敌人会集火，先倒下一人后 DPS 减半。
 */
export const ENEMY_COMBAT_BASE: Readonly<
  Record<EncounterDistance, Record<EncounterPower, CombatStats>>
> = {
  near: {
    weak: { hp: 2400, atk: 2, spd: 32 },
    strong: { hp: 2450, atk: 2, spd: 32 },
  },
  far: {
    weak: { hp: 2450, atk: 2, spd: 32 },
    strong: { hp: 2500, atk: 2, spd: 32 },
  },
}

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
  lose: '败可再战',
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

export function workerCombatStats(qualityTier: QualityTier, classId?: ClassId | null): CombatStats {
  const base = WORKER_COMBAT_BY_TIER[qualityTier]
  const mod = classId ? CLASS_COMBAT_MOD[classId] : { hp: 0, atk: 0, spd: 0 }
  return {
    hp: Math.max(1, base.hp + mod.hp),
    atk: Math.max(1, base.atk + mod.atk),
    spd: Math.max(1, base.spd + mod.spd),
  }
}

export function workerLiveStats(worker: Worker): CombatStats {
  return workerCombatStats(worker.qualityTier, worker.classId)
}

export function enemyCombatStats(
  distance: EncounterDistance,
  power: EncounterPower,
  quality: EncounterQuality,
  rank?: EnemyRank,
  chapter = 1,
): CombatStats {
  const resolvedRank = rank ?? enemyRankFor(power, quality)
  const base = ENEMY_COMBAT_BASE[distance][power]
  const qMul = ENEMY_COMBAT_QUALITY_MUL[quality]
  const rMul = ENEMY_COMBAT_RANK_MUL[resolvedRank]
  const cMul = chapterCombatMul(chapter)
  return {
    hp: scaleStat(base.hp, qMul * rMul.hp * cMul),
    atk: scaleStat(base.atk, qMul * rMul.atk * cMul),
    spd: Math.max(1, Math.round(base.spd * rMul.spd)),
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

export function fightingWorkerIds(save: Save): Set<string> {
  const ids = new Set<string>()
  for (const enc of save.encounters) {
    if (enc.kind !== 'enemy' || !isFighting(enc) || !enc.combat) continue
    for (const id of enc.combat.workerIds) ids.add(id)
  }
  return ids
}

export function isWorkerInCombat(save: Save, workerId: string): boolean {
  return fightingWorkerIds(save).has(workerId)
}

export function restCombatCandidates(save: Save): Worker[] {
  const busy = fightingWorkerIds(save)
  return save.workers.filter((w) => w.assignment === null && !busy.has(w.id))
}

export function selectableCombatWorkers(save: Save): Worker[] {
  return restCombatCandidates(save).filter((w) => w.hp > 0)
}

export function combatPartyBlockReason(save: Save, workerIds: readonly string[]): string | null {
  if (!workerIds.length) return '请选择出战工人'
  if (workerIds.length > COMBAT_PARTY_MAX) return `最多选 ${COMBAT_PARTY_MAX} 人`
  const seen = new Set<string>()
  const busy = fightingWorkerIds(save)
  for (const id of workerIds) {
    if (seen.has(id)) return '不能重复选同一个人'
    seen.add(id)
    const worker = save.workers.find((w) => w.id === id)
    if (!worker) return '没有这个工人'
    if (worker.assignment !== null) return `${worker.name ?? worker.id} 不在休息`
    if (busy.has(id)) return `${worker.name ?? worker.id} 正在战斗`
    if (worker.hp <= 0) return `${worker.name ?? worker.id} 无法出战`
  }
  return null
}

function pushLog(combat: EnemyCombat, at: number, text: string): void {
  combat.logs.push({ at, text })
  if (combat.logs.length > COMBAT_LOG_CAP) {
    combat.logs.splice(0, combat.logs.length - COMBAT_LOG_CAP)
  }
}

export function recentCombatLogs(enc: EnemyEncounter, n = 4): CombatLogEntry[] {
  const logs = enc.combat?.logs ?? []
  return logs.slice(-n)
}

function makeFighter(
  id: string,
  label: string,
  stats: CombatStats,
  hp: number,
  now: number,
  combatAttrs?: CombatAttrId[],
): CombatFighter {
  const hpMax = Math.max(1, stats.hp)
  return {
    id,
    label,
    hp: clampInt(hp, 0, hpMax),
    hpMax,
    atk: Math.max(1, stats.atk),
    spd: Math.max(1, stats.spd),
    nextActAt: now + Math.max(1, stats.spd) * 1000,
    ...(combatAttrs && combatAttrs.length ? { combatAttrs: [...combatAttrs] } : {}),
  }
}

export function beginEnemyCombat(
  enc: EnemyEncounter,
  workers: Worker[],
  now: number,
  chapter = 1,
): EnemyCombat {
  ensureEnemyIntel(enc)
  const eStats = enemyCombatStats(enc.distance, enc.power, enc.quality, enc.enemyRank, chapter)
  const combat: EnemyCombat = {
    startedAt: now,
    timeoutAt: now + combatTimeoutS(enc.enemyRank) * 1000,
    workerIds: workers.map((w) => w.id),
    workers: workers.map((w) => {
      const stats = workerLiveStats(w)
      return makeFighter(w.id, w.name ?? w.id, { ...stats, hp: w.hpMax }, w.hp, now, w.combatAttrs)
    }),
    enemy: makeFighter('enemy', enc.label, eStats, eStats.hp, now),
    logs: [],
    outcome: null,
  }
  pushLog(combat, now, `${workers.map((w) => w.name ?? w.id).join('、')} 出战`)
  enc.combat = combat
  enc.departed = true
  enc.lootClaimed = false
  return combat
}

function livingWorkers(combat: EnemyCombat): CombatFighter[] {
  return combat.workers.filter((w) => w.hp > 0)
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

function writeBackWorkers(save: Save, combat: EnemyCombat): void {
  for (const fighter of combat.workers) {
    const worker = save.workers.find((w) => w.id === fighter.id)
    if (!worker) continue
    worker.hp = clampInt(fighter.hp, 0, worker.hpMax)
    if (worker.assignment !== null) worker.assignment = null
  }
}

function finishCombat(save: Save, combat: EnemyCombat, at: number, outcome: CombatOutcome, text: string): void {
  combat.outcome = outcome
  pushLog(combat, at, text)
  writeBackWorkers(save, combat)
}

function strike(
  enc: EnemyEncounter,
  combat: EnemyCombat,
  at: number,
  attacker: CombatFighter,
  target: CombatFighter,
): void {
  if (attacker.hp <= 0 || target.hp <= 0) return
  if (attacker.id !== 'enemy') {
    const result = resolveWorkerAttack(enc, attacker.combatAttrs ?? [], attacker.atk)
    target.hp = Math.max(0, target.hp - result.damage)
    if (result.newlyRevealed.length) {
      pushLog(combat, at, `揭示弱点：${formatWeaknessLabels(result.newlyRevealed)}`)
    }
    const mulText = result.mul > 1 ? ` ×${result.mul}` : ''
    const hitText = result.hits.length
      ? `弱点${result.hits.map((id) => COMBAT_ATTR_LABEL[id]).join('')}${mulText}`
      : ''
    const tail = hitText ? `（${hitText}）（${target.hp}/${target.hpMax}）` : `（${target.hp}/${target.hpMax}）`
    pushLog(combat, at, `${attacker.label} 对 ${target.label} 造成 ${result.damage}${tail}`)
    return
  }
  target.hp = Math.max(0, target.hp - attacker.atk)
  pushLog(combat, at, `${attacker.label} 对 ${target.label} 造成 ${attacker.atk}（${target.hp}/${target.hpMax}）`)
}

function actorSort(a: CombatFighter, b: CombatFighter): number {
  const aEnemy = a.id === 'enemy' ? 1 : 0
  const bEnemy = b.id === 'enemy' ? 1 : 0
  if (aEnemy !== bEnemy) return aEnemy - bEnemy
  return a.id.localeCompare(b.id)
}

function nextActionAt(combat: EnemyCombat): number | null {
  const actors = [...livingWorkers(combat), combat.enemy].filter((f) => f.hp > 0)
  if (!actors.length) return null
  return Math.min(...actors.map((f) => f.nextActAt))
}

export function stepEnemyCombat(save: Save, enc: EnemyEncounter, now: number): void {
  const combat = enc.combat
  if (!combat || combat.outcome || enc.lootClaimed) return

  let lastAt = combat.startedAt
  while (combat.outcome === null) {
    if (combat.enemy.hp <= 0) {
      finishCombat(save, combat, lastAt, 'win', '战斗胜利')
      return
    }
    const living = livingWorkers(combat)
    if (!living.length) {
      finishCombat(save, combat, lastAt, 'lose', '全员倒下，战败')
      return
    }

    const nextAt = nextActionAt(combat)
    if (nextAt == null) {
      finishCombat(save, combat, lastAt, 'lose', '全员倒下，战败')
      return
    }
    if (nextAt > combat.timeoutAt || (now >= combat.timeoutAt && nextAt > now)) {
      finishCombat(save, combat, Math.min(now, combat.timeoutAt), 'lose', '超时判败')
      return
    }
    if (nextAt > now) return

    lastAt = nextAt
    const actors = [...living, combat.enemy]
      .filter((f) => f.hp > 0 && f.nextActAt === nextAt)
      .sort(actorSort)

    for (const actor of actors) {
      if (combat.outcome) break
      if (actor.hp <= 0) continue
      if (actor.id === 'enemy') {
        const target = pickEnemyTarget(combat)
        if (!target) {
          finishCombat(save, combat, nextAt, 'lose', '全员倒下，战败')
          break
        }
        strike(enc, combat, nextAt, actor, target)
      } else {
        strike(enc, combat, nextAt, actor, combat.enemy)
      }
      actor.nextActAt = nextAt + actor.spd * 1000
    }
  }
}

export function stepCombats(save: Save, now: number): void {
  for (const enc of save.encounters) {
    if (enc.kind === 'enemy') stepEnemyCombat(save, enc, now)
  }
}

export function applyRestHeal(save: Save): void {
  if (save.elapsedS <= 0 || save.elapsedS % REST_HEAL_EVERY_S !== 0) return
  const busy = fightingWorkerIds(save)
  for (const worker of save.workers) {
    if (worker.assignment !== null) continue
    if (busy.has(worker.id)) continue
    if (worker.hp < worker.hpMax) worker.hp = Math.min(worker.hpMax, worker.hp + REST_HEAL_HP)
  }
}

export function writeBackCombatWorkers(save: Save, combat: EnemyCombat): void {
  writeBackWorkers(save, combat)
}

export function legacyMarchAsWin(enc: EnemyEncounter, now = 0, chapter = 1): EnemyCombat {
  const stats = enemyCombatStats(enc.distance, enc.power, enc.quality, enc.enemyRank, chapter)
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
