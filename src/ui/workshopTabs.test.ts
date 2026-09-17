import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WORKSHOP_TAB,
  LEGACY_WORKSHOP_LINE_KEY,
  WORKSHOP_TAB_IDS,
  WORKSHOP_TAB_KEY,
  isWorkshopTabId,
  loadWorkshopTab,
  saveWorkshopTab,
  workshopTabLabel,
  workshopTabOf,
} from './workshopTabs'

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

describe('workshopTabs', () => {
  it('lists seven station tabs with fishing last', () => {
    expect(WORKSHOP_TAB_IDS).toEqual([
      'mining',
      'forging',
      'hunting',
      'cooking',
      'herbalism',
      'alchemy',
      'fishing',
    ])
    expect(WORKSHOP_TAB_IDS.map(workshopTabLabel)).toEqual([
      '采矿',
      '锻造',
      '狩猎',
      '烹饪',
      '采药',
      '炼金',
      '钓鱼',
    ])
  })

  it('resolves unknown and legacy line ids', () => {
    expect(isWorkshopTabId('mining')).toBe(true)
    expect(isWorkshopTabId('woodcutting')).toBe(false)
    expect(isWorkshopTabId('smelt')).toBe(false)
    expect(workshopTabOf('nope')).toBe(DEFAULT_WORKSHOP_TAB)
    expect(workshopTabOf('smelt')).toBe('mining')
    expect(workshopTabOf('hunt')).toBe('hunting')
    expect(workshopTabOf('brew')).toBe('herbalism')
    expect(workshopTabOf('fish')).toBe('fishing')
    expect(workshopTabOf('alchemy')).toBe('alchemy')
  })

  it('persists the active station and migrates the old line key', () => {
    const store = memory()
    expect(loadWorkshopTab(store)).toBe('mining')
    expect(saveWorkshopTab('cooking', store)).toBe('cooking')
    expect(store.getItem(WORKSHOP_TAB_KEY)).toBe('cooking')
    expect(loadWorkshopTab(store)).toBe('cooking')
    expect(saveWorkshopTab('bad', store)).toBe('mining')
    expect(loadWorkshopTab(store)).toBe('mining')

    const legacy = memory()
    legacy.setItem(LEGACY_WORKSHOP_LINE_KEY, 'brew')
    expect(loadWorkshopTab(legacy)).toBe('herbalism')
    expect(legacy.getItem(WORKSHOP_TAB_KEY)).toBe('herbalism')
    expect(legacy.getItem(LEGACY_WORKSHOP_LINE_KEY)).toBeNull()
  })
})
