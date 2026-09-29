import { assignedWorkers } from '../sim/assign'
import { STATION_ORDER } from '../sim/tables'
import type { Save, StationId } from '../sim/types'
import { workerWearHp } from '../sim/workshopHp'
import type { AppTabId } from './appTabs'
import { hpBarFill, hpBarTone, type HpBarTone } from './hpBar'

export type DockStationHpCell = {
  stationId: StationId
  /** 0～1。空岗是 0。有人用 wearHp / hpMax，与工坊行底色同一套。 */
  fill: number
  tone: HpBarTone
  /** 没人在岗。界面用整条灰斜纹加红框，不画成空的绿条，也不用残血红。 */
  empty: boolean
}

/** 工坊页站卡已有血色，底栏收起。悬赏、夺宝、割草、困兽和其它页显示。 */
export function showDockStationHp(tab: AppTabId): boolean {
  return tab !== 'workshop'
}

/** 底栏上沿六格。顺序固定 STATION_ORDER，只读在岗第一人。封闭不改这条：有人仍按 wearHp，无人标成空岗。 */
export function dockStationHp(save: Save): DockStationHpCell[] {
  return STATION_ORDER.map((stationId) => {
    const worker = assignedWorkers(save, stationId)[0]
    if (!worker) return { stationId, fill: 0, tone: 'low' as const, empty: true }
    const hp = workerWearHp(worker)
    return {
      stationId,
      fill: hpBarFill(hp, worker.hpMax),
      tone: hpBarTone(hp, worker.hpMax),
      empty: false,
    }
  })
}
