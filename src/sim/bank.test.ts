import { describe, expect, it } from 'vitest'
import { addToBank, hydrateBank, itemQty, sellAllGoods, sellFromBank } from './bank'
import { createSave } from './createSave'

describe('sell goods', () => {
  it('turns weapons and meals into gold', () => {
    const save = createSave()
    save.gold = 0
    save.bank.weapon = 2
    save.bank.meal = 1
    const result = sellAllGoods(save)
    expect(result.ok).toBe(true)
    expect(save.bank.weapon ?? 0).toBe(0)
    expect(save.bank.meal ?? 0).toBe(0)
    expect(save.gold).toBe(12 * 2 + 8)
  })

  it('fails when there is nothing to sell', () => {
    const save = createSave()
    save.gold = 10
    expect(sellAllGoods(save).ok).toBe(false)
    expect(save.gold).toBe(10)
  })

  it('sells a single ironWeapon for its table price', () => {
    const save = createSave()
    save.gold = 0
    save.bank.ironWeapon = 1
    expect(sellFromBank(save, 'ironWeapon', 1).ok).toBe(true)
    expect(save.gold).toBe(18)
  })

  it('batch-sells higher-tier weapons with the goods pile', () => {
    const save = createSave()
    save.gold = 0
    save.bank.ironWeapon = 1
    save.bank.mithrilWeapon = 1
    expect(sellAllGoods(save).ok).toBe(true)
    expect(save.gold).toBe(18 + 28)
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
