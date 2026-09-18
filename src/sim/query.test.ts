import { describe, expect, it } from 'vitest'
import { createSave } from './createSave'
import { leftoverStockRows, stationConsumeGroups, stationStockRows } from './query'
import { grantStationXp, selectStationCategory } from './stationProgress'
import { xpToNextLevel } from './tables'
import { selectForgeOutput } from './tools'

describe('station stock rows', () => {
  it('lists only the selected forging recipe costs, not all station outputs', () => {
    const save = createSave()
    save.bank.ore = 4
    save.bank.slag = 2
    save.bank.ironOre = 3
    save.bank.tool = 2
    expect(selectForgeOutput(save, 'miningTool01').ok).toBe(true)
    const rows = stationStockRows(save, 'forging')
    expect(rows.costs.map((r) => r.itemId)).toEqual(['ore', 'slag'])
    expect(rows.costs.find((r) => r.itemId === 'ore')).toMatchObject({
      label: '铜矿',
      qty: 4,
    })
    expect(rows).not.toHaveProperty('outputs')

    save.stations.forging.stationLevel = 6
    expect(selectForgeOutput(save, 'miningTool06').ok).toBe(true)
    expect(stationStockRows(save, 'forging').costs.map((r) => r.itemId)).toEqual(['ironOre'])
    expect(stationStockRows(save, 'forging').costs[0]).toMatchObject({ label: '铁矿', qty: 3 })
  })

  it('shows alchemy current consume only and hides gather consume stock', () => {
    const save = createSave()
    save.bank.herb = 3
    save.bank.blood = 1
    expect(stationStockRows(save, 'alchemy').costs).toEqual([{ itemId: 'herb', label: '草', qty: 3 }])
    save.bank.herb = 0
    expect(stationStockRows(save, 'alchemy').costs).toEqual([{ itemId: 'blood', label: '血', qty: 1 }])
    save.bank.blood = 0
    expect(stationStockRows(save, 'alchemy').costs).toEqual([])
    expect(stationStockRows(save, 'mining').costs).toEqual([])
    expect(stationStockRows(save, 'fishing').costs).toEqual([])
    expect(stationStockRows(save, 'hunting').costs).toEqual([])
    expect(stationStockRows(save, 'herbalism').costs).toEqual([])
  })

  it('lists stew costs plus altCosts for the selected cooking recipe', () => {
    const save = createSave()
    save.bank.fish = 2
    save.bank.meat = 1
    save.bank.spice = 4
    expect(stationStockRows(save, 'cooking').costs.map((r) => r.itemId)).toEqual(['fish'])
    while (save.stations.cooking.stationLevel < 5) {
      grantStationXp(save, 'cooking', xpToNextLevel(save.stations.cooking.stationLevel))
    }
    expect(selectStationCategory(save, 'cooking', 'mithril').ok).toBe(true)
    expect(stationStockRows(save, 'cooking').costs).toEqual([
      { itemId: 'meat', label: '肉', qty: 1 },
      { itemId: 'spice', label: '香料', qty: 4 },
      { itemId: 'fish', label: '鱼', qty: 2 },
    ])
  })

  it('lists consume groups with need / have and shortage flags', () => {
    const save = createSave()
    save.bank.ore = 0
    save.bank.slag = 2
    expect(selectForgeOutput(save, 'miningTool01').ok).toBe(true)
    expect(stationConsumeGroups(save, 'forging')).toEqual([
      [{ itemId: 'ore', label: '铜矿', need: 1, have: 0, short: true }],
      [{ itemId: 'slag', label: '渣滓', need: 1, have: 2, short: false }],
    ])
    expect(stationConsumeGroups(save, 'mining')).toEqual([])
    save.bank.herb = 0
    save.bank.blood = 0
    save.bank.tooth = 0
    save.bank.eye = 1
    const alchemy = stationConsumeGroups(save, 'alchemy')
    expect(alchemy.map((group) => group[0].itemId)).toEqual(['herb', 'blood', 'tooth', 'eye'])
    expect(alchemy[0][0]).toMatchObject({ have: 0, short: true })
    expect(alchemy[3][0]).toMatchObject({ label: '眼', have: 1, short: false })
  })

  it('only lists leftover wood or shelved weapons when they have qty', () => {
    const save = createSave()
    expect(leftoverStockRows(save)).toEqual([])
    save.bank.wood = 3
    save.bank.weapon = 1
    save.bank.ore = 9
    expect(leftoverStockRows(save)).toEqual([
      { itemId: 'wood', label: '木头', qty: 3 },
      { itemId: 'weapon', label: '铜器', qty: 1 },
    ])
  })
})
