import { describe, expect, it } from 'vitest'
import { bankQty } from './bank'
import { createSave } from './createSave'
import {
  ORDER_DEFS,
  advanceOrder,
  canDepart,
  canSubmitOrder,
  currentOrder,
  depart,
  departBlockReason,
  hydrateOrderFields,
  orderByIndex,
  orderNeedEntries,
  submitBlockReason,
  submitOrder,
} from './orders'
import type { ItemId, Save } from './types'

function stock(save: Save, needs: Partial<Record<ItemId, number>>) {
  for (const [itemId, qty] of Object.entries(needs) as Array<[ItemId, number]>) {
    save.bank[itemId] = qty
  }
}

function needSignature(order: { needs: Partial<Record<ItemId, number>> }): string {
  return orderNeedEntries(order as (typeof ORDER_DEFS)[number])
    .map(([itemId, qty]) => `${itemId}:${qty}`)
    .sort()
    .join('|')
}

describe('order pool', () => {
  it('has distinct item mixes so consecutive orders change', () => {
    const signatures = ORDER_DEFS.map(needSignature)
    expect(new Set(signatures).size).toBe(ORDER_DEFS.length)
    expect(ORDER_DEFS.length).toBeGreaterThanOrEqual(4)
    expect(ORDER_DEFS.some((o) => (o.needs.weapon ?? 0) > 0)).toBe(true)
    expect(ORDER_DEFS.some((o) => (o.needs.meal ?? 0) > 0)).toBe(true)
    expect(needSignature(orderByIndex(0))).not.toBe(needSignature(orderByIndex(1)))
  })
})

describe('submitOrder', () => {
  it('fails when the bank is short and does not take goods', () => {
    const save = createSave()
    save.bank.weapon = 1
    save.bank.meal = 1
    expect(canSubmitOrder(save)).toBe(false)
    expect(submitBlockReason(save)).toContain('货不够')
    expect(submitBlockReason(save)).toContain('熟食')
    const result = submitOrder(save)
    expect(result.ok).toBe(false)
    expect(bankQty(save, 'weapon')).toBe(1)
    expect(bankQty(save, 'meal')).toBe(1)
    expect(save.orderSubmitted).toBe(false)
  })

  it('deducts the current order goods when the bank is enough', () => {
    const save = createSave()
    const order = currentOrder(save)
    stock(save, { weapon: 4, meal: 4, wood: 4, fish: 4 })
    expect(canSubmitOrder(save)).toBe(true)
    expect(submitOrder(save).ok).toBe(true)
    expect(save.orderSubmitted).toBe(true)
    for (const [itemId, qty] of orderNeedEntries(order)) {
      expect(bankQty(save, itemId)).toBe(4 - qty)
    }
  })

  it('does not deduct twice after the order is already submitted', () => {
    const save = createSave()
    stock(save, { weapon: 1, meal: 2 })
    expect(submitOrder(save).ok).toBe(true)
    expect(canSubmitOrder(save)).toBe(false)
    expect(submitBlockReason(save)).toContain('已提交')
    expect(submitOrder(save).ok).toBe(false)
    expect(bankQty(save, 'weapon')).toBe(0)
    expect(bankQty(save, 'meal')).toBe(0)
  })
})

describe('depart', () => {
  it('blocks depart until the current order is submitted', () => {
    const save = createSave()
    stock(save, { weapon: 1, meal: 2 })
    expect(canDepart(save)).toBe(false)
    expect(departBlockReason(save)).toBe('先提交当前订单')
    expect(depart(save).ok).toBe(false)
    expect(save.departCount).toBe(0)
    expect(save.currentOrderId).toBe(ORDER_DEFS[0].id)
  })

  it('pays table gold, increments departCount, and rotates to a new order', () => {
    const save = createSave()
    save.gold = 10
    const first = currentOrder(save)
    stock(save, first.needs)
    expect(submitOrder(save).ok).toBe(true)
    expect(canDepart(save)).toBe(true)

    const now = 1_700_000_000_000
    const result = depart(save, now)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.message).toContain('已出发（战斗稍后）')
    expect(save.gold).toBe(10 + first.departGold)
    expect(save.departCount).toBe(1)
    expect(save.lastDepartAt).toBe(now)
    expect(save.orderSubmitted).toBe(false)
    expect(save.orderIndex).toBe(1)
    expect(save.currentOrderId).toBe(ORDER_DEFS[1].id)
    expect(needSignature(currentOrder(save))).not.toBe(needSignature(first))
  })

  it('keeps rotating through the pool by orderIndex', () => {
    const save = createSave()
    const seen: string[] = []
    for (let i = 0; i < ORDER_DEFS.length + 1; i++) {
      seen.push(currentOrder(save).id)
      advanceOrder(save)
    }
    expect(seen[0]).toBe(ORDER_DEFS[0].id)
    expect(seen[1]).toBe(ORDER_DEFS[1].id)
    expect(seen[ORDER_DEFS.length]).toBe(ORDER_DEFS[0].id)
  })
})

describe('hydrateOrderFields', () => {
  it('repairs a missing or unknown current order from the index', () => {
    const save = createSave()
    save.currentOrderId = 'missingOrder'
    save.orderIndex = 2
    hydrateOrderFields(save)
    expect(save.currentOrderId).toBe(ORDER_DEFS[2].id)
    expect(save.orderSubmitted).toBe(false)
  })
})
