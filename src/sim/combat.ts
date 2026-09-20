import {
  enemyRankFor,
  ensureEnemyIntel,
  formatWeaknessCritTip,
  formatWeaknessLabels,
  resolveWorkerAttack,
} from './combatAttrs'
import { attackIntervalMul, workerAtkMul, workerHpMul } from './tech'
import { drawEnemyTargetRule, pickEnemyTargets, type CombatTarget } from './combatTarget'
import { tryAutoEatAfterCombat } from './food'
import { roll01 } from './rng'
import { restHealAmount } from './workshopHp'
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
  CombatStats,
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

export function workerCombatStats(
  qualityTier: QualityTier,
  classId?: ClassId | null,
  level = 1,
  save?: Save,
): CombatStats {
  const base = WORKER_COMBAT_BY_TIER[qualityTier]
  const mod = classId ? CLASS_COMBAT_MOD[classId] : { hp: 0, atk: 0, spd: 0 }
  const raw: CombatStats = {
    hp: Math.max(1, base.hp + mod.hp),
    atk: Math.max(1, base.atk + mod.atk),
    spd: Math.max(1, base.spd + mod.spd),
  }
  return applyCombatTechStats(applyWorkerLevelStats(raw, level), save)
}

function applyCombatTechStats(stats: CombatStats, save?: Save): CombatStats {
  if (!save) return stats
  return {
    hp: Math.max(1, Math.round(stats.hp * workerHpMul(save))),
    atk: Math.max(1, Math.round(stats.atk * workerAtkMul(save))),
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

export function workerLiveStats(worker: Worker, save?: Save): CombatStats {
  return workerCombatStats(worker.qualityTier, worker.classId, worker.level ?? 1, save)
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
  return {
    hp: scaleStat(ENEMY_COMBAT_BASE.hp, qMul * rMul.hp * cMul),
    atk: scaleStat(ENEMY_COMBAT_BASE.atk, qMul * rMul.atk * cMul),
    spd: Math.max(1, Math.round(ENEMY_COMBAT_BASE.spd * rMul.spd)),
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
  return save.workers.filter(
    (w) => w.guest !== true && !w.id.startsWith('assist-') && w.assignment === null && !busy.has(w.id),
  )
}

export function selectableCombatWorkers(save: Save): Worker[] {
  return restCombatCandidates(save).filter((w) => w.hp > 0)
}

export type CombatTipKind = 'ok' | 'err'
export type CombatLogSink = (encounterId: string, text: string, kind: CombatTipKind) => void

export function combatPartyBlockReason(
  save: Save,
  workerIds: readonly string[],
  guests: readonly Worker[] = [],
): string | null {
  if (!workerIds.length) return '请选择出战工人'
  if (workerIds.length > COMBAT_PARTY_MAX) return `最多选 ${COMBAT_PARTY_MAX} 人`
  const seen = new Set<string>()
  const busy = fightingWorkerIds(save)
  for (const id of workerIds) {
    if (seen.has(id)) return '不能重复选同一个人'
    seen.add(id)
    const roster = save.workers.find((w) => w.id === id && w.guest !== true && !w.id.startsWith('assist-'))
    const worker = roster ?? guests.find((w) => w.id === id && (w.guest === true || w.id.startsWith('assist-')))
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

function rematchEnemyHp(enc: EnemyEncounter, fullHp: number): number {
  const prev = enc.combat
  if (prev?.outcome === 'lose' && prev.enemy.hp > 0) return prev.enemy.hp
  return fullHp
}

export function beginEnemyCombat(
  enc: EnemyEncounter,
  workers: Worker[],
  now: number,
  chapter = 1,
  onLog?: CombatLogSink,
  save?: Save,
): EnemyCombat {
  ensureEnemyIntel(enc, 0, 0, save)
  const eStats = enemyCombatStats(enc.quality, enc.enemyRank, chapter)
  const enemyHp = rematchEnemyHp(enc, eStats.hp)
  const combat: EnemyCombat = {
    startedAt: now,
    timeoutAt: now + combatTimeoutS(enc.enemyRank) * 1000,
    workerIds: workers.map((w) => w.id),
    workers: workers.map((w) => {
      const stats = workerLiveStats(w, save)
      const hpMax = Math.max(1, stats.hp)
      const hp = w.hpMax > 0 ? Math.round((w.hp / w.hpMax) * hpMax) : hpMax
      return makeFighter(w.id, w.name ?? w.id, { ...stats, hp: hpMax }, hp, now, w.combatAttrs)
    }),
    enemy: makeFighter('enemy', enc.label, eStats, enemyHp, now),
    logs: [],
    outcome: null,
  }
  emitLog(enc, combat, now, `${workers.map((w) => w.name ?? w.id).join('、')} 出战`, 'ok', onLog)
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

function writeBackFighterHp(save: Save, fighter: CombatFighter): void {
  const worker = save.workers.find((w) => w.id === fighter.id)
  if (!worker) return
  worker.hp = clampInt(fighter.hp, 0, worker.hpMax)
}

function writeBackWorkers(save: Save, combat: EnemyCombat): void {
  for (const fighter of combat.workers) {
    const worker = save.workers.find((w) => w.id === fighter.id)
    if (!worker) continue
    writeBackFighterHp(save, fighter)
    if (worker.assignment !== null) worker.assignment = null
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
  combat.outcome = outcome
  emitLog(enc, combat, at, text, outcome === 'win' ? 'ok' : 'err', onLog)
  writeBackWorkers(save, combat)
  tryAutoEatAfterCombat(save, combat.workerIds, at)
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
    target.hp = Math.max(0, target.hp - result.damage)
    if (result.newlyRevealed.length) {
      emitLog(enc, combat, at, `揭示弱点：${formatWeaknessLabels(result.newlyRevealed)}`, 'ok', onLog)
    }
    const mulText = result.mul > 1 ? ` ×${result.mul}` : ''
    const hitText = result.hits.length ? `${formatWeaknessCritTip(result.hits)}${mulText}` : ''
    const tail = hitText ? `（${hitText}）（${target.hp}/${target.hpMax}）` : `（${target.hp}/${target.hpMax}）`
    emitLog(enc, combat, at, `${attacker.label} 对 ${target.label} 造成 ${result.damage}${tail}`, 'ok', onLog)
    return
  }
  target.hp = Math.max(0, target.hp - attacker.atk)
  writeBackFighterHp(save, target)
  emitLog(
    enc,
    combat,
    at,
    `${attacker.label} 对 ${target.label} 造成 ${attacker.atk}（${target.hp}/${target.hpMax}）`,
    'err',
    onLog,
  )
}

/** 工坊在岗：扣同一 hp，锁 1；刚打到残血则复用战后自动吃食。 */
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
  const before = worker.hp
  worker.hp = Math.max(1, worker.hp - attacker.atk)
  emitLog(
    enc,
    combat,
    at,
    `${attacker.label} 对 ${target.label} 造成 ${attacker.atk}（工坊）（${worker.hp}/${worker.hpMax}）`,
    'err',
    onLog,
  )
  if (before > 1 && worker.hp === 1) tryAutoEatAfterCombat(save, [worker.id], at)
}

function resolveEnemyStrikeTargets(
  save: Save,
  enc: EnemyEncounter,
  combat: EnemyCombat,
): CombatTarget[] {
  const rule = drawEnemyTargetRule(save, enc)
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

function nextActionAt(combat: EnemyCombat): number | null {
  const actors = [...livingWorkers(combat), combat.enemy].filter((f) => f.hp > 0)
  if (!actors.length) return null
  return Math.min(...actors.map((f) => f.nextActAt))
}

export function stepEnemyCombat(save: Save, enc: EnemyEncounter, now: number, onLog?: CombatLogSink): void {
  const combat = enc.combat
  if (!combat || combat.outcome || enc.lootClaimed) return

  let lastAt = combat.startedAt
  while (combat.outcome === null) {
    if (combat.enemy.hp <= 0) {
      finishCombat(save, enc, combat, lastAt, 'win', '战斗胜利', onLog)
      return
    }
    const living = livingWorkers(combat)
    if (!living.length) {
      finishCombat(save, enc, combat, lastAt, 'lose', '全员倒下，战败', onLog)
      return
    }

    const nextAt = nextActionAt(combat)
    if (nextAt == null) {
      finishCombat(save, enc, combat, lastAt, 'lose', '全员倒下，战败', onLog)
      return
    }
    if (nextAt > combat.timeoutAt || (now >= combat.timeoutAt && nextAt > now)) {
      finishCombat(save, enc, combat, Math.min(now, combat.timeoutAt), 'lose', '超时判败', onLog)
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
        const targets = resolveEnemyStrikeTargets(save, enc, combat)
        if (!targets.length) {
          finishCombat(save, enc, combat, nextAt, 'lose', '全员倒下，战败', onLog)
          break
        }
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
      actor.nextActAt = nextAt + actor.spd * 1000
    }
  }
}

export function stepCombats(save: Save, now: number, onLog?: CombatLogSink): void {
  for (const enc of save.encounters) {
    if (enc.kind === 'enemy') stepEnemyCombat(save, enc, now, onLog)
  }
}

export function applyRestHeal(save: Save): void {
  if (save.elapsedS <= 0 || save.elapsedS % REST_HEAL_EVERY_S !== 0) return
  const busy = fightingWorkerIds(save)
  for (const worker of save.workers) {
    if (worker.assignment !== null) continue
    if (busy.has(worker.id)) continue
    const max = workerLiveStats(worker, save).hp
    if (worker.hp < max) worker.hp = Math.min(max, worker.hp + restHealAmount(worker.hpMax))
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
