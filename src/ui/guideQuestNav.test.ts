import { describe, expect, it } from 'vitest'
import { appTab, workshopTab } from './appNav'
import { APP_TAB_KEY } from './appTabs'
import { openGuideQuestStep } from './guideQuestNav'
import { TECH_TAB_KEY, techTab } from './techTabs'
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

describe('guideQuestNav', () => {
  it('opens the matching dock and sub-tab for each guide step', () => {
    const store = memory()
    expect(openGuideQuestStep(1, store)).toBe('workers')
    expect(appTab.value).toBe('workers')
    expect(store.getItem(APP_TAB_KEY)).toBe('workers')

    expect(openGuideQuestStep(2, store)).toBe('workshop')
    expect(appTab.value).toBe('workshop')
    expect(workshopTab.value).toBe('mining')
    expect(store.getItem(WORKSHOP_TAB_KEY)).toBe('mining')

    expect(openGuideQuestStep(3, store)).toBe('encounters')
    expect(openGuideQuestStep(4, store)).toBe('encounters')
    expect(appTab.value).toBe('encounters')

    expect(openGuideQuestStep(5, store)).toBe('tech')
    expect(appTab.value).toBe('tech')
    expect(techTab.value).toBe('affairs')
    expect(store.getItem(TECH_TAB_KEY)).toBe('affairs')
  })
})
