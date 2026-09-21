import { afterEach, describe, expect, it } from 'vitest'
import { potionEffectValue, potionEffects } from './alchemy'
import { assignWorker } from './assign'
import { bankQty } from './bank'
import { createSave } from './createSave'
import { loadFood } from './food'
import { collectHints, currentSpeed, stationBottleneckText } from './query'
import { recruitWorker } from './recruit'
import { setRollOverride } from './rng'
import { EFFECT_ID, PLAYABLE_STATION_IDS, POTION_BATCH_RANGE, POTION_ITEM_IDS, SELLABLE_GOODS, STATION_DEF } from './tables'
import { ticks } from './tick'
import { workerEffectValue } from './tools'
import type { ItemId, PotionItemId, Save } from './types'

function roster(n: number): Save {
  const save = createSave()
  save.diamonds = 15 * n
  for (let i = 0; i < n; i++) expect(recruitWorker(save).ok).toBe(true)
  return save
}

function craftedPotion(save: Save): { id: PotionItemId; qty: number } | null {
  for (const id of POTION_ITEM_IDS) {
    const qty = bankQty(save, id)
    if (qty > 0) return { id, qty }
  }
  return null
}

afterEach(() => {
  setRollOverride(null)
})

describe('alchemy random potion batches', () => {
  it('consumes herb or a hunting byproduct and deposits a random potion batch', () => {
    const cases: Array<{ itemId: ItemId; label: string }> = [
      { itemId: 'herb', label: '草' },
      { itemId: 'blood', label: '血' },
      { itemId: 'tooth', label: '牙' },
      { itemId: 'eye', label: '眼' },
    ]
    for (const row of cases) {
      setRollOverride(() => 0)
      const save = roster(1)
      save.bank[row.itemId] = 1
      assignWorker(save, save.workers[0].id, 'alchemy')
      const next = ticks(save, 40)
      expect(bankQty(next, row.itemId)).toBe(0)
      expect(bankQty(next, 'potion')).toBe(0)
      expect(bankQty(next, 'stim')).toBe(POTION_BATCH_RANGE.stim.min)
      expect(next.stations.alchemy.completed).toBe(1)
      expect(next.stations.alchemy.craftNotice).toBe(
        `炼成兴奋剂×${POTION_BATCH_RANGE.stim.min}（耗${row.label}）`,
      )
    }
  })

  it('prefers herb when several alchemy inputs are in stock', () => {
    setRollOverride(() => 0)
    const save = roster(1)
    save.bank.herb = 1
    save.bank.blood = 1
    assignWorker(save, save.workers[0].id, 'alchemy')
    const next = ticks(save, 40)
    expect(bankQty(next, 'herb')).toBe(0)
    expect(bankQty(next, 'blood')).toBe(1)
    expect(craftedPotion(next)?.id).toBe('stim')
  })

  it('idles with a bottleneck naming herb and hunting parts', () => {
    const save = roster(1)
    assignWorker(save, save.workers[0].id, 'alchemy')
    const next = ticks(save, 40)
    expect(craftedPotion(next)).toBeNull()
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

  it('keeps potion effectId empty so factory speed still comes from stim buff only', () => {
    const save = roster(1)
    save.bank.stim = 3
    assignWorker(save, save.workers[0].id, 'mining')
    expect(potionEffects('stim')).toEqual([])
    expect(potionEffectValue('stim', EFFECT_ID.prodSpeed)).toBe(0)
    expect(potionEffectValue('stim', EFFECT_ID.extraOutput)).toBe(0)
    expect(potionEffectValue('stim', EFFECT_ID.cycleShorten)).toBe(0)
    expect(loadFood(save, save.workers[0].id, 'stim', 1).ok).toBe(false)
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
