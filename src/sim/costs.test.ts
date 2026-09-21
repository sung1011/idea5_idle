import { afterEach, describe, expect, it } from 'vitest'
import { assignWorker } from './assign'
import { bankQty } from './bank'
import { canAffordCosts, missingCostLabels, needHaveQty, resolveNeedPayItem, takeCosts } from './costs'
import { createSave } from './createSave'
import { collectHints } from './query'
import { recruitWorker } from './recruit'
import { setRollOverride } from './rng'
import { completeCycle } from './stations'
import { ticks } from './tick'
import type { Save } from './types'

afterEach(() => {
  setRollOverride(null)
})

function roster(n: number): Save {
  const save = createSave()
  save.diamonds = 15 * n
  for (let i = 0; i < n; i++) {
    expect(recruitWorker(save).ok).toBe(true)
  }
  return save
}

describe('takeCosts', () => {
  it('consumes one kind, qty 1', () => {
    const save = createSave()
    save.bank.ore = 3
    expect(takeCosts(save, [{ itemId: 'ore', qty: 1 }]).ok).toBe(true)
    expect(bankQty(save, 'ore')).toBe(2)
  })

  it('consumes n of the same item', () => {
    const save = createSave()
    save.bank.ore = 5
    expect(takeCosts(save, [{ itemId: 'ore', qty: 3 }]).ok).toBe(true)
    expect(bankQty(save, 'ore')).toBe(2)
  })

  it('consumes multiple items at once', () => {
    const save = createSave()
    save.bank.ore = 4
    save.bank.wood = 3
    expect(
      takeCosts(save, [
        { itemId: 'ore', qty: 2 },
        { itemId: 'wood', qty: 1 },
      ]).ok,
    ).toBe(true)
    expect(bankQty(save, 'ore')).toBe(2)
    expect(bankQty(save, 'wood')).toBe(2)
  })

  it('does not deduct anything when any cost is missing', () => {
    const save = createSave()
    save.bank.ore = 5
    save.bank.wood = 0
    const result = takeCosts(save, [
      { itemId: 'ore', qty: 1 },
      { itemId: 'wood', qty: 1 },
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('木头')
    expect(bankQty(save, 'ore')).toBe(5)
    expect(bankQty(save, 'wood')).toBe(0)
  })

  it('does not deduct when n of the same item is short', () => {
    const save = createSave()
    save.bank.ore = 2
    expect(takeCosts(save, [{ itemId: 'ore', qty: 3 }]).ok).toBe(false)
    expect(bankQty(save, 'ore')).toBe(2)
    expect(canAffordCosts(save, [{ itemId: 'ore', qty: 3 }])).toBe(false)
    expect(missingCostLabels(save, [{ itemId: 'ore', qty: 3 }])).toEqual(['铜矿'])
  })

  it('deducts the merged total when the same item appears twice', () => {
    const save = createSave()
    save.bank.ore = 5
    expect(
      takeCosts(save, [
        { itemId: 'ore', qty: 1 },
        { itemId: 'ore', qty: 2 },
      ]).ok,
    ).toBe(true)
    expect(bankQty(save, 'ore')).toBe(2)
  })

  it('pays anyPotion / anyRune with the unlocked SKU that has the most stock', () => {
    const save = createSave()
    save.bank.stim = 2
    save.bank.salve = 5
    save.bank.renewSoup = 5
    save.bank.runeSharp = 1
    save.bank.runeArmor = 4
    save.bank.runeBlood = 4
    expect(resolveNeedPayItem(save, 'anyPotion')).toBe('salve')
    expect(needHaveQty(save, 'anyPotion')).toBe(5)
    expect(resolveNeedPayItem(save, 'anyRune')).toBe('runeArmor')
    expect(needHaveQty(save, 'anyRune')).toBe(4)
    expect(takeCosts(save, [{ itemId: 'anyPotion', qty: 3 }]).ok).toBe(true)
    expect(bankQty(save, 'salve')).toBe(2)
    expect(bankQty(save, 'stim')).toBe(2)
    expect(takeCosts(save, [{ itemId: 'anyRune', qty: 2 }]).ok).toBe(true)
    expect(bankQty(save, 'runeArmor')).toBe(2)
    expect(bankQty(save, 'runeBlood')).toBe(4)
    save.bank.stim = 1
    save.bank.salve = 1
    save.bank.renewSoup = 1
    expect(canAffordCosts(save, [{ itemId: 'anyPotion', qty: 3 }])).toBe(false)
    expect(missingCostLabels(save, [{ itemId: 'anyPotion', qty: 3 }])).toEqual(['任意药剂'])
  })
})

describe('inscription costs table', () => {
  it('spends wildCrystal and deposits a rune', () => {
    setRollOverride(() => 0.99)
    const save = roster(1)
    save.bank.wildCrystal = 2
    assignWorker(save, save.workers[0].id, 'inscription')
    expect(completeCycle(save, 'inscription')).toBe(true)
    expect(bankQty(save, 'wildCrystal')).toBe(0)
    expect(
      bankQty(save, 'runeSharp') +
        bankQty(save, 'runeArmor') +
        bankQty(save, 'runeBlood') +
        bankQty(save, 'runeBreak') +
        bankQty(save, 'runeSwift') +
        bankQty(save, 'runeInsight'),
    ).toBeGreaterThanOrEqual(1)
    expect(bankQty(save, 'miningTool01')).toBe(0)
    expect(bankQty(save, 'tool')).toBe(0)
  })

  it('idles without deducting leftover wood when wildCrystal is missing', () => {
    const save = roster(1)
    save.bank.wildCrystal = 0
    save.bank.wood = 2
    assignWorker(save, save.workers[0].id, 'inscription')
    const next = ticks(save, 32)
    expect(bankQty(next, 'wildCrystal')).toBe(0)
    expect(bankQty(next, 'wood')).toBe(2)
    expect(next.stations.inscription.completed).toBe(0)
    expect(next.stations.inscription.stallReason).toBe('emptyInput')
    expect(collectHints(next).some((h) => h.text.includes('荒晶') && h.text.includes('见底'))).toBe(true)
  })

  it('higher-level recipes still only spend wildCrystal', () => {
    setRollOverride(() => 0.99)
    const save = roster(1)
    save.stations.inscription.stationLevel = 11
    save.bank.wildCrystal = 4
    save.bank.wood = 2
    save.bank.mithrilOre = 1
    assignWorker(save, save.workers[0].id, 'inscription')
    expect(completeCycle(save, 'inscription')).toBe(true)
    expect(bankQty(save, 'wildCrystal')).toBeLessThan(4)
    expect(bankQty(save, 'wood')).toBe(2)
    expect(bankQty(save, 'mithrilOre')).toBe(1)
    expect(save.stations.inscription.completed).toBe(1)
  })
})
