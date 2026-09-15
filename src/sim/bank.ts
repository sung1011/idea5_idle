import type { ActionResult, ItemId, Save } from './types'

const SELL_GOLD: Record<ItemId, number> = {
  log: 2,
  oakLog: 5,
  herb: 3,
  minorPotion: 12,
  copperOre: 3,
}

export function bankQty(save: Save, itemId: ItemId): number {
  return save.bank[itemId] ?? 0
}

export function addToBank(save: Save, itemId: ItemId, qty: number): void {
  if (qty <= 0) return
  save.bank[itemId] = bankQty(save, itemId) + qty
}

export function takeFromBank(save: Save, itemId: ItemId, qty: number): ActionResult {
  if (qty <= 0) return { ok: false, reason: '数量无效' }
  if (bankQty(save, itemId) < qty) return { ok: false, reason: '银行存货不足' }
  const next = bankQty(save, itemId) - qty
  if (next <= 0) delete save.bank[itemId]
  else save.bank[itemId] = next
  return { ok: true }
}

/** 生活产货在账号银行变金币。不学战斗技能，也不改生活等级。 */
export function sellFromBank(save: Save, itemId: ItemId, qty: number): ActionResult {
  const price = SELL_GOLD[itemId]
  if (price == null) return { ok: false, reason: '此物不能卖' }
  const took = takeFromBank(save, itemId, qty)
  if (!took.ok) return took
  save.gold += price * qty
  return { ok: true }
}
