import { assignedWorkers, assignWorker } from '../sim/assign'
import { isWorkerInCombat } from '../sim/combat'
import { findWorker } from '../sim/recruit'
import { isStationId, STATION_WORKER_CAP } from '../sim/tables'
import type { ActionResult, Save, StationId } from '../sim/types'
import { workshopStationBoards } from './workerGroups'

export const WORKER_DRAG_THRESHOLD_PX = 12

export type WorkerDragSource =
  | { kind: 'rest'; workerId: string }
  | { kind: 'slot'; workerId: string; stationId: StationId; slotIndex: number }

export type WorkerDropTarget = { kind: 'rest' } | { kind: 'slot'; stationId: StationId; slotIndex: number }

export function workerDragDistance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay)
}

export function isWorkerDragThreshold(dist: number, threshold = WORKER_DRAG_THRESHOLD_PX): boolean {
  return dist >= threshold
}

/** 休息列优先左右拖才开拖，避免竖滑列表误触；工坊槽任意方向超过阈值即可。 */
export function shouldStartWorkerDrag(
  source: WorkerDragSource,
  dx: number,
  dy: number,
  threshold = WORKER_DRAG_THRESHOLD_PX,
): boolean {
  if (!isWorkerDragThreshold(Math.hypot(dx, dy), threshold)) return false
  if (source.kind === 'rest') return Math.abs(dx) >= Math.abs(dy)
  return true
}

export function canDragWorker(save: Save, workerId: string): boolean {
  const worker = findWorker(save, workerId)
  if (!worker) return false
  return !isWorkerInCombat(save, worker.id)
}

export function slotOccupantId(save: Save, stationId: StationId, slotIndex: number): string | null {
  const board = workshopStationBoards(save).find((row) => row.stationId === stationId)
  return board?.slots[slotIndex]?.id ?? null
}

export function sameDragEndpoint(source: WorkerDragSource, target: WorkerDropTarget): boolean {
  if (source.kind === 'rest' && target.kind === 'rest') return true
  return (
    source.kind === 'slot' &&
    target.kind === 'slot' &&
    source.stationId === target.stationId &&
    source.slotIndex === target.slotIndex
  )
}

export function canDropWorker(save: Save, source: WorkerDragSource, target: WorkerDropTarget): boolean {
  const worker = findWorker(save, source.workerId)
  if (!worker || isWorkerInCombat(save, worker.id)) return false
  if (sameDragEndpoint(source, target)) return false

  if (target.kind === 'rest') return source.kind === 'slot'

  const occupantId = slotOccupantId(save, target.stationId, target.slotIndex)
  const filled = assignedWorkers(save, target.stationId).length
  if (worker.assignment === target.stationId) return occupantId !== null && occupantId !== worker.id
  if (source.kind === 'rest') return occupantId === null && filled < STATION_WORKER_CAP
  return filled < STATION_WORKER_CAP
}

function swapWorkerOrder(save: Save, aId: string, bId: string): ActionResult {
  const i = save.workers.findIndex((w) => w.id === aId)
  const j = save.workers.findIndex((w) => w.id === bId)
  if (i < 0 || j < 0 || i === j) return { ok: false, reason: '不能换槽' }
  const left = save.workers[i]
  const right = save.workers[j]
  if (!left || !right) return { ok: false, reason: '不能换槽' }
  save.workers[i] = right
  save.workers[j] = left
  return { ok: true }
}

export function applyWorkerDrag(save: Save, source: WorkerDragSource, target: WorkerDropTarget): ActionResult {
  if (sameDragEndpoint(source, target)) return { ok: true }
  const worker = findWorker(save, source.workerId)
  if (!worker) return { ok: false, reason: '没有这个 worker' }
  if (isWorkerInCombat(save, worker.id)) return { ok: false, reason: '正在战斗' }
  if (!canDropWorker(save, source, target)) {
    if (
      target.kind === 'slot' &&
      worker.assignment !== target.stationId &&
      assignedWorkers(save, target.stationId).length >= STATION_WORKER_CAP
    ) {
      return { ok: false, reason: '该站最多 2 人' }
    }
    return { ok: false, reason: '不能派驻到这里' }
  }
  if (target.kind === 'rest') return assignWorker(save, source.workerId, null)
  if (source.kind === 'slot' && worker.assignment === target.stationId) {
    const otherId = slotOccupantId(save, target.stationId, target.slotIndex)
    if (!otherId) return { ok: true }
    return swapWorkerOrder(save, source.workerId, otherId)
  }
  return assignWorker(save, source.workerId, target.stationId)
}

export function dropTargetFromDataset(ds: DOMStringMap): WorkerDropTarget | null {
  if (ds.drop === 'rest') return { kind: 'rest' }
  if (ds.drop !== 'slot' || !ds.station || ds.slot == null) return null
  if (!isStationId(ds.station)) return null
  const slotIndex = Number(ds.slot)
  if (!Number.isInteger(slotIndex) || slotIndex < 0) return null
  return { kind: 'slot', stationId: ds.station, slotIndex }
}

export function dropTargetEquals(a: WorkerDropTarget | null, b: WorkerDropTarget | null): boolean {
  if (!a || !b) return a === b
  if (a.kind === 'rest' && b.kind === 'rest') return true
  return a.kind === 'slot' && b.kind === 'slot' && a.stationId === b.stationId && a.slotIndex === b.slotIndex
}
