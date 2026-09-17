import { describe, expect, it } from 'vitest'
import { bankQty } from './bank'
import { createSave } from './createSave'
import {
  GM_BASIC_ITEMS,
  GM_BASIC_ITEM_QTY,
  GM_DIAMOND_GRANT,
  GM_GOLD_GRANT,
  GM_WORKER_GRANT,
  gmAddDiamonds,
  gmAddGold,
  gmAddWorkers,
  gmFillBankBasics,
  gmMaxStations,
  gmResetSave,
} from './gm'
import { START_DIAMONDS, START_GOLD } from './tables'

describe('gm debug grants', () => {
  it('resets to a fresh createSave', () => {
    const dirty = createSave()
    dirty.gold = 999
    dirty.diamonds = 40
    dirty.workers.push({ id: 'w-x', assignment: 'mining', qualityTier: 1, foodSlot: null })
    dirty.stations.mining.stationLevel = 7
    const next = gmResetSave()
    expect(next).not.toBe(dirty)
    expect(next.gold).toBe(START_GOLD)
    expect(next.diamonds).toBe(START_DIAMONDS)
    expect(next.workers).toEqual([])
    expect(next.stations.mining.stationLevel).toBe(1)
    expect(next.stations.mining.unlockedCategories).toEqual(['copper'])
  })

  it('adds 10000 gold', () => {
    const save = createSave()
    const before = save.gold
    expect(gmAddGold(save).ok).toBe(true)
    expect(save.gold).toBe(before + GM_GOLD_GRANT)
    expect(save.gold).toBe(before + 10000)
  })

  it('adds 10000 diamonds and fills a missing field', () => {
    const save = createSave()
    expect(gmAddDiamonds(save).ok).toBe(true)
    expect(save.diamonds).toBe(GM_DIAMOND_GRANT)

    const legacy = createSave()
    delete (legacy as { diamonds?: number }).diamonds
    expect(gmAddDiamonds(legacy).ok).toBe(true)
    expect(legacy.diamonds).toBe(10000)
  })

  it('spawns 5 workers without spending gold', () => {
    const save = createSave()
    const gold = save.gold
    expect(gmAddWorkers(save).ok).toBe(true)
    expect(save.workers).toHaveLength(GM_WORKER_GRANT)
    expect(save.gold).toBe(gold)
    expect(save.workers.every((w) => w.assignment === null)).toBe(true)
  })

  it('sets every station to Lv10 and unlocks all categories', () => {
    const save = createSave()
    expect(gmMaxStations(save).ok).toBe(true)
    expect(save.stations.mining.stationLevel).toBe(10)
    expect(save.stations.forging.stationLevel).toBe(10)
    expect(save.stations.fishing.stationLevel).toBe(10)
    expect(save.stations.mining.unlockedCategories).toEqual(['copper', 'iron', 'mithril'])
    expect(save.stations.forging.unlockedCategories).toEqual(['copper', 'iron', 'mithril'])
    expect(save.stations.fishing.unlockedCategories).toEqual(['copper', 'iron', 'mithril'])
    expect(save.stations.hunting.unlockedCategories).toEqual(['copper', 'iron', 'mithril'])
  })

  it('grants a generous pile of basic supplies', () => {
    const save = createSave()
    expect(gmFillBankBasics(save).ok).toBe(true)
    for (const id of GM_BASIC_ITEMS) expect(bankQty(save, id)).toBe(GM_BASIC_ITEM_QTY)
    expect(bankQty(save, 'weapon')).toBe(0)
  })
})
