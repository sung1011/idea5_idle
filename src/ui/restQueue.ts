import { restingWorkers } from '../sim/assign'
import type { Save, Worker } from '../sim/types'
import { isFullWorkshopHp } from '../sim/workshopHp'

export const REST_HEAD_BADGE = '队首'
export const REST_BLOCK_BADGE = '堵队'

export type RestQueueBadge = typeof REST_HEAD_BADGE | typeof REST_BLOCK_BADGE

export type RestQueueRow = {
  worker: Worker
  id: string
  order: number
  /** 只有第 1 行有徽章。满血是「队首」，未满血（含劳损）是「堵队」。 */
  badge: RestQueueBadge | null
  /** 队首堵住时，第 2 行起压暗。队首自己不压。 */
  dim: boolean
}

export function restZoneTitle(count: number): string {
  return `休息区 · 队首上工 · ${count} 人`
}

/**
 * 与 `restingWorkers` 同序。1 是队首。
 * 队首未满血时本轮不看后面的人，显示成堵队。战斗和夺宝的人不在这列里。
 */
export function restQueueRows(save: Save): RestQueueRow[] {
  const list = restingWorkers(save)
  const blocked = list.length > 0 && !isFullWorkshopHp(list[0]!)
  return list.map((worker, index) => ({
    worker,
    id: worker.id,
    order: index + 1,
    badge: index === 0 ? (blocked ? REST_BLOCK_BADGE : REST_HEAD_BADGE) : null,
    dim: blocked && index > 0,
  }))
}
