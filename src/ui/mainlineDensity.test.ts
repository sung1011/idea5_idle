import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MAINLINE_DENSITY,
  MAINLINE_DENSITY_KEY,
  loadMainlineDensity,
  mainlineDensity,
  mainlineDensityOf,
  saveMainlineDensity,
  selectMainlineDensity,
} from './mainlineDensity'

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

describe('mainlineDensity', () => {
  it('defaults to 详 and rejects unknown values', () => {
    expect(mainlineDensityOf('detail')).toBe('detail')
    expect(mainlineDensityOf('brief')).toBe('brief')
    expect(mainlineDensityOf('nope')).toBe(DEFAULT_MAINLINE_DENSITY)
    expect(DEFAULT_MAINLINE_DENSITY).toBe('detail')
  })

  it('persists the shared 简 | 详 preference', () => {
    const store = memory()
    expect(loadMainlineDensity(store)).toBe('detail')
    expect(saveMainlineDensity('brief', store)).toBe('brief')
    expect(store.getItem(MAINLINE_DENSITY_KEY)).toBe('brief')
    expect(loadMainlineDensity(store)).toBe('brief')
    expect(saveMainlineDensity('bad', store)).toBe('detail')
    expect(loadMainlineDensity(store)).toBe('detail')
  })

  it('selectMainlineDensity updates the shared density ref', () => {
    const store = memory()
    expect(selectMainlineDensity('brief', store)).toBe('brief')
    expect(mainlineDensity.value).toBe('brief')
    expect(store.getItem(MAINLINE_DENSITY_KEY)).toBe('brief')
    expect(selectMainlineDensity('detail', store)).toBe('detail')
    expect(mainlineDensity.value).toBe('detail')
  })
})
