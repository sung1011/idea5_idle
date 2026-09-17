import type { EnemyRank, Worker } from './types'

/** 工人战斗等级从 1 起。抽人 / spawn / 旧档缺字段都是 Lv1。 */
export const WORKER_LEVEL_MIN = 1

/**
 * 升到下一级所需 XP。
 * `round(20 * 1.25^(L-1))`：Lv1→2 要 20，之后递增。
 */
export const WORKER_XP_TO_NEXT_BASE = 20
export const WORKER_XP_TO_NEXT_GROWTH = 1.25

export function workerXpToNext(level: number): number {
  const safe = Math.max(WORKER_LEVEL_MIN, Math.floor(level))
  return Math.max(1, Math.round(WORKER_XP_TO_NEXT_BASE * Math.pow(WORKER_XP_TO_NEXT_GROWTH, safe - 1)))
}

/** 战胜领战利品才发的 XP。阶级底值，章节每高 1 章 +1。 */
export const WORKER_LOOT_XP_BY_RANK: Readonly<Record<EnemyRank, number>> = {
  minion: 8,
  elite: 14,
  boss: 24,
}
export const WORKER_LOOT_XP_PER_CHAPTER = 1

export function workerLootXp(rank: EnemyRank, chapter = 1): number {
  const extra = Math.max(0, Math.floor(chapter) - 1) * WORKER_LOOT_XP_PER_CHAPTER
  return WORKER_LOOT_XP_BY_RANK[rank] + extra
}

/**
 * 相对 Lv1（品质底版 + 职业修正）的等级加成，只动战斗。
 * 每级 HP +4%、ATK +3%、出手间隔 ×0.99；间隔最快不低于底版的 70%。
 */
export const WORKER_LEVEL_HP_PER = 0.04
export const WORKER_LEVEL_ATK_PER = 0.03
export const WORKER_LEVEL_SPD_MUL = 0.99
export const WORKER_LEVEL_SPD_FLOOR = 0.7

export function workerLevelHpMul(level: number): number {
  return 1 + WORKER_LEVEL_HP_PER * levelSteps(level)
}

export function workerLevelAtkMul(level: number): number {
  return 1 + WORKER_LEVEL_ATK_PER * levelSteps(level)
}

export function workerLevelSpdMul(level: number): number {
  return Math.pow(WORKER_LEVEL_SPD_MUL, levelSteps(level))
}

/** 从 Lv1 累计到当前级内进度的总 XP。合成均分用。 */
export function workerTotalXp(level: number, xp: number): number {
  const lv = Math.max(WORKER_LEVEL_MIN, Math.floor(level))
  const cur = Math.max(0, Math.floor(xp))
  let total = cur
  for (let current = 1; current < lv; current++) total += workerXpToNext(current)
  return total
}

/** 总 XP 拆回 level + 当前级内 xp。可连升。 */
export function workerFromTotalXp(total: number): { level: number; xp: number } {
  let remaining = Math.max(0, Math.floor(total))
  let level = WORKER_LEVEL_MIN
  while (remaining >= workerXpToNext(level)) {
    remaining -= workerXpToNext(level)
    level += 1
  }
  return { level, xp: remaining }
}

export function hydrateWorkerLevel(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < WORKER_LEVEL_MIN) return WORKER_LEVEL_MIN
  return Math.floor(raw)
}

export function hydrateWorkerXp(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return 0
  return Math.floor(raw)
}

/** 脏档若当前级 XP 已够升，连升后再写回。 */
export function normalizeWorkerProgress(level: unknown, xp: unknown): { level: number; xp: number } {
  return workerFromTotalXp(workerTotalXp(hydrateWorkerLevel(level), hydrateWorkerXp(xp)))
}

/** 只改 level / xp。升级后的 hpMax 由调用方按比例重算。返回实际发放量。 */
export function addWorkerXp(worker: Worker, amount: number): number {
  const grant = Math.max(0, Math.floor(amount))
  if (grant <= 0) return 0
  const next = workerFromTotalXp(workerTotalXp(worker.level, worker.xp) + grant)
  worker.level = next.level
  worker.xp = next.xp
  return grant
}

export function workerXpProgress(worker: Worker): { xp: number; need: number; pct: number } {
  const need = workerXpToNext(worker.level)
  const xp = Math.max(0, Math.floor(worker.xp))
  return { xp, need, pct: Math.min(100, Math.round((xp / Math.max(1, need)) * 100)) }
}

function levelSteps(level: number): number {
  return Math.max(0, Math.floor(level) - 1)
}
