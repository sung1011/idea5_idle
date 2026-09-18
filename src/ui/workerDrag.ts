import { assignedWorkers, assignWorker } from '../sim/assign'
import { isWorkerInCombat } from '../sim/combat'
import { canFuseWorkerWithStation, fuseWorkerWithStation } from '../sim/fuse'
import { findWorker } from '../sim/recruit'
import { isStationId, QUALITY_MAX, STATION_WORKER_CAP } from '../sim/tables'
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

export function canFuseDragOnSlot(save: Save, source: WorkerDragSource, target: WorkerDropTarget): boolean {
  if (target.kind !== 'slot') return false
  const occupantId = slotOccupantId(save, target.stationId, target.slotIndex)
  if (!occupantId || occupantId === source.workerId) return false
  return canFuseWorkerWithStation(save, source.workerId, target.stationId)
}

export function canDropWorker(save: Save, source: WorkerDragSource, target: WorkerDropTarget): boolean {
  const worker = findWorker(save, source.workerId)
  if (!worker || isWorkerInCombat(save, worker.id)) return false
  if (sameDragEndpoint(source, target)) return false

  if (target.kind === 'rest') return source.kind === 'slot'

  const occupantId = slotOccupantId(save, target.stationId, target.slotIndex)
  if (occupantId) return canFuseDragOnSlot(save, source, target)
  if (worker.assignment === target.stationId) return false
  return assignedWorkers(save, target.stationId).length < STATION_WORKER_CAP
}

function rejectOccupiedDrop(save: Save, source: WorkerDragSource, target: Extract<WorkerDropTarget, { kind: 'slot' }>): ActionResult {
  const worker = findWorker(save, source.workerId)
  const occupant = findWorker(save, slotOccupantId(save, target.stationId, target.slotIndex) ?? '')
  if (worker && occupant) {
    if (worker.qualityTier >= QUALITY_MAX || occupant.qualityTier >= QUALITY_MAX) {
      return { ok: false, reason: '已是最高品质' }
    }
    if (worker.qualityTier !== occupant.qualityTier) {
      return { ok: false, reason: '品质不同，不能合成' }
    }
  }
  if (
    worker &&
    worker.assignment !== target.stationId &&
    assignedWorkers(save, target.stationId).length >= STATION_WORKER_CAP
  ) {
    return { ok: false, reason: '该站最多 2 人' }
  }
  return { ok: false, reason: '不能派驻到这里' }
}

export function applyWorkerDrag(save: Save, source: WorkerDragSource, target: WorkerDropTarget): ActionResult {
  if (sameDragEndpoint(source, target)) return { ok: true }
  const worker = findWorker(save, source.workerId)
  if (!worker) return { ok: false, reason: '没有这个 worker' }
  if (isWorkerInCombat(save, worker.id)) return { ok: false, reason: '正在战斗' }
  if (!canDropWorker(save, source, target)) {
    if (target.kind === 'slot' && slotOccupantId(save, target.stationId, target.slotIndex)) {
      return rejectOccupiedDrop(save, source, target)
    }
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
  if (canFuseDragOnSlot(save, source, target)) {
    return fuseWorkerWithStation(save, source.workerId, target.stationId)
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
