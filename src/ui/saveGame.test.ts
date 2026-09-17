import { describe, expect, it } from 'vitest'
import { createSave } from '../sim/createSave'
import { hydrateLoadedSave, loadSave, persistSave, SAVE_KEY } from './saveGame'

function memory(): Storage {
  const bag = new Map<string, string>()
  return {
    get length() {
      return bag.size
    },
    clear() {
      bag.clear()
    },
    getItem(key: string) {
      return bag.has(key) ? bag.get(key)! : null
    },
    key(index: number) {
      return [...bag.keys()][index] ?? null
    },
    removeItem(key: string) {
      bag.delete(key)
    },
    setItem(key: string, value: string) {
      bag.set(key, value)
    },
  }
}

describe('save migration', () => {
  it('keeps bank qty and drops capacity', () => {
    const raw = {
      ...createSave(),
      bank: { ore: 250, wood: 10 },
      capacity: { ore: 200, total: 1000 },
      stations: {
        ...createSave().stations,
        mining: { ...createSave().stations.mining, stallReason: 'fullOutput' as never },
      },
    }
    const save = hydrateLoadedSave(raw)
    expect(save?.bank.ore).toBe(250)
    expect(save?.bank.wood).toBe(10)
    expect((save as { capacity?: unknown } | null)?.capacity).toBeUndefined()
    expect(save?.stations.mining.stallReason).toBeNull()
  })

  it('reads items when bank is missing', () => {
    const raw = {
      ...createSave(),
      bank: undefined,
      items: { fish: 7, meal: 2 },
    }
    const save = hydrateLoadedSave(raw)
    expect(save?.bank.fish).toBe(7)
    expect(save?.bank.meal).toBe(2)
  })

  it('round-trips qty through persist / load', () => {
    const store = memory()
    const save = createSave()
    save.bank.ore = 333
    persistSave(save, store)
    expect(store.getItem(SAVE_KEY)).toContain('"ore":333')
    const loaded = loadSave(store)
    expect(loaded?.bank.ore).toBe(333)
  })

  it('fills missing worker slots and rests woodcutters', () => {
    const raw = {
      ...createSave(),
      workers: [
        { id: 'w-1', name: '旧木', assignment: 'woodcutting' },
        { id: 'w-2', assignment: 'smithing', toolId: 'tool', foodItemId: 'meal', foodCount: 2, prodBuff: { effectId: 'prodSpeed', mul: 1.2, durationS: 60 } },
      ],
      stations: {
        mining: { progress: 0.2, stallReason: null, completed: 1, resonanceStreak: 0 },
        woodcutting: { progress: 0.8, stallReason: null, completed: 9, resonanceStreak: 0 },
      },
    }
    const save = hydrateLoadedSave(raw)
    expect(save?.workers).toHaveLength(2)
    expect(save?.workers[0].assignment).toBeNull()
    expect(save?.workers[0].foodSlot).toBeNull()
    expect(save?.workers[0].qualityTier).toBe(1)
    expect(save?.workers[0].hp).toBe(save?.workers[0].hpMax)
    expect(save?.workers[1].qualityTier).toBe(1)
    expect(save?.workers[1].assignment).toBe('forging')
    expect(save?.workers[1].foodSlot?.itemId).toBe('meal')
    expect(save?.stations.mining.toolSlot?.itemId).toBe('tool')
    expect(save?.stations.mining.toolSlot?.matchStationId).toBe('mining')
    expect(save?.workers[1].foodSlot?.buff.mul).toBe(1.2)
    expect(save?.workers[1].foodSlot?.qty).toBe(2)
    expect(save?.stations.hunting).toBeTruthy()
    expect(save?.stations.herbalism).toBeTruthy()
    expect(save?.stations.alchemy).toBeTruthy()
    expect((save?.stations as { woodcutting?: unknown } | undefined)?.woodcutting).toBeUndefined()
    expect(save?.stations.mining.miningNode?.nodeHp).toBe(20)
    expect(save?.rngState).toBe(raw.rngState)
    expect(save?.forgedTools).toEqual([])
    expect(save?.stations.forging.selectedToolType).toBe('pick')
    expect(save?.stations.fishing.selectedCategory).toBe('copper')
    expect(save?.stations.hunting.selectedCategory).toBe('copper')
    expect(save?.workerQualityRev).toBe(2)
    expect(save?.knightLevel).toBe(1)
    expect(save?.techPoints).toBe(1)
    expect(save?.unlockedTechIds).toEqual([])
  })

  it('migrates old gray-table quality tiers once and stamps the new rev', () => {
    const raw = {
      ...createSave(),
      workerQualityRev: undefined,
      workers: [
        { id: 'w-1', qualityTier: 1, assignment: null, foodSlot: null },
        { id: 'w-2', qualityTier: 2, assignment: null, foodSlot: null },
        { id: 'w-3', qualityTier: 7, assignment: null, foodSlot: null },
        { id: 'w-4', qualityTier: 8, assignment: null, foodSlot: null },
      ],
    }
    delete (raw as { workerQualityRev?: number }).workerQualityRev
    const save = hydrateLoadedSave(raw)
    expect(save?.workers.map((w) => w.qualityTier)).toEqual([1, 1, 6, 8])
    expect(save?.workerQualityRev).toBe(2)

    const again = hydrateLoadedSave(save)
    expect(again?.workers.map((w) => w.qualityTier)).toEqual([1, 1, 6, 8])
    expect(again?.workerQualityRev).toBe(2)
  })

  it('does not remap already-new quality tiers', () => {
    const raw = {
      ...createSave(),
      workerQualityRev: 2,
      workers: [
        { id: 'w-1', qualityTier: 2, assignment: null, foodSlot: null },
        { id: 'w-2', qualityTier: 7, assignment: null, foodSlot: null },
      ],
    }
    const save = hydrateLoadedSave(raw)
    expect(save?.workers.map((w) => w.qualityTier)).toEqual([2, 7])
    expect(save?.workerQualityRev).toBe(2)
  })

  it('moves worker tools onto the matching station and rests overflow assignees', () => {
    const raw = {
      ...createSave(),
      workers: [
        { id: 'w-1', assignment: 'mining', toolSlot: { itemId: 'tool', matchStationId: 'mining', affixes: [], effects: [] } },
        { id: 'w-2', assignment: 'mining', toolSlot: { itemId: 'ironTool', matchStationId: 'mining', affixes: [], effects: [] } },
        { id: 'w-3', assignment: 'mining' },
      ],
    }
    const save = hydrateLoadedSave(raw)
    expect(save?.stations.mining.toolSlot?.itemId).toBe('tool')
    expect(save?.bank.ironTool).toBe(1)
    expect(save?.workers.map((w) => w.assignment)).toEqual(['mining', 'mining', null])
    expect(save?.workers.every((w) => !('toolSlot' in w) || (w as { toolSlot?: unknown }).toolSlot == null)).toBe(true)
  })

  it('keeps a station toolSlot through persist / load', () => {
    const store = memory()
    const save = createSave()
    save.stations.cooking.toolSlot = {
      itemId: 'tool',
      matchStationId: 'cooking',
      affixes: [],
      effects: [{ effectId: 'prodSpeed', value: 1.25, source: 'tool' }],
    }
    persistSave(save, store)
    const loaded = loadSave(store)
    expect(loaded?.stations.cooking.toolSlot?.itemId).toBe('tool')
    expect(loaded?.stations.cooking.toolSlot?.matchStationId).toBe('cooking')
  })

  it('hydrates missing tech fields and keeps known old ids without granting slot majors', () => {
    const raw = {
      ...createSave(),
      techPoints: 7.8,
      unlockedTechIds: ['workshopLog', 'skipMe', 'artisanManual'],
    }
    const save = hydrateLoadedSave(raw)
    expect(save?.techPoints).toBe(7)
    expect(save?.knightLevel).toBe(1)
    expect(save?.unlockedTechIds).toEqual(['workshopLog', 'artisanManual'])
    expect(save?.encounters).toHaveLength(1)

    const old = {
      ...createSave(),
    }
    delete (old as { techPoints?: number }).techPoints
    delete (old as { knightLevel?: number }).knightLevel
    delete (old as { unlockedTechIds?: string[] }).unlockedTechIds
    const hydrated = hydrateLoadedSave(old)
    expect(hydrated?.techPoints).toBe(0)
    expect(hydrated?.knightLevel).toBe(1)
    expect(hydrated?.unlockedTechIds).toEqual([])

    const skipped = hydrateLoadedSave({
      ...createSave(),
      unlockedTechIds: ['apprenticeNotes'],
    })
    expect(skipped?.unlockedTechIds).toEqual(['apprenticeNotes'])

    const aliased = hydrateLoadedSave({
      ...createSave(),
      techPoints: undefined,
      inspiration: 4.2,
      unlockedTechIds: ['workshopLog', 'apprenticeNotes'],
    })
    expect(aliased?.techPoints).toBe(4)
    expect(aliased?.knightLevel).toBe(1)
    expect(aliased?.unlockedTechIds).toEqual(['workshopLog', 'apprenticeNotes'])

    const backfill = hydrateLoadedSave({
      ...createSave(),
      techPoints: 4,
      knightLevel: 1,
      stations: {
        ...createSave().stations,
        mining: { ...createSave().stations.mining, stationLevel: 3 },
      },
    })
    expect(backfill?.knightLevel).toBe(3)
    expect(backfill?.techPoints).toBe(6)

    const legacyPlayed = {
      ...createSave(),
      techPoints: 9,
      stations: {
        ...createSave().stations,
        mining: { ...createSave().stations.mining, stationLevel: 5 },
      },
    }
    delete (legacyPlayed as { knightLevel?: number }).knightLevel
    const legacy = hydrateLoadedSave(legacyPlayed)
    expect(legacy?.knightLevel).toBe(5)
    expect(legacy?.techPoints).toBe(9)
  })
})
