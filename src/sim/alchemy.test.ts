import { describe, expect, it } from 'vitest'
import { potionEffectValue, potionEffects } from './alchemy'
import { assignWorker } from './assign'
import { bankQty } from './bank'
import { createSave } from './createSave'
import { loadFood } from './food'
import { collectHints, currentSpeed, stationBottleneckText } from './query'
import { recruitWorker } from './recruit'
import { EFFECT_ID, PLAYABLE_STATION_IDS, SELLABLE_GOODS, STATION_DEF } from './tables'
import { ticks } from './tick'
import { workerEffectValue } from './tools'
import type { ItemId, Save } from './types'

function roster(n: number): Save {
  const save = createSave()
  save.gold = 15 * n
  for (let i = 0; i < n; i++) expect(recruitWorker(save).ok).toBe(true)
  return save
}

describe('alchemy placeholder', () => {
  it('consumes herb or a hunting byproduct and deposits a potion', () => {
    const cases: Array<{ itemId: ItemId; label: string }> = [
      { itemId: 'herb', label: '草' },
      { itemId: 'blood', label: '血' },
      { itemId: 'tooth', label: '牙' },
      { itemId: 'eye', label: '眼' },
    ]
    for (const row of cases) {
      const save = roster(1)
      save.bank[row.itemId] = 1
      assignWorker(save, save.workers[0].id, 'alchemy')
      const next = ticks(save, 40)
      expect(bankQty(next, row.itemId)).toBe(0)
      expect(bankQty(next, 'potion')).toBe(1)
      expect(next.stations.alchemy.completed).toBe(1)
      expect(next.stations.alchemy.craftNotice).toBe(`炼成药剂（耗${row.label}）`)
    }
  })

  it('prefers herb when several alchemy inputs are in stock', () => {
    const save = roster(1)
    save.bank.herb = 1
    save.bank.blood = 1
    assignWorker(save, save.workers[0].id, 'alchemy')
    const next = ticks(save, 40)
    expect(bankQty(next, 'herb')).toBe(0)
    expect(bankQty(next, 'blood')).toBe(1)
    expect(bankQty(next, 'potion')).toBe(1)
  })

  it('idles with a bottleneck naming herb and hunting parts', () => {
    const save = roster(1)
    assignWorker(save, save.workers[0].id, 'alchemy')
    const next = ticks(save, 40)
    expect(bankQty(next, 'potion')).toBe(0)
    expect(next.stations.alchemy.completed).toBe(0)
    expect(next.stations.alchemy.stallReason).toBe('emptyInput')
    const text = stationBottleneckText(next, 'alchemy')
    expect(text).toContain('草')
    expect(text).toContain('血')
    expect(text).toContain('牙')
    expect(text).toContain('眼')
    expect(text).toContain('炼金空转')
    expect(collectHints(next).some((h) => h.kind === 'bottleneck' && h.text.includes('炼金'))).toBe(true)
  })

  it('keeps potion effects empty so crafted potions do not apply', () => {
    const save = roster(1)
    save.bank.potion = 3
    assignWorker(save, save.workers[0].id, 'mining')
    expect(potionEffects('potion')).toEqual([])
    expect(potionEffectValue('potion', EFFECT_ID.prodSpeed)).toBe(0)
    expect(potionEffectValue('potion', EFFECT_ID.extraOutput)).toBe(0)
    expect(potionEffectValue('potion', EFFECT_ID.cycleShorten)).toBe(0)
    expect(loadFood(save, save.workers[0].id, 'potion', 1).ok).toBe(false)
    const bare = currentSpeed(save, 'mining')
    const withPotion = workerEffectValue(save, save.workers[0], 'mining', EFFECT_ID.prodSpeed)
    expect(withPotion).toBe(0)
    expect(currentSpeed(save, 'mining')).toBe(bare)
  })

  it('stays on the main board without resonance neighbors', () => {
    expect(PLAYABLE_STATION_IDS).toContain('alchemy')
    expect(STATION_DEF.alchemy.neighbors).toEqual([])
    expect(STATION_DEF.herbalism.neighbors).toEqual([])
    expect((STATION_DEF as Record<string, unknown>).leatherworking).toBeUndefined()
    expect(SELLABLE_GOODS).not.toContain('weapon')
    expect(SELLABLE_GOODS).toEqual(['tool', 'ironTool', 'mithrilTool', 'meal', 'roast', 'stew'])
  })
})
