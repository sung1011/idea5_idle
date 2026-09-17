import { describe, expect, it } from 'vitest'
import { DEFAULT_TECH_TAB, loadTechTab, saveTechTab, TECH_TAB_KEY, techTabOf } from './techTabs'

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

describe('techTabs', () => {
  it('resolves known tabs and falls back to production', () => {
    expect(techTabOf('production')).toBe('production')
    expect(techTabOf('combat')).toBe('combat')
    expect(techTabOf('affairs')).toBe('affairs')
    expect(techTabOf('nope')).toBe(DEFAULT_TECH_TAB)
    expect(DEFAULT_TECH_TAB).toBe('production')
  })

  it('persists the active tech tab', () => {
    const store = memory()
    expect(loadTechTab(store)).toBe('production')
    expect(saveTechTab('affairs', store)).toBe('affairs')
    expect(store.getItem(TECH_TAB_KEY)).toBe('affairs')
    expect(loadTechTab(store)).toBe('affairs')
    expect(saveTechTab('bad', store)).toBe('production')
    expect(loadTechTab(store)).toBe('production')
  })
})
