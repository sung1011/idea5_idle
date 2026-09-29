import { restingWorkers } from '../sim/assign'
import type { FoodItemId } from '../sim/tables'
import type { Save, Worker } from '../sim/types'
import { workerRaceShortLabel } from '../sim/workerRace'
import { workerWearHp } from '../sim/workshopHp'
import { workerShortName } from './workerGroups'

/** 剩余不超过这么多份（含吃完）时，伙食小字变红。 */
export const REST_FOOD_LOW_AT = 2

export type WorkshopQueueHead =
  | { kind: 'empty' }
  | {
      kind: 'worker'
      worker: Worker
      id: string
      name: string
      race: string
      /** 「名字 · 种族」。没有种族时只留名字。 */
      title: string
      hp: number
      hpLabel: string
    }

export type RestFoodBand = {
  itemId: FoodItemId | null
  qty: number
  caption: string
  low: boolean
}

/** 休息队列队首。在岗、战斗、夺宝、割草、困兽都不算。空队列没有队首。 */
export function workshopQueueHead(save: Save): WorkshopQueueHead {
  const worker = restingWorkers(save)[0]
  if (!worker) return { kind: 'empty' }
  const name = workerShortName(worker)
  const race = workerRaceShortLabel(worker.race)
  const hp = Math.max(0, Math.floor(workerWearHp(worker)))
  return {
    kind: 'worker',
    worker,
    id: worker.id,
    name,
    race,
    title: race ? `${name} · ${race}` : name,
    hp,
    hpLabel: String(hp),
  }
}

/** 状态条伙食方块：未选只写「未选」；已选下面是剩余份数。 */
export function restFoodBand(itemId: FoodItemId | null, qty: number): RestFoodBand {
  if (!itemId) return { itemId: null, qty: 0, caption: '未选', low: false }
  const count = Math.max(0, Math.floor(qty))
  return {
    itemId,
    qty: count,
    caption: `×${count}`,
    low: count <= REST_FOOD_LOW_AT,
  }
}
