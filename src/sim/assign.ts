import { isWorkerInCombat } from './combat'
import { isWorkerInTreasureMine, treasureMineBlockReason } from './treasureMineQuery'
import { findWorker } from './recruit'
import { isStationUnlocked, stationLockedTip } from './stationUnlock'
import { isDeprecatedStationId, isStationId, STATION_ORDER, STATION_WORKER_CAP } from './tables'
import type { ActionResult, Save, StationId, Worker } from './types'
import { offerRestFood } from './food'
import { isFullWorkshopHp } from './workshopHp'

export function assignedWorkers(save: Save, stationId: StationId) {
  return save.workers.filter((w) => w.assignment === stationId)
}

/** 旧档同站超过上限的人撤到休息，按名册顺序保留先派的。 */
export function clampStationAssignments(save: Save): void {
  const counts: Partial<Record<StationId, number>> = {}
  for (const worker of save.workers) {
    const id = worker.assignment
    if (!id || !isStationId(id) || isDeprecatedStationId(id)) {
      if (id) {
        worker.assignment = null
        offerRestFood(save, worker.id)
      } else {
        worker.assignment = null
      }
      continue
    }
    const n = counts[id] ?? 0
    if (n >= STATION_WORKER_CAP) {
      worker.assignment = null
      offerRestFood(save, worker.id)
      continue
    }
    counts[id] = n + 1
  }
}

/** 派工人到站点。每站最多 1 人。同一 worker 同时只有一份 assignment。伐木等废弃站不可派。 */
export function assignWorker(save: Save, workerId: string, stationId: StationId | null): ActionResult {
  const worker = findWorker(save, workerId)
  if (!worker) return { ok: false, reason: '没有这个 worker' }
  worker.isNew = false
  if (isWorkerInCombat(save, workerId)) return { ok: false, reason: '正在战斗' }
  const mineBusy = treasureMineBlockReason(save, workerId)
  if (mineBusy) return { ok: false, reason: mineBusy }
  if (stationId !== null && (isDeprecatedStationId(stationId) || !isStationId(stationId))) {
    return { ok: false, reason: '没有这个站点' }
  }
  if (stationId !== null && worker.assignment !== stationId) {
    if (!isFullWorkshopHp(worker)) return { ok: false, reason: '满血才能上岗' }
    const n = assignedWorkers(save, stationId).length
    if (n >= STATION_WORKER_CAP) return { ok: false, reason: '该站最多 1 人' }
  }
  const prev = worker.assignment
  worker.assignment = stationId
  if (prev && prev !== stationId && isStationId(prev) && assignedWorkers(save, prev).length <= 0) {
    save.stations[prev].progress = 0
    save.stations[prev].stallReason = null
  }
  if (stationId === null && prev) offerRestFood(save, worker.id)
  return { ok: true }
}

/** 未派驻且未在战斗 / 夺宝。名册原序，队首挡住后面的人。 */
export function restingWorkers(save: Save): Worker[] {
  return save.workers.filter(
    (worker) => worker.assignment === null && !isWorkerInCombat(save, worker.id) && !isWorkerInTreasureMine(save, worker.id),
  )
}

/** 已解锁、未封闭、空岗。按 STATION_ORDER，满员与封闭都跳过。 */
export function firstEmptyDispatchStation(save: Save): StationId | null {
  for (const stationId of STATION_ORDER) {
    if (!isStationUnlocked(save, stationId)) continue
    if (save.stations[stationId].closed) continue
    if (assignedWorkers(save, stationId).length < STATION_WORKER_CAP) return stationId
  }
  return null
}

/** 休息区队首派到第一空槽。未满血或不可派时本轮不看后面的人。 */
export function assignRestingToFirstEmpty(save: Save): ActionResult {
  const idle = restingWorkers(save)[0]
  if (!idle) return { ok: false, reason: '没有可派的工人' }
  if (!isFullWorkshopHp(idle)) return { ok: false, reason: '满血才能上岗' }
  if (isWorkerInCombat(save, idle.id)) return { ok: false, reason: '正在战斗' }
  const mineBusy = treasureMineBlockReason(save, idle.id)
  if (mineBusy) return { ok: false, reason: mineBusy }
  const stationId = firstEmptyDispatchStation(save)
  if (!stationId) {
    const lockedEmpty = STATION_ORDER.find(
      (id) => !isStationUnlocked(save, id) && assignedWorkers(save, id).length < STATION_WORKER_CAP,
    )
    if (lockedEmpty) return { ok: false, reason: stationLockedTip(lockedEmpty) }
    return { ok: false, reason: '工位已满' }
  }
  return assignWorker(save, idle.id, stationId)
}

/** 封闭只挡自动填岗。再按一次开放。不要求满血。 */
export function toggleStationClosed(save: Save, stationId: StationId): ActionResult {
  if (isDeprecatedStationId(stationId) || !isStationId(stationId)) return { ok: false, reason: '没有这个站点' }
  save.stations[stationId].closed = !save.stations[stationId].closed
  return { ok: true }
}

export function assignIdleWorker(save: Save, stationId: StationId): ActionResult {
  if (!isStationUnlocked(save, stationId)) return { ok: false, reason: stationLockedTip(stationId) }
  const idle = restingWorkers(save)[0]
  if (!idle) return { ok: false, reason: '没有空闲工人' }
  return assignWorker(save, idle.id, stationId)
}

export function withdrawWorker(save: Save, stationId: StationId): ActionResult {
  const assigned = [...save.workers].reverse().find((w) => w.assignment === stationId)
  if (!assigned) return { ok: false, reason: '该站没有工人' }
  return assignWorker(save, assigned.id, null)
}
