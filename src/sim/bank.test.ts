import { describe, expect, it } from 'vitest'
import { addToBank, hydrateBank, itemQty, sellAllGoods, sellFromBank } from './bank'
import { createSave } from './createSave'

describe('sell goods', () => {
  it('batch-sells tools and cooked food, not old weapons', () => {
    const save = createSave()
    save.gold = 0
    save.bank.weapon = 2
    save.bank.tool = 1
    save.bank.meal = 1
    save.bank.roast = 1
    const result = sellAllGoods(save)
    expect(result.ok).toBe(true)
    expect(save.bank.weapon).toBe(2)
    expect(save.bank.tool ?? 0).toBe(0)
    expect(save.bank.meal ?? 0).toBe(0)
    expect(save.bank.roast ?? 0).toBe(0)
    expect(save.gold).toBe(12 + 8 + 10)
  })

  it('fails when there is nothing to sell', () => {
    const save = createSave()
    save.gold = 10
    save.bank.weapon = 2
    expect(sellAllGoods(save).ok).toBe(false)
    expect(save.gold).toBe(10)
    expect(save.bank.weapon).toBe(2)
  })

  it('still sells a single ironWeapon from the item row', () => {
    const save = createSave()
    save.gold = 0
    save.bank.ironWeapon = 1
    expect(sellFromBank(save, 'ironWeapon', 1).ok).toBe(true)
    expect(save.gold).toBe(18)
  })

  it('batch-sells stew with the food pile', () => {
    const save = createSave()
    save.gold = 0
    save.bank.stew = 1
    save.bank.ironTool = 1
    expect(sellAllGoods(save).ok).toBe(true)
    expect(save.gold).toBe(14 + 18)
  })

  it('sells a single ore for its table price', () => {
    const save = createSave()
    save.gold = 0
    save.bank.ore = 1
    expect(sellFromBank(save, 'ore', 1).ok).toBe(true)
    expect(save.gold).toBe(3)
  })
})

describe('item stock', () => {
  it('adds past the old per-item caps without stalling', () => {
    const save = createSave()
    save.bank.ore = 200
    expect(addToBank(save, 'ore', 50).ok).toBe(true)
    expect(itemQty(save, 'ore')).toBe(250)
  })

  it('reads qty from bank or items and ignores capacity', () => {
    expect(hydrateBank({ ore: 250, wood: 3, capacity: 200 })).toEqual({ ore: 250, wood: 3 })
    expect(hydrateBank({ ore: -2, fish: 0, meal: 4.8 })).toEqual({ meal: 4 })
    expect(hydrateBank(null)).toEqual({})
  })
})
