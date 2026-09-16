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
    expect(save?.workers[0].toolSlot).toBeNull()
    expect(save?.workers[0].foodSlot).toBeNull()
    expect(save?.workers[0].qualityTier).toBe(1)
    expect(save?.workers[1].qualityTier).toBe(1)
    expect(save?.workers[1].assignment).toBe('forging')
    expect(save?.workers[1].toolSlot?.itemId).toBe('tool')
    expect(save?.workers[1].toolSlot?.matchStationId).toBe('mining')
    expect(save?.workers[1].foodSlot?.itemId).toBe('meal')
    expect(save?.workers[1].foodSlot?.buff.mul).toBe(1.2)
    expect(save?.workers[1].foodSlot?.qty).toBe(2)
    expect(save?.stations.hunting).toBeTruthy()
    expect(save?.stations.herbalism).toBeTruthy()
    expect(save?.stations.alchemy).toBeTruthy()
    expect((save?.stations as { woodcutting?: unknown } | undefined)?.woodcutting).toBeUndefined()
    expect(save?.stations.mining.miningNode?.nodeHp).toBe(20)
    expect(save?.rngState).toBe(1)
    expect(save?.forgedTools).toEqual([])
    expect(save?.stations.forging.selectedToolType).toBe('pick')
    expect(save?.stations.fishing.selectedCategory).toBe('copper')
    expect(save?.stations.hunting.selectedCategory).toBe('copper')
    expect(save?.workerQualityRev).toBe(2)
  })

  it('migrates old gray-table quality tiers once and stamps the new rev', () => {
    const raw = {
      ...createSave(),
      workerQualityRev: undefined,
      workers: [
        { id: 'w-1', qualityTier: 1, assignment: null, toolSlot: null, foodSlot: null },
        { id: 'w-2', qualityTier: 2, assignment: null, toolSlot: null, foodSlot: null },
        { id: 'w-3', qualityTier: 7, assignment: null, toolSlot: null, foodSlot: null },
        { id: 'w-4', qualityTier: 8, assignment: null, toolSlot: null, foodSlot: null },
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
        { id: 'w-1', qualityTier: 2, assignment: null, toolSlot: null, foodSlot: null },
        { id: 'w-2', qualityTier: 7, assignment: null, toolSlot: null, foodSlot: null },
      ],
    }
    const save = hydrateLoadedSave(raw)
    expect(save?.workers.map((w) => w.qualityTier)).toEqual([2, 7])
    expect(save?.workerQualityRev).toBe(2)
  })
})
