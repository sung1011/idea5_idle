import { isToolItemId, ITEM_DEF, ITEM_IDS, SELLABLE_GOODS } from './tables'
import type { ActionResult, ItemId, Save } from './types'

export function discardForgedTools(save: Save, itemId: ItemId, qty: number): void {
  if (!isToolItemId(itemId) || !save.forgedTools?.length) return
  let left = Math.max(0, Math.floor(qty))
  if (left <= 0) return
  save.forgedTools = save.forgedTools.filter((row) => {
    if (left > 0 && row.itemId === itemId) {
      left -= 1
      return false
    }
    return true
  })
}

/** 仅防 Number 溢出，玩法与 UI 不表现「满」。 */
export const ITEM_QTY_SOFT_CAP = Number.MAX_SAFE_INTEGER

export function itemQty(save: Save, itemId: ItemId): number {
  return save.bank[itemId] ?? 0
}

/** @deprecated 用 itemQty。旧调用点兼容。 */
export const bankQty = itemQty

/** 旧存档 `bank` / `items` 只收数量；忽略 capacity。 */
export function hydrateBank(raw: unknown): Partial<Record<ItemId, number>> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const src = raw as Record<string, unknown>
  const out: Partial<Record<ItemId, number>> = {}
  for (const id of ITEM_IDS) {
    const qty = src[id]
    if (typeof qty !== 'number' || !Number.isFinite(qty) || qty <= 0) continue
    out[id] = Math.min(ITEM_QTY_SOFT_CAP, Math.floor(qty))
  }
  // 旧凝神剂 / 护命符药并进双份雾 / 赶工粉。通用 potion 仍由 hydratePotionState 并进 salve。
  const legacyPotionBank: Record<string, ItemId> = { focusDraft: 'doubleMist', wardElixir: 'rushPowder' }
  for (const [from, to] of Object.entries(legacyPotionBank)) {
    const qty = src[from]
    if (typeof qty !== 'number' || !Number.isFinite(qty) || qty <= 0) continue
    out[to] = Math.min(ITEM_QTY_SOFT_CAP, (out[to] ?? 0) + Math.floor(qty))
  }
  return out
}

export function addToBank(save: Save, itemId: ItemId, qty: number): ActionResult {
  if (qty <= 0) return { ok: false, reason: '数量无效' }
  const next = itemQty(save, itemId) + qty
  save.bank[itemId] = Math.min(ITEM_QTY_SOFT_CAP, next)
  return { ok: true }
}

export function takeFromBank(save: Save, itemId: ItemId, qty: number): ActionResult {
  if (qty <= 0) return { ok: false, reason: '数量无效' }
  if (itemQty(save, itemId) < qty) return { ok: false, reason: `${ITEM_DEF[itemId].label}见底` }
  const next = itemQty(save, itemId) - qty
  if (next <= 0) delete save.bank[itemId]
  else save.bank[itemId] = next
  discardForgedTools(save, itemId, qty)
  return { ok: true }
}

/** 生活制品换金。主界面已撤卖货；留给调试 / 单测。偶遇当铺与收购另走报价表。 */
export function sellFromBank(save: Save, itemId: ItemId, qty: number): ActionResult {
  const def = ITEM_DEF[itemId]
  if (!def) return { ok: false, reason: '此物不能卖' }
  const took = takeFromBank(save, itemId, qty)
  if (!took.ok) return took
  save.gold += def.sellGold * qty
  return { ok: true }
}

/** 把工具和烹饪食物整批换成金币。旧兵器不进这批。 */
export function sellAllGoods(save: Save): ActionResult {
  let sold = 0
  for (const itemId of SELLABLE_GOODS) {
    const qty = itemQty(save, itemId)
    if (qty <= 0) continue
    const result = sellFromBank(save, itemId, qty)
    if (!result.ok) return result
    sold += qty
  }
  if (sold <= 0) return { ok: false, reason: '没有可卖的工具或食物' }
  return { ok: true }
}
