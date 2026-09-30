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
  /** 只有第 1 行有徽章。满血是「队首」，未满血（含劳损）是「堵队」。队首不写数字。 */
  badge: RestQueueBadge | null
  /** 队首堵住时，第 2 行起压暗。队首自己不压。 */
  dim: boolean
  /** 队首为 null。其后是「2」「3」「4」…，跟着休息队列走。 */
  orderMark: string | null
  /** 未满血或仍有劳损（不能派）时序号用灰字。满血可派为 false。 */
  orderMuted: boolean
}

/** 弹层标题只写地方名。可派人数在底栏营地圆钮上。 */
export function restZoneTitle(_count: number): string {
  return '营地'
}

/** 队首只留「队首 / 堵队」，不写 1。后面按队列位置写 2、3、4… */
export function restQueueOrderMark(order: number): string | null {
  if (order <= 1) return null
  return String(order)
}

/** 满血可派用白字。未满血或仍有劳损（不能派）用灰字。 */
export function restQueueOrderMuted(worker: Worker): boolean {
  return !isFullWorkshopHp(worker)
}

/**
 * 与 `restingWorkers` 同序。1 是队首。
 * 队首未满血时本轮不看后面的人，显示成堵队。战斗和夺宝的人不在这列里。
 * 出队、入队、合成只改名册顺序，序号跟着这份列表重算。
 */
export function restQueueRows(save: Save): RestQueueRow[] {
  const list = restingWorkers(save)
  const blocked = list.length > 0 && !isFullWorkshopHp(list[0]!)
  return list.map((worker, index) => {
    const order = index + 1
    return {
      worker,
      id: worker.id,
      order,
      badge: index === 0 ? (blocked ? REST_BLOCK_BADGE : REST_HEAD_BADGE) : null,
      dim: blocked && index > 0,
      orderMark: restQueueOrderMark(order),
      orderMuted: restQueueOrderMuted(worker),
    }
  })
}
