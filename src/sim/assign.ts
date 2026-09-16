import { findWorker } from './recruit'
import { isDeprecatedStationId, isStationId } from './tables'
import type { ActionResult, Save, StationId } from './types'

/** 派工人到站点。允许多工人同站。同一 worker 同时只有一份 assignment。伐木等废弃站不可派。 */
export function assignWorker(save: Save, workerId: string, stationId: StationId | null): ActionResult {
  const worker = findWorker(save, workerId)
  if (!worker) return { ok: false, reason: '没有这个 worker' }
  if (stationId !== null && (isDeprecatedStationId(stationId) || !isStationId(stationId))) {
    return { ok: false, reason: '没有这个站点' }
  }
  worker.assignment = stationId
  return { ok: true }
}

export function assignIdleWorker(save: Save, stationId: StationId): ActionResult {
  const idle = save.workers.find((w) => w.assignment === null)
  if (!idle) return { ok: false, reason: '没有空闲工人' }
  return assignWorker(save, idle.id, stationId)
}

export function withdrawWorker(save: Save, stationId: StationId): ActionResult {
  const assigned = [...save.workers].reverse().find((w) => w.assignment === stationId)
  if (!assigned) return { ok: false, reason: '该站没有工人' }
  return assignWorker(save, assigned.id, null)
}
