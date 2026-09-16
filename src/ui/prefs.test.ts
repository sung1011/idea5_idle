import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFS, PREFS_KEY, loadPrefs, normalizePrefs, savePrefs } from './prefs'

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

describe('prefs', () => {
  it('defaults music and sfx on', () => {
    expect(normalizePrefs(undefined)).toEqual(DEFAULT_PREFS)
    expect(loadPrefs(memory())).toEqual({ music: true, sfx: true })
  })

  it('persists mute flags to the settings key', () => {
    const store = memory()
    savePrefs({ music: false, sfx: true }, store)
    expect(store.getItem(PREFS_KEY)).toContain('"music":false')
    expect(loadPrefs(store)).toEqual({ music: false, sfx: true })
  })
})
