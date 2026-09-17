import { isGatherFrozen } from '../sim/gather'
import { assignedCount, assignedWorkers, currentSpeed } from '../sim/query'
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
