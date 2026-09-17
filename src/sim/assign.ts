import { isWorkerInCombat } from './combat'
import { findWorker } from './recruit'
import { isDeprecatedStationId, isStationId, STATION_WORKER_CAP } from './tables'
import type { ActionResult, Save, StationId } from './types'

export function assignedWorkers(save: Save, stationId: StationId) {
  return save.workers.filter((w) => w.assignment === stationId)
}

/** 旧档同站超过上限的人撤到休息，按名册顺序保留先派的。 */
export function clampStationAssignments(save: Save): void {
  const counts: Partial<Record<StationId, number>> = {}
  for (const worker of save.workers) {
    const id = worker.assignment
    if (!id || !isStationId(id) || isDeprecatedStationId(id)) {
      worker.assignment = null
      continue
    }
    const n = counts[id] ?? 0
    if (n >= STATION_WORKER_CAP) {
      worker.assignment = null
      continue
    }
    counts[id] = n + 1
  }
}

/** 派工人到站点。每站最多 2 人。同一 worker 同时只有一份 assignment。伐木等废弃站不可派。 */
export function assignWorker(save: Save, workerId: string, stationId: StationId | null): ActionResult {
  const worker = findWorker(save, workerId)
  if (!worker) return { ok: false, reason: '没有这个 worker' }
  if (isWorkerInCombat(save, workerId)) return { ok: false, reason: '正在战斗' }
  if (stationId !== null && (isDeprecatedStationId(stationId) || !isStationId(stationId))) {
    return { ok: false, reason: '没有这个站点' }
  }
  if (stationId !== null && worker.assignment !== stationId) {
    const n = assignedWorkers(save, stationId).length
    if (n >= STATION_WORKER_CAP) return { ok: false, reason: '该站最多 2 人' }
  }
  const prev = worker.assignment
  worker.assignment = stationId
  if (prev && prev !== stationId && isStationId(prev) && assignedWorkers(save, prev).length <= 0) {
    save.stations[prev].progress = 0
    save.stations[prev].stallReason = null
  }
  return { ok: true }
}

export function assignIdleWorker(save: Save, stationId: StationId): ActionResult {
  const idle = save.workers.find((w) => w.assignment === null && !isWorkerInCombat(save, w.id))
  if (!idle) return { ok: false, reason: '没有空闲工人' }
  return assignWorker(save, idle.id, stationId)
}

export function withdrawWorker(save: Save, stationId: StationId): ActionResult {
  const assigned = [...save.workers].reverse().find((w) => w.assignment === stationId)
  if (!assigned) return { ok: false, reason: '该站没有工人' }
  return assignWorker(save, assigned.id, null)
}
