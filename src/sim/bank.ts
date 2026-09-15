import { ITEM_DEF, SELLABLE_GOODS } from './tables'
import type { ActionResult, ItemId, Save } from './types'

export function bankQty(save: Save, itemId: ItemId): number {
  return save.bank[itemId] ?? 0
}

export function bankCap(itemId: ItemId): number {
  return ITEM_DEF[itemId].cap
}

export function bankRoom(save: Save, itemId: ItemId): number {
  return Math.max(0, bankCap(itemId) - bankQty(save, itemId))
}

export function canFit(save: Save, itemId: ItemId, qty: number): boolean {
  return qty > 0 && bankRoom(save, itemId) >= qty
}

export function addToBank(save: Save, itemId: ItemId, qty: number): ActionResult {
  if (qty <= 0) return { ok: false, reason: '数量无效' }
  if (!canFit(save, itemId, qty)) return { ok: false, reason: `${ITEM_DEF[itemId].label}堆满` }
  save.bank[itemId] = bankQty(save, itemId) + qty
  return { ok: true }
}

export function takeFromBank(save: Save, itemId: ItemId, qty: number): ActionResult {
  if (qty <= 0) return { ok: false, reason: '数量无效' }
  if (bankQty(save, itemId) < qty) return { ok: false, reason: `${ITEM_DEF[itemId].label}见底` }
  const next = bankQty(save, itemId) - qty
  if (next <= 0) delete save.bank[itemId]
  else save.bank[itemId] = next
  return { ok: true }
}

/** 生活制品卖钱。金币只服务抽人和卖货。 */
export function sellFromBank(save: Save, itemId: ItemId, qty: number): ActionResult {
  const def = ITEM_DEF[itemId]
  if (!def) return { ok: false, reason: '此物不能卖' }
  const took = takeFromBank(save, itemId, qty)
  if (!took.ok) return took
  save.gold += def.sellGold * qty
  return { ok: true }
}

/** 把武器和熟食整批换成金币。 */
export function sellAllGoods(save: Save): ActionResult {
  let sold = 0
  for (const itemId of SELLABLE_GOODS) {
    const qty = bankQty(save, itemId)
    if (qty <= 0) continue
    const result = sellFromBank(save, itemId, qty)
    if (!result.ok) return result
    sold += qty
  }
  if (sold <= 0) return { ok: false, reason: '没有可卖的武器或熟食' }
  return { ok: true }
}
