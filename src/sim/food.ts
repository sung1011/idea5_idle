import { addToBank, bankQty, takeFromBank } from './bank'
import { isWorkerInCombat } from './combat'
import { clearWorkerNew, findWorker } from './recruit'
import { FOOD_HEAL_RATIO, foodBuffDef, isFoodItemId, ITEM_DEF, type FoodItemId } from './tables'
import { isWorkerInTreasureMine } from './treasureMineQuery'
import { isWoundedHp } from './workshopHp'
import type {
  ActionResult,
  EffectId,
  FoodSlot,
  ItemId,
  ProductionBuff,
  Save,
  StationId,
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

/** 个人食物槽已废弃，不再按到期续吃。 */
export function refreshWorkerFood(_worker: Worker, _now: number): void {}

/** 旧档个人槽余粮退回物资，然后清空。 */
export function migrateWorkerFoodSlots(save: Save): void {
  for (const worker of save.workers) {
    const slot = worker.foodSlot
    if (slot && slot.qty > 0) addToBank(save, slot.itemId, Math.floor(slot.qty))
    worker.foodSlot = null
  }
}

export function hydrateRestFoodId(raw: unknown): FoodItemId | null {
  return isFoodItemId(raw) ? raw : null
}

export function selectRestFood(save: Save, itemId: FoodItemId | null): ActionResult {
  if (itemId !== null && !isFoodItemId(itemId)) return { ok: false, reason: '不是烹饪食物' }
  save.restFoodId = itemId
  return { ok: true }
}

function applyRestFoodBuff(worker: Worker, itemId: FoodItemId, now: number): void {
  const def = foodBuffDef(itemId)
  if (!def) {
    worker.foodBuff = null
    return
  }
  worker.foodBuff = { itemId, expiresAt: now + def.durationS * 1000 }
}

/** 进食挂上的短时效果。过期视为没有。 */
export function foodBuffEffectValue(worker: Worker, effectId: EffectId, now: number): number {
  const buff = worker.foodBuff
  if (!buff || !(now < buff.expiresAt)) return 0
  const def = foodBuffDef(buff.itemId)
  if (!def || def.effectId !== effectId || !(def.mul > 0)) return 0
  return def.mul
}

/**
 * 已在休息（无岗、不在战斗/夺宝）时把该工人挪到名册末尾。
 * 仍在岗或行军中不动，避免伤员撤岗后堵在休息队首。
 */
export function sendWorkerToRestTail(save: Save, workerId: string): boolean {
  const index = save.workers.findIndex((worker) => worker.id === workerId)
  if (index < 0) return false
  const worker = save.workers[index]
  if (!worker || worker.assignment !== null) return false
  if (isWorkerInCombat(save, workerId) || isWorkerInTreasureMine(save, workerId)) return false
  if (index === save.workers.length - 1) return true
  const [moved] = save.workers.splice(index, 1)
  if (moved) save.workers.push(moved)
  return true
}

/**
 * 刚进入休息：先排到名册队尾。残血且选了伙食时再从物资扣 1 份并回血。
 * 未选、没货、不在休息、或仍在战斗/夺宝时不吃。
 */
export function offerRestFood(save: Save, workerId: string, now = save.lastTick || Date.now()): ActionResult | null {
  if (!sendWorkerToRestTail(save, workerId)) return null
  const worker = findWorker(save, workerId)
  if (!worker || !isWoundedHp(worker)) return null
  const itemId = save.restFoodId
  if (!itemId || !isFoodItemId(itemId)) return null
  if (bankQty(save, itemId) < 1) return null
  const took = takeFromBank(save, itemId, 1)
  if (!took.ok) return null
  const healed = applyFoodHeal(worker, itemId)
  applyRestFoodBuff(worker, itemId, now)
  const label = ITEM_DEF[itemId].label
  return { ok: true, message: healed > 0 ? `吃了1份${label}，HP+${healed}` : `吃了1份${label}` }
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
  clearWorkerNew(save, workerId)
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
  clearWorkerNew(save, workerId)
  if (!worker.foodSlot) return { ok: false, reason: '没有装食物' }
  returnLeftover(save, worker.foodSlot)
  worker.foodSlot = null
  return { ok: true, message: '已卸下食物' }
}

function safeHpMax(hpMax: number): number {
  return Math.max(1, Math.floor(hpMax))
}

/** 回血量：ceil(hpMax * 比例)，至少使 HP>1。 */
export function foodHealAmount(itemId: ItemId, hpMax: number, hp: number): number {
  const ratio = isFoodItemId(itemId) ? FOOD_HEAL_RATIO[itemId] : 0
  let amount = Math.max(1, Math.ceil(safeHpMax(hpMax) * ratio))
  if (hp + amount <= 1) amount = Math.max(1, 2 - hp)
  return amount
}

export function applyFoodHeal(worker: Worker, itemId: ItemId): number {
  const amount = foodHealAmount(itemId, worker.hpMax, worker.hp)
  const next = Math.min(worker.hpMax, worker.hp + amount)
  const healed = next - worker.hp
  worker.hp = next
  return healed
}

function canEatSlot(slot: NonNullable<Worker['foodSlot']>): boolean {
  return slot.qty >= 1
}

/** 槽内再吃 1 份：扣 qty，按当前食物重计 Buff，并按食物回血。 */
export function eatFood(save: Save, workerId: string, now = Date.now()): ActionResult {
  const worker = findWorker(save, workerId)
  if (!worker) return { ok: false, reason: '没有这个工人' }
  const slot = worker.foodSlot
  if (!slot) return { ok: false, reason: '没有装食物' }
  if (!canEatSlot(slot)) return { ok: false, reason: '没有余粮' }
  const itemId = slot.itemId
  slot.qty -= 1
  applyFreshBuff(slot, now)
  const healed = applyFoodHeal(worker, itemId)
  const label = ITEM_DEF[itemId].label
  return { ok: true, message: healed > 0 ? `吃了1份${label}，HP+${healed}` : `吃了1份${label}` }
}

/** 旧入口：在岗 / 战后不再吃个人槽。进食只在进入休息时。 */
export function tryAutoEatWhenWounded(save: Save, workerId: string, now = Date.now()): ActionResult | null {
  return offerRestFood(save, workerId, now)
}

export function tryAutoEatAssigned(_save: Save, _stationId: StationId, _now = Date.now()): void {}

export function tryAutoEatAfterCombat(save: Save, workerIds: readonly string[], now = Date.now()): void {
  for (const id of workerIds) offerRestFood(save, id, now)
}

/** 测试 / hydrate：按表重写当前 Buff 截止。 */
export function restartFoodBuff(slot: FoodSlot, now: number): void {
  applyFreshBuff(slot, now)
}
