import type { WorkerDropTarget } from './workerDrag'

/** 不在工坊页时，拖向站点这类操作的提示。 */
export const CAMP_STATION_DRAG_TIP = '回工坊拖动'

/**
 * 营地内互合不提示。人在工坊页时站点放下交给原规则。
 * 不在工坊页、指针离开名单或落在站槽上时，才提示回工坊。
 */
export function campDragStationTip(onWorkshop: boolean, over: WorkerDropTarget | null): boolean {
  if (onWorkshop) return false
  if (!over || over.kind === 'slot') return true
  return false
}
