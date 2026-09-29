import { restingWorkers } from './assign'
import type { Save } from './types'
import { isFullWorkshopHp } from './workshopHp'

/** 底栏营地圆钮。堵优先于可派；两边都没有才是安静木色。 */
export type CampDockTone = 'blocked' | 'ready' | 'quiet'

/**
 * 营地里满血、可立即派出的人。
 * 回血（hp 未到上限）、有劳损、战斗、夺宝、割草、困兽都不算；这些人不在休息队列，或过不了满血。
 */
export function dispatchableCampWorkers(save: Save) {
  return restingWorkers(save).filter((worker) => isFullWorkshopHp(worker))
}

export function campDockCount(save: Save): number {
  return dispatchableCampWorkers(save).length
}

/** 队首未满血（含劳损）时，本轮不派后面的人。空队列不算堵。 */
export function campQueueBlocked(save: Save): boolean {
  const head = restingWorkers(save)[0]
  return !!head && !isFullWorkshopHp(head)
}

export function campDockTone(save: Save): CampDockTone {
  if (campQueueBlocked(save)) return 'blocked'
  if (campDockCount(save) > 0) return 'ready'
  return 'quiet'
}
