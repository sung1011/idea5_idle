import { describe, expect, it } from 'vitest'
import { assignWorker } from './assign'
import { bankQty } from './bank'
import { canAffordCosts, missingCostLabels, takeCosts } from './costs'
import { createSave } from './createSave'
import { collectHints } from './query'
import { recruitWorker } from './recruit'
import { grantStationXp, selectStationCategory } from './stationProgress'
import { completeCycle } from './stations'
import { xpToNextLevel } from './tables'
import { ticks } from './tick'
import type { Save } from './types'

function roster(n: number): Save {
  const save = createSave()
  save.gold = 15 * n
  for (let i = 0; i < n; i++) {
    expect(recruitWorker(save).ok).toBe(true)
  }
  return save
}

function unlockTo(save: Save, stationId: 'forging', level: number) {
  const station = save.stations[stationId]
  while (station.stationLevel < level) {
    grantStationXp(save, stationId, xpToNextLevel(station.stationLevel))
  }
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
})

describe('forging costs table', () => {
  it('copper forging still spends 1 ore', () => {
    const save = roster(1)
    save.bank.ore = 1
    assignWorker(save, save.workers[0].id, 'forging')
    expect(completeCycle(save, 'forging')).toBe(true)
    expect(bankQty(save, 'ore')).toBe(0)
    expect(bankQty(save, 'weapon')).toBe(1)
  })

  it('iron forging spends ironOre + wood; missing wood deducts nothing', () => {
    const save = roster(1)
    unlockTo(save, 'forging', 5)
    expect(selectStationCategory(save, 'forging', 'iron').ok).toBe(true)
    save.bank.ironOre = 2
    save.bank.wood = 0
    assignWorker(save, save.workers[0].id, 'forging')
    const next = ticks(save, 9)
    expect(bankQty(next, 'ironOre')).toBe(2)
    expect(bankQty(next, 'wood')).toBe(0)
    expect(bankQty(next, 'ironWeapon')).toBe(0)
    expect(next.stations.forging.completed).toBe(0)
    expect(next.stations.forging.stallReason).toBe('emptyInput')
    expect(collectHints(next).some((h) => h.text.includes('木头') && h.text.includes('见底'))).toBe(true)
  })

  it('iron forging deducts both costs when enough', () => {
    const save = roster(1)
    unlockTo(save, 'forging', 5)
    expect(selectStationCategory(save, 'forging', 'iron').ok).toBe(true)
    save.bank.ironOre = 1
    save.bank.wood = 2
    save.bank.ore = 4
    assignWorker(save, save.workers[0].id, 'forging')
    const next = ticks(save, 9)
    expect(bankQty(next, 'ironOre')).toBe(0)
    expect(bankQty(next, 'wood')).toBe(1)
    expect(bankQty(next, 'ore')).toBe(4)
    expect(bankQty(next, 'ironWeapon')).toBe(1)
    expect(next.stations.forging.completed).toBe(1)
  })

  it('mithril forging spends 1 mithrilOre and 2 wood', () => {
    const save = roster(1)
    unlockTo(save, 'forging', 10)
    expect(selectStationCategory(save, 'forging', 'mithril').ok).toBe(true)
    save.bank.mithrilOre = 1
    save.bank.wood = 2
    assignWorker(save, save.workers[0].id, 'forging')
    expect(completeCycle(save, 'forging')).toBe(true)
    expect(bankQty(save, 'mithrilOre')).toBe(0)
    expect(bankQty(save, 'wood')).toBe(0)
    expect(bankQty(save, 'mithrilWeapon')).toBe(1)
  })
})
