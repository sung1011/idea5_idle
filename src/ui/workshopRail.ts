import { isGatherFrozen } from '../sim/gather'
import { assignedCount, assignedWorkers, currentSpeed } from '../sim/query'
import { STATION_WORKER_CAP } from '../sim/tables'
import type { Save, StationId } from '../sim/types'
import { visualStationProgress, type VisualProgressInput } from './visualProgress'
import { qualityOf } from './workerQuality'

/** 竖签色点：在岗每人一颗，色取该档 WORKER_QUALITY_TABLE.color；空岗空数组。 */
export function railWorkerDotColors(save: Save, stationId: StationId): string[] {
  return assignedWorkers(save, stationId).map((w) => qualityOf(w).color)
}

export function railProgressHalted(save: Save, stationId: StationId): boolean {
  return !!save.stations[stationId].stallReason || isGatherFrozen(save, stationId)
}

/**
 * 空转：已派入该站，但本 tick 不会推进 `station.progress`。
 * 对齐 `stepStation` / `currentSpeed`，不另造玩法标志：
 * - 无人不算空转（左栏也不画点）
 * - `stallReason`（缺料 `emptyInput` 等）时 `stepStation` 提前 return，progress 不增
 * - `isGatherFrozen`（矿脉恢复 / 狩猎遇险停手）同样不推进，且 `currentSpeed=0`
 * - `currentSpeed<=0`（人数权重/效率乘完为 0）时 `progress += 0`
 * 低体力只降速、仍在推进，不算空转。锁站若 sim 仍加 progress 也不算。
 */
export function railStationIdle(save: Save, stationId: StationId, now = Date.now()): boolean {
  if (assignedCount(save, stationId) <= 0) return false
  if (railProgressHalted(save, stationId)) return true
  return currentSpeed(save, stationId, now) <= 0
}

export type RailSlotDot = {
  color: string
  idle: boolean
}

/** 一站一槽：有人则品质色 + 该站空转旗；空槽 null，左栏不画点。 */
export function railStationSlotDots(
  save: Save,
  stationId: StationId,
  now = Date.now(),
): Array<RailSlotDot | null> {
  const workers = assignedWorkers(save, stationId)
  const idle = railStationIdle(save, stationId, now)
  const slots: Array<RailSlotDot | null> = []
  for (let i = 0; i < STATION_WORKER_CAP; i += 1) {
    const worker = workers[i]
    slots.push(worker ? { color: qualityOf(worker).color, idle } : null)
  }
  return slots
}

/** 一组两站各一槽，先上站后下站。 */
export function railGroupSlotDots(
  save: Save,
  stations: readonly [StationId, StationId],
  now = Date.now(),
): Array<RailSlotDot | null> {
  return [...railStationSlotDots(save, stations[0], now), ...railStationSlotDots(save, stations[1], now)]
}

export function railVisualInput(save: Save, stationId: StationId): Omit<VisualProgressInput, 'now'> {
  const station = save.stations[stationId]
  return {
    progress: station.progress,
    speed: currentSpeed(save, stationId),
    stalled: railProgressHalted(save, stationId),
    assigned: assignedCount(save, stationId),
    lastTick: save.lastTick,
  }
}

/** 与站卡同一套显示进度，0～100。停产 / 冰冻 / 空岗不假跑。 */
export function railVisualPct(save: Save, stationId: StationId, now: number): number {
  return Math.min(100, visualStationProgress({ ...railVisualInput(save, stationId), now }) * 100)
}
