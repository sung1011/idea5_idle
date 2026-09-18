import { describe, expect, it } from 'vitest'
import {
  APP_TABS,
  DEFAULT_APP_TAB,
  appTab,
  openItemWorkshop,
  openWorkshopStation,
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
  it('keeps the dock order 工坊 | 工人 | 主线 | 科技 and falls back to 主线', () => {
    expect(APP_TABS.map((tab) => tab.id)).toEqual(['workshop', 'workers', 'encounters', 'tech'])
    expect(DEFAULT_APP_TAB).toBe('encounters')
    expect(selectAppTab('nope')).toBe('encounters')
    expect(appTab.value).toBe('encounters')
  })

  it('switches the dock tab and remembers a workshop station', () => {
    selectAppTab('workshop')
    expect(appTab.value).toBe('workshop')
    const store = memory()
    expect(selectWorkshopStation('cooking', store)).toBe('cooking')
    expect(workshopTab.value).toBe('cooking')
    expect(store.getItem(WORKSHOP_TAB_KEY)).toBe('cooking')
    expect(selectAppTab('nope')).toBe(DEFAULT_APP_TAB)
    expect(appTab.value).toBe('encounters')
  })

  it('opens a station on the workshop dock', () => {
    selectAppTab('workers')
    const store = memory()
    expect(openWorkshopStation('fishing', store)).toBe('fishing')
    expect(appTab.value).toBe('workshop')
    expect(workshopTab.value).toBe('fishing')
    expect(store.getItem(WORKSHOP_TAB_KEY)).toBe('fishing')
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
