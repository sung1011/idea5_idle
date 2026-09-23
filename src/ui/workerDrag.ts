import { assignedWorkers, assignWorker } from '../sim/assign'
import { isWorkerInCombat } from '../sim/combat'
import { canFuseRestWorkers, fuseRestWorkers } from '../sim/fuse'
import { clearWorkerNew, findWorker } from '../sim/recruit'
import { isStationUnlocked, stationLockedTip } from '../sim/stationUnlock'
import { isStationId, STATION_WORKER_CAP } from '../sim/tables'
import type { ActionResult, Save, StationId } from '../sim/types'
import { workshopStationBoards } from './workerGroups'

export const WORKER_DRAG_THRESHOLD_PX = 12

let workerDragActive = false

export function setWorkerDragActive(active: boolean) {
  workerDragActive = active
}

export function isWorkerDragActive(): boolean {
  return workerDragActive
}

export type WorkerDragSource =
  | { kind: 'rest'; workerId: string }
  | { kind: 'slot'; workerId: string; stationId: StationId; slotIndex: number }

export type WorkerDropTarget =
  | { kind: 'rest' }
  | { kind: 'restWorker'; workerId: string }
  | { kind: 'slot'; stationId: StationId; slotIndex: number }

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
  if (target.kind === 'restWorker' && source.workerId === target.workerId) return true
  return (
    source.kind === 'slot' &&
    target.kind === 'slot' &&
    source.stationId === target.stationId &&
    source.slotIndex === target.slotIndex
  )
}

export const FUSE_DRAG_TIP = '休息区同品质可拖到一起合成'

/** 休息区有两名同档、未满档、可拖的工人。在岗之间不算。 */
export function canDragFuseAny(save: Save): boolean {
  const resting = save.workers.filter(
    (worker) => worker.assignment == null && canDragWorker(save, worker.id),
  )
  for (let i = 0; i < resting.length; i += 1) {
    for (let j = i + 1; j < resting.length; j += 1) {
      if (canFuseRestWorkers(save, resting[i].id, resting[j].id)) return true
    }
  }
  return false
}

/** 未成功合成过、且当前能拖合时才出工人页短气泡。 */
export function shouldShowFuseDragTip(save: Save): boolean {
  return save.fuseDragTipDone !== true && canDragFuseAny(save)
}

export function canDropWorker(save: Save, source: WorkerDragSource, target: WorkerDropTarget): boolean {
  const worker = findWorker(save, source.workerId)
  if (!worker || isWorkerInCombat(save, worker.id)) return false
  if (sameDragEndpoint(source, target)) return false

  if (target.kind === 'restWorker') return canFuseRestWorkers(save, source.workerId, target.workerId)
  if (target.kind === 'rest') return source.kind === 'slot'

  const occupantId = slotOccupantId(save, target.stationId, target.slotIndex)
  if (occupantId) return occupantId !== source.workerId
  if (!isStationUnlocked(save, target.stationId)) return false
  if (worker.assignment === target.stationId) return false
  return assignedWorkers(save, target.stationId).length < STATION_WORKER_CAP
}

/** 站槽已有人：原在岗回休息，拖来的人上岗。不在站槽合成。 */
function replaceStationWorker(save: Save, sourceId: string, stationId: StationId): ActionResult {
  for (const other of assignedWorkers(save, stationId)) {
    if (other.id === sourceId) continue
    const back = assignWorker(save, other.id, null)
    if (!back.ok) return back
  }
  return assignWorker(save, sourceId, stationId)
}

export function applyWorkerDrag(save: Save, source: WorkerDragSource, target: WorkerDropTarget): ActionResult {
  if (sameDragEndpoint(source, target)) return { ok: true }
  clearWorkerNew(save, source.workerId)
  const worker = findWorker(save, source.workerId)
  if (!worker) return { ok: false, reason: '没有这个 worker' }
  if (isWorkerInCombat(save, worker.id)) return { ok: false, reason: '正在战斗' }
  if (!canDropWorker(save, source, target)) {
    if (target.kind === 'restWorker') return fuseRestWorkers(save, source.workerId, target.workerId)
    if (
      target.kind === 'slot' &&
      !isStationUnlocked(save, target.stationId) &&
      !slotOccupantId(save, target.stationId, target.slotIndex)
    ) {
      return { ok: false, reason: stationLockedTip(target.stationId) }
    }
    if (
      target.kind === 'slot' &&
      !slotOccupantId(save, target.stationId, target.slotIndex) &&
      worker.assignment !== target.stationId &&
      assignedWorkers(save, target.stationId).length >= STATION_WORKER_CAP
    ) {
      return { ok: false, reason: '该站最多 1 人' }
    }
    return { ok: false, reason: '不能派驻到这里' }
  }
  if (target.kind === 'rest') return assignWorker(save, source.workerId, null)
  if (target.kind === 'restWorker') {
    clearWorkerNew(save, target.workerId)
    return fuseRestWorkers(save, source.workerId, target.workerId)
  }
  const occupantId = slotOccupantId(save, target.stationId, target.slotIndex)
  if (occupantId && occupantId !== source.workerId) return replaceStationWorker(save, source.workerId, target.stationId)
  return assignWorker(save, source.workerId, target.stationId)
}

export function dropTargetFromDataset(ds: DOMStringMap): WorkerDropTarget | null {
  if (ds.drop === 'rest') return { kind: 'rest' }
  if (ds.drop === 'rest-worker' && ds.worker) return { kind: 'restWorker', workerId: ds.worker }
  if (ds.drop !== 'slot' || !ds.station || ds.slot == null) return null
  if (!isStationId(ds.station)) return null
  const slotIndex = Number(ds.slot)
  if (!Number.isInteger(slotIndex) || slotIndex < 0) return null
  return { kind: 'slot', stationId: ds.station, slotIndex }
}

export function dropTargetEquals(a: WorkerDropTarget | null, b: WorkerDropTarget | null): boolean {
  if (!a || !b) return a === b
  if (a.kind === 'rest' && b.kind === 'rest') return true
  if (a.kind === 'restWorker' && b.kind === 'restWorker') return a.workerId === b.workerId
  return a.kind === 'slot' && b.kind === 'slot' && a.stationId === b.stationId && a.slotIndex === b.slotIndex
}
