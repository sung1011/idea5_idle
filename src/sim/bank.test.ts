import { describe, expect, it } from 'vitest'
import { sellAllGoods, sellFromBank } from './bank'
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

  it('sells a single ore for its table price', () => {
    const save = createSave()
    save.gold = 0
    save.bank.ore = 1
    expect(sellFromBank(save, 'ore', 1).ok).toBe(true)
    expect(save.gold).toBe(3)
  })
})
