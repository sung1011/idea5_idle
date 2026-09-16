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
})
