import { describe, expect, it } from 'vitest'
import { BANK_WARN_RATIO, bankCap, bankFillPct, bankFillTone, sellAllGoods, sellFromBank } from './bank'
import { createSave } from './createSave'
import { ITEM_DEF } from './tables'

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

describe('bank fill bars', () => {
  it('uses the per-item cap and flags warn / full', () => {
    const save = createSave()
    const cap = bankCap('ore')
    expect(cap).toBe(ITEM_DEF.ore.cap)
    expect(BANK_WARN_RATIO).toBe(0.8)

    save.bank.ore = 0
    expect(bankFillTone(save, 'ore')).toBe('ok')
    expect(bankFillPct(save, 'ore')).toBe(0)

    save.bank.ore = Math.ceil(cap * BANK_WARN_RATIO)
    expect(save.bank.ore).toBe(16)
    expect(bankFillTone(save, 'ore')).toBe('warn')
    expect(bankFillPct(save, 'ore')).toBe(80)

    save.bank.ore = cap
    expect(bankFillTone(save, 'ore')).toBe('full')
    expect(bankFillPct(save, 'ore')).toBe(100)
  })
})
