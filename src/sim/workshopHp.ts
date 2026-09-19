import type { FoodSlot, Save, StationId, Worker } from './types'

/** 成功产出时，对该站在岗工人按 hpMax 掉血。 */
export const WORKSHOP_HP_DRAIN_RATIO = 0.02
/** 休息回血：未派驻且非战斗，按 hpMax 回复。 */
export const WORKSHOP_REST_HEAL_RATIO = 0.05
/** 已装食物且 Buff 有效时，工坊掉血乘区。 */
export const WORKSHOP_FOOD_DRAIN_MUL = 0.5
export const WORKSHOP_HP_EFF_HIGH = 0.3
export const WORKSHOP_HP_EFF_LOW = 0.1
export const WORKSHOP_HP_EFF_MID_MUL = 0.7
export const WORKSHOP_HP_EFF_LOW_MUL = 0.4

function safeHpMax(hpMax: number): number {
  return Math.max(1, Math.floor(hpMax))
}

export function workerHpRatio(worker: Worker): number {
  return worker.hp / safeHpMax(worker.hpMax)
}

/** HP>30% ×1；10%＜HP≤30% ×0.7；HP≤10% ×0.4。 */
export function workshopHpWorkMul(worker: Worker): number {
  const ratio = workerHpRatio(worker)
  if (ratio > WORKSHOP_HP_EFF_HIGH) return 1
  if (ratio <= WORKSHOP_HP_EFF_LOW) return WORKSHOP_HP_EFF_LOW_MUL
  return WORKSHOP_HP_EFF_MID_MUL
}

function foodBuffActive(slot: FoodSlot | null | undefined, now: number): boolean {
  return !!slot && now < slot.expiresAt
}

export function workshopCycleDrainAmount(worker: Worker, now: number): number {
  const base = Math.max(1, Math.floor(safeHpMax(worker.hpMax) * WORKSHOP_HP_DRAIN_RATIO))
  if (!foodBuffActive(worker.foodSlot, now)) return base
  return Math.max(1, Math.floor(base * WORKSHOP_FOOD_DRAIN_MUL))
}

export function restHealAmount(hpMax: number): number {
  return Math.max(1, Math.floor(safeHpMax(hpMax) * WORKSHOP_REST_HEAL_RATIO))
}

/** 成功产出后对该站在岗工人掉血。返回是否有人已处于虚弱（贡献 < 1）。 */
export function applyWorkshopCycleDrain(save: Save, stationId: StationId, now: number): boolean {
  let weak = false
  for (const worker of save.workers) {
    if (worker.assignment !== stationId) continue
    if (workshopHpWorkMul(worker) < 1) weak = true
    worker.hp = Math.max(1, worker.hp - workshopCycleDrainAmount(worker, now))
  }
  return weak
}
