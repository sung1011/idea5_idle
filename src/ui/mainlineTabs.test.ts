import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MAINLINE_TAB,
  MAINLINE_TAB_KEY,
  loadMainlineTab,
  mainlineTab,
  mainlineTabOf,
  saveMainlineTab,
  selectMainlineTab,
} from './mainlineTabs'

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

describe('mainlineTabs', () => {
  it('resolves known tabs and falls back to battlefield', () => {
    expect(mainlineTabOf('battlefield')).toBe('battlefield')
    expect(mainlineTabOf('market')).toBe('market')
    expect(mainlineTabOf('nope')).toBe(DEFAULT_MAINLINE_TAB)
    expect(DEFAULT_MAINLINE_TAB).toBe('battlefield')
  })

  it('persists the active mainline tab', () => {
    const store = memory()
    expect(loadMainlineTab(store)).toBe('battlefield')
    expect(saveMainlineTab('market', store)).toBe('market')
    expect(store.getItem(MAINLINE_TAB_KEY)).toBe('market')
    expect(loadMainlineTab(store)).toBe('market')
    expect(saveMainlineTab('bad', store)).toBe('battlefield')
    expect(loadMainlineTab(store)).toBe('battlefield')
  })

  it('selectMainlineTab updates the shared tab ref', () => {
    const store = memory()
    expect(selectMainlineTab('market', store)).toBe('market')
    expect(mainlineTab.value).toBe('market')
    expect(store.getItem(MAINLINE_TAB_KEY)).toBe('market')
  })
})
