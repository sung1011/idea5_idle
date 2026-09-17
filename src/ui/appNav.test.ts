import { describe, expect, it } from 'vitest'
import {
  DEFAULT_APP_TAB,
  appTab,
  openItemWorkshop,
  selectAppTab,
  selectWorkshopStation,
  workshopTab,
} from './appNav'
import { WORKSHOP_TAB_KEY } from './workshopTabs'

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

describe('appNav', () => {
  it('switches the dock tab and remembers a workshop station', () => {
    selectAppTab('encounters')
    expect(appTab.value).toBe('encounters')
    const store = memory()
    expect(selectWorkshopStation('cooking', store)).toBe('cooking')
    expect(workshopTab.value).toBe('cooking')
    expect(store.getItem(WORKSHOP_TAB_KEY)).toBe('cooking')
    expect(selectAppTab('nope')).toBe(DEFAULT_APP_TAB)
    expect(appTab.value).toBe('workshop')
  })

  it('opens a producible item on the workshop dock and its producer station', () => {
    selectAppTab('encounters')
    const store = memory()
    expect(openItemWorkshop('meal', store)).toBe('cooking')
    expect(appTab.value).toBe('workshop')
    expect(workshopTab.value).toBe('cooking')
    expect(store.getItem(WORKSHOP_TAB_KEY)).toBe('cooking')
    expect(openItemWorkshop('potion', store)).toBe('alchemy')
    expect(workshopTab.value).toBe('alchemy')
    expect(openItemWorkshop('wood', store)).toBeNull()
    expect(appTab.value).toBe('workshop')
    expect(workshopTab.value).toBe('alchemy')
  })
})
