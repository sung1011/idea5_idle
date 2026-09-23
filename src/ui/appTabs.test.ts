import { describe, expect, it } from 'vitest'
import { APP_TAB_KEY, APP_TABS, DEFAULT_APP_TAB, appTabOf, loadAppTab, saveAppTab } from './appTabs'

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

describe('appTabs', () => {
  it('keeps the dock order 工坊 | 主线 | 科技 and falls back to 主线', () => {
    expect(APP_TABS.map((tab) => tab.id)).toEqual(['workshop', 'encounters', 'tech'])
    expect(appTabOf('workshop')).toBe('workshop')
    expect(appTabOf('workers')).toBe('workshop')
    expect(appTabOf('workersV2')).toBe('workshop')
    expect(appTabOf('encounters')).toBe('encounters')
    expect(appTabOf('tech')).toBe('tech')
    expect(appTabOf('nope')).toBe(DEFAULT_APP_TAB)
    expect(DEFAULT_APP_TAB).toBe('encounters')
  })

  it('persists the last dock tab and maps old worker tabs onto 工坊', () => {
    const store = memory()
    expect(loadAppTab(store)).toBe('encounters')
    expect(saveAppTab('workers', store)).toBe('workshop')
    expect(store.getItem(APP_TAB_KEY)).toBe('workshop')
    expect(loadAppTab(store)).toBe('workshop')
    expect(saveAppTab('workersV2', store)).toBe('workshop')
    expect(store.getItem(APP_TAB_KEY)).toBe('workshop')
    expect(loadAppTab(store)).toBe('workshop')
    store.setItem(APP_TAB_KEY, 'workersV2')
    expect(loadAppTab(store)).toBe('workshop')
    expect(store.getItem(APP_TAB_KEY)).toBe('workshop')
    expect(saveAppTab('tech', store)).toBe('tech')
    expect(loadAppTab(store)).toBe('tech')
    expect(saveAppTab('bad', store)).toBe('encounters')
    expect(store.getItem(APP_TAB_KEY)).toBe('encounters')
    expect(loadAppTab(store)).toBe('encounters')
  })
})
