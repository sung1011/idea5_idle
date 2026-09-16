import { describe, expect, it } from 'vitest'
import { createSave } from './createSave'
import { leftoverStockRows, stationStockRows } from './query'

describe('station stock rows', () => {
  it('reads bank qty next to forging costs and outputs', () => {
    const save = createSave()
    save.bank.ore = 4
    save.bank.tool = 2
    save.bank.blueprint = 1
    const rows = stationStockRows(save, 'forging')
    expect(rows.costs.map((r) => r.itemId)).toEqual(['ore', 'slag', 'ironOre', 'mithrilOre'])
    expect(rows.outputs.map((r) => r.itemId)).toEqual(['tool', 'ironTool', 'mithrilTool', 'blueprint'])
    expect(rows.costs.find((r) => r.itemId === 'ore')).toMatchObject({
      label: '铜矿',
      qty: 4,
      role: 'cost',
      current: true,
    })
    expect(rows.costs.find((r) => r.itemId === 'ironOre')).toMatchObject({
      qty: 0,
      current: false,
    })
    expect(rows.outputs.find((r) => r.itemId === 'tool')).toMatchObject({
      label: '初级工具',
      qty: 2,
      role: 'output',
      current: true,
    })
    expect(rows.outputs.find((r) => r.itemId === 'blueprint')).toMatchObject({
      qty: 1,
      current: true,
    })
  })

  it('marks alchemy alternatives and fishing junk as current stock', () => {
    const save = createSave()
    save.bank.herb = 3
    save.bank.blood = 1
    save.bank.fish = 5
    save.bank.junk = 2
    const alchemy = stationStockRows(save, 'alchemy')
    expect(alchemy.costs.map((r) => [r.itemId, r.qty, r.current])).toEqual([
      ['herb', 3, true],
      ['blood', 1, true],
      ['tooth', 0, true],
      ['eye', 0, true],
    ])
    expect(alchemy.outputs).toEqual([
      { itemId: 'potion', label: '药剂', qty: 0, role: 'output', current: true },
    ])
    const fishing = stationStockRows(save, 'fishing')
    expect(fishing.outputs).toEqual([
      { itemId: 'fish', label: '鱼', qty: 5, role: 'output', current: true },
      { itemId: 'junk', label: '杂物', qty: 2, role: 'output', current: true },
    ])
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
