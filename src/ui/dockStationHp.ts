import { assignedWorkers } from '../sim/assign'
import { STATION_ORDER } from '../sim/tables'
import type { Save, StationId } from '../sim/types'
import { workerWearHp } from '../sim/workshopHp'
import { hpBarFill, hpBarTone, type HpBarTone } from './hpBar'

export type DockStationHpCell = {
  stationId: StationId
  /** 0～1。空岗或无人是 0。有人用 wearHp / hpMax，与工坊行底色同一套。 */
  fill: number
  tone: HpBarTone
}

/** 底栏上沿六格。顺序固定 STATION_ORDER，只读在岗第一人。 */
export function dockStationHp(save: Save): DockStationHpCell[] {
  return STATION_ORDER.map((stationId) => {
    const worker = assignedWorkers(save, stationId)[0]
    if (!worker) return { stationId, fill: 0, tone: 'low' as const }
    const hp = workerWearHp(worker)
    return {
      stationId,
      fill: hpBarFill(hp, worker.hpMax),
      tone: hpBarTone(hp, worker.hpMax),
    }
  })
}
