import { bankQty, takeFromBank } from './bank'
import { ITEM_DEF } from './tables'
import type { ActionResult, ItemId, Save } from './types'

export type OrderNeedMap = Partial<Record<ItemId, number>>

export type OrderDef = {
  id: string
  label: string
  needs: OrderNeedMap
  departGold: number
}

export type OrderLine = {
  itemId: ItemId
  label: string
  need: number
  have: number
  missing: number
}

/**
 * 出发订单池。武器 / 熟食等组合轮换，流水线产物有去处。
 * 第一期仍收基础 copper 档：weapon / meal（及木头、鱼）。
 * 高阶铁器 / 秘银器订单后做，避免开局卡在未解锁品类。
 */
export const ORDER_DEFS: readonly OrderDef[] = [
  { id: 'scoutRation', label: '斥候干粮', needs: { weapon: 1, meal: 2 }, departGold: 8 },
  { id: 'caravanGuard', label: '商队护卫', needs: { weapon: 2, meal: 1, wood: 2 }, departGold: 12 },
  { id: 'campKitchen', label: '营地开伙', needs: { meal: 3, wood: 3 }, departGold: 10 },
  { id: 'bladeTrial', label: '试刃出征', needs: { weapon: 3 }, departGold: 14 },
  { id: 'riverWatch', label: '河岸巡守', needs: { weapon: 1, meal: 1, fish: 2 }, departGold: 9 },
  { id: 'timberPost', label: '木桩营地', needs: { wood: 4, meal: 1 }, departGold: 7 },
]

export function firstOrderId(): string {
  return ORDER_DEFS[0].id
}

export function orderByIndex(index: number): OrderDef {
  const safe = Number.isFinite(index) && index >= 0 ? Math.floor(index) : 0
  return ORDER_DEFS[safe % ORDER_DEFS.length]
}

export function findOrder(id: string | undefined): OrderDef | undefined {
  if (!id) return undefined
  return ORDER_DEFS.find((o) => o.id === id)
}

export function currentOrder(save: Save): OrderDef {
  return findOrder(save.currentOrderId) ?? orderByIndex(save.orderIndex)
}

export function orderNeedEntries(order: OrderDef): Array<[ItemId, number]> {
  return (Object.entries(order.needs) as Array<[ItemId, number]>).filter(([, qty]) => qty > 0)
}

export function orderLines(save: Save): OrderLine[] {
  const order = currentOrder(save)
  return orderNeedEntries(order).map(([itemId, need]) => {
    const have = bankQty(save, itemId)
    return {
      itemId,
      label: ITEM_DEF[itemId].label,
      need,
      have,
      missing: Math.max(0, need - have),
    }
  })
}

function missingLabels(save: Save): string[] {
  return orderLines(save)
    .filter((line) => line.missing > 0)
    .map((line) => `${line.label}差 ${line.missing}`)
}

export function submitBlockReason(save: Save): string | null {
  if (save.orderSubmitted) return '订单已提交，可以出发'
  const missing = missingLabels(save)
  if (missing.length) return `货不够：${missing.join('、')}`
  return null
}

export function departBlockReason(save: Save): string | null {
  if (!save.orderSubmitted) return '先提交当前订单'
  return null
}

export function canSubmitOrder(save: Save): boolean {
  return submitBlockReason(save) === null
}

export function canDepart(save: Save): boolean {
  return departBlockReason(save) === null
}

export function submitOrder(save: Save): ActionResult {
  const blocked = submitBlockReason(save)
  if (blocked) return { ok: false, reason: blocked }
  const order = currentOrder(save)
  for (const [itemId, qty] of orderNeedEntries(order)) {
    const took = takeFromBank(save, itemId, qty)
    if (!took.ok) return took
  }
  save.orderSubmitted = true
  return { ok: true }
}

export function advanceOrder(save: Save): OrderDef {
  save.orderIndex += 1
  save.orderSubmitted = false
  const next = orderByIndex(save.orderIndex)
  save.currentOrderId = next.id
  return next
}

/** 出发门闩。只发补给金并换下一单，不做战斗 tick。 */
export function depart(save: Save, now = Date.now()): ActionResult {
  const blocked = departBlockReason(save)
  if (blocked) return { ok: false, reason: blocked }
  const order = currentOrder(save)
  save.gold += order.departGold
  save.departCount += 1
  save.lastDepartAt = now
  advanceOrder(save)
  return { ok: true, message: `已出发（战斗稍后）。补给金 +${order.departGold}` }
}

/** 旧存档补默认订单字段；未知 id 按 orderIndex 回落到池子。 */
export function hydrateOrderFields(save: Save): Save {
  const index = Number.isFinite(save.orderIndex) && save.orderIndex >= 0 ? Math.floor(save.orderIndex) : 0
  save.orderIndex = index
  save.currentOrderId = findOrder(save.currentOrderId)?.id ?? orderByIndex(index).id
  save.orderSubmitted = save.orderSubmitted === true
  save.departCount =
    Number.isFinite(save.departCount) && save.departCount > 0 ? Math.floor(save.departCount) : 0
  save.lastDepartAt =
    typeof save.lastDepartAt === 'number' && Number.isFinite(save.lastDepartAt) ? save.lastDepartAt : null
  return save
}
