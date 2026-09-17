import { addToBank, bankQty, takeFromBank } from './bank'
import { findWorker } from './recruit'
import { foodBuffDef, isFoodItemId, ITEM_DEF, type FoodItemId } from './tables'
import type {
  ActionResult,
  EffectId,
  FoodSlot,
  ItemId,
  ProductionBuff,
  Save,
  Worker,
} from './types'

export function foodEffectsOf(buff: ProductionBuff): FoodSlot['effects'] {
  return [{ effectId: buff.effectId, value: buff.mul, source: 'food' }]
}

export function makeFoodSlot(itemId: FoodItemId, leftover: number, now: number): FoodSlot {
  const buff = { ...FOOD_BUFF_OR_THROW(itemId) }
  return {
    itemId,
    qty: Math.max(0, Math.floor(leftover)),
    buff,
    expiresAt: now + buff.durationS * 1000,
    effects: foodEffectsOf(buff),
  }
}

function FOOD_BUFF_OR_THROW(itemId: FoodItemId): ProductionBuff {
  const buff = foodBuffDef(itemId)
  if (!buff) throw new Error(`missing food buff: ${itemId}`)
  return buff
}

export function isFoodBuffActive(slot: FoodSlot | null | undefined, now: number): boolean {
  return !!slot && now < slot.expiresAt
}

export function foodBuffRemainS(slot: FoodSlot | null | undefined, now: number): number {
  if (!slot) return 0
  return Math.max(0, Math.ceil((slot.expiresAt - now) / 1000))
}

export function foodEffectValue(slot: FoodSlot | null | undefined, effectId: EffectId, now: number): number {
  if (!isFoodBuffActive(slot, now) || !slot) return 0
  let best = 0
  if (slot.buff.effectId === effectId && slot.buff.mul > best) best = slot.buff.mul
  for (const effect of slot.effects) {
    if (effect.effectId === effectId && effect.value > best) best = effect.value
  }
  return best
}

function returnLeftover(save: Save, slot: FoodSlot | null): void {
  if (!slot || slot.qty <= 0) return
  addToBank(save, slot.itemId, slot.qty)
}

function applyFreshBuff(slot: FoodSlot, now: number): void {
  const fresh = foodBuffDef(slot.itemId)
  if (fresh) slot.buff = { ...fresh }
  slot.expiresAt = now + slot.buff.durationS * 1000
  slot.effects = foodEffectsOf(slot.buff)
}

function chainRefresh(slot: FoodSlot): void {
  const fresh = foodBuffDef(slot.itemId)
  if (fresh) slot.buff = { ...fresh }
  slot.expiresAt += slot.buff.durationS * 1000
  slot.effects = foodEffectsOf(slot.buff)
}

/** 到期吃槽内 1 份刷新；槽空则清空。now 远超截止时连吃多份。 */
export function refreshWorkerFood(worker: Worker, now: number): void {
  let slot = worker.foodSlot
  if (!slot) return
  while (slot && now >= slot.expiresAt) {
    if (slot.qty >= 1) {
      slot.qty -= 1
      chainRefresh(slot)
    } else {
      worker.foodSlot = null
      slot = null
    }
  }
}

export function refreshFoodSlots(save: Save, now: number): void {
  for (const worker of save.workers) refreshWorkerFood(worker, now)
}

export function loadFood(save: Save, workerId: string, itemId: ItemId, qty: number, now = Date.now()): ActionResult {
  if (!isFoodItemId(itemId)) return { ok: false, reason: '不是烹饪食物' }
  const copies = Math.floor(qty)
  if (copies < 1) return { ok: false, reason: '数量无效' }
  const worker = findWorker(save, workerId)
  if (!worker) return { ok: false, reason: '没有这个工人' }
  if (bankQty(save, itemId) < copies) return { ok: false, reason: `${ITEM_DEF[itemId].label}见底` }

  refreshWorkerFood(worker, now)
  const current = worker.foodSlot
  if (current && current.itemId === itemId && isFoodBuffActive(current, now)) {
    const took = takeFromBank(save, itemId, copies)
    if (!took.ok) return took
    current.qty += copies
    return { ok: true, message: `槽内${ITEM_DEF[itemId].label} +${copies}` }
  }

  returnLeftover(save, current)
  const took = takeFromBank(save, itemId, copies)
  if (!took.ok) return took
  worker.foodSlot = makeFoodSlot(itemId, copies - 1, now)
  const label = ITEM_DEF[itemId].label
  if (current && current.itemId !== itemId) {
    return { ok: true, message: `换食为${label}` }
  }
  return { ok: true, message: `装入${label}` }
}

export function unloadFood(save: Save, workerId: string): ActionResult {
  const worker = findWorker(save, workerId)
  if (!worker) return { ok: false, reason: '没有这个工人' }
  if (!worker.foodSlot) return { ok: false, reason: '没有装食物' }
  returnLeftover(save, worker.foodSlot)
  worker.foodSlot = null
  return { ok: true, message: '已卸下食物' }
}

/** 槽内再吃 1 份：扣 qty，按当前食物从 now 重计 expiresAt，刷新同一 Buff。不回血。 */
export function eatFood(save: Save, workerId: string, now = Date.now()): ActionResult {
  const worker = findWorker(save, workerId)
  if (!worker) return { ok: false, reason: '没有这个工人' }
  const slot = worker.foodSlot
  if (!slot) return { ok: false, reason: '没有装食物' }
  if (slot.qty < 1) return { ok: false, reason: '没有余粮' }
  slot.qty -= 1
  applyFreshBuff(slot, now)
  return { ok: true, message: `吃了1份${ITEM_DEF[slot.itemId].label}` }
}

/** 测试 / hydrate：按表重写当前 Buff 截止。 */
export function restartFoodBuff(slot: FoodSlot, now: number): void {
  applyFreshBuff(slot, now)
}
