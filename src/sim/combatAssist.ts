import { fillWorkerHp } from './combat'
import { fillWorkerCombatAttrs } from './combatAttrs'
import { classPoolForQuality, isQualityTier, pickClassFromPool, QUALITY_MIN, WORKER_NAME_POOL } from './tables'
import { assistQualityFloor } from './tech'
import type { QualityTier, Save, Worker } from './types'
import { WORKER_LEVEL_MIN } from './workerLevel'

/** 本场临时助战固定 id。同时只允许 1 个。 */
export const ASSIST_WORKER_ID = 'assist-guest'

export type AssistRoll = () => number

export function isAssistWorkerId(id: string): boolean {
  return id === ASSIST_WORKER_ID || id.startsWith('assist-')
}

export function isAssistWorker(worker: Pick<Worker, 'id' | 'guest'>): boolean {
  return worker.guest === true || isAssistWorkerId(worker.id)
}

export function rosterWorkers(save: Save): Worker[] {
  return save.workers.filter((w) => !isAssistWorker(w))
}

function rollInclusive(min: number, max: number, roll: AssistRoll): number {
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  if (hi <= lo) return lo
  const span = hi - lo + 1
  return lo + Math.min(span - 1, Math.max(0, Math.floor(roll() * span)))
}

export function playerAssistCaps(save: Save): { maxQuality: QualityTier; maxLevel: number } {
  let maxQuality: QualityTier = QUALITY_MIN
  let maxLevel = WORKER_LEVEL_MIN
  for (const worker of rosterWorkers(save)) {
    if (worker.qualityTier > maxQuality) maxQuality = worker.qualityTier
    const level = Math.max(WORKER_LEVEL_MIN, Math.floor(worker.level || WORKER_LEVEL_MIN))
    if (level > maxLevel) maxLevel = level
  }
  return { maxQuality, maxLevel }
}

function pickAssistName(roll: AssistRoll): string {
  const name = WORKER_NAME_POOL[rollInclusive(0, WORKER_NAME_POOL.length - 1, roll)] ?? WORKER_NAME_POOL[0]
  return `助战·${name}`
}

/** 点「邀请」才生成。不写入 save.workers，不推进 nextWorkerId。 */
export function createAssistWorker(save: Save, roll: AssistRoll = Math.random): Worker {
  const { maxQuality, maxLevel } = playerAssistCaps(save)
  const minQuality = assistQualityFloor(save, maxQuality)
  const qualityRaw = rollInclusive(minQuality, maxQuality, roll)
  const qualityTier: QualityTier = isQualityTier(qualityRaw) ? qualityRaw : QUALITY_MIN
  const level = rollInclusive(WORKER_LEVEL_MIN, maxLevel, roll)
  const classId = pickClassFromPool(classPoolForQuality(qualityTier), roll())
  return fillWorkerCombatAttrs(
    fillWorkerHp({
      id: ASSIST_WORKER_ID,
      name: pickAssistName(roll),
      classId,
      qualityTier,
      assignment: null,
      foodSlot: null,
      fatigueDebt: 0,
      isNew: false,
      hp: 0,
      hpMax: 1,
      level,
      xp: 0,
      combatAttrs: [],
      guest: true,
    }),
    roll,
  )
}

export function findCombatPartyWorker(
  save: Save,
  workerId: string,
  guests: readonly Worker[] = [],
): Worker | undefined {
  const roster = rosterWorkers(save).find((w) => w.id === workerId)
  if (roster) return roster
  return guests.find((w) => w.id === workerId && isAssistWorker(w))
}

/** 休息工人在后，已邀请的助战固定置顶。未邀请则不加。 */
export function pickCombatCandidates(resting: readonly Worker[], assist?: Worker | null): Worker[] {
  const rest = resting.filter((w) => !isAssistWorker(w))
  if (assist && isAssistWorker(assist)) return [assist, ...rest]
  return [...rest]
}
