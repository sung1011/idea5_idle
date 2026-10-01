import { describe, expect, it } from 'vitest'
import { appTab, workshopTab } from './appNav'
import { APP_TAB_KEY } from './appTabs'
import { guideCampOpenRequest, openGuideQuestStep, openGuideQuestTask, pendingGuideRunePick } from './guideQuestNav'
import { MAINLINE_TAB_KEY, mainlineTab } from './mainlineTabs'
import { openStationDetailId, showStationDetail } from './stationDetailNav'

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
    const campBefore = guideCampOpenRequest.value
    expect(openGuideQuestStep(1, store)).toBe('workshop')
    expect(appTab.value).toBe('workshop')
    expect(store.getItem(APP_TAB_KEY)).toBe('workshop')
    expect(guideCampOpenRequest.value).toBe(campBefore + 1)

    expect(openGuideQuestStep(2, store)).toBe('workshop')
    expect(workshopTab.value).toBe('herbalism')
    expect(guideCampOpenRequest.value).toBe(campBefore + 1)
    expect(openGuideQuestStep(3, store)).toBe('workshop')
    expect(workshopTab.value).toBe('herbalism')
    expect(guideCampOpenRequest.value).toBe(campBefore + 1)
    expect(openGuideQuestStep(4, store)).toBe('workshop')
    expect(guideCampOpenRequest.value).toBe(campBefore + 1)
    expect(openGuideQuestStep(5, store)).toBe('workshop')
    expect(workshopTab.value).toBe('alchemy')
    expect(openStationDetailId.value).toBeNull()
    expect(guideCampOpenRequest.value).toBe(campBefore + 1)

    expect(openGuideQuestStep(6, store)).toBe('workshop')
    expect(guideCampOpenRequest.value).toBe(campBefore + 2)
    showStationDetail('alchemy')
    expect(openGuideQuestStep(7, store)).toBe('workshop')
    expect(guideCampOpenRequest.value).toBe(campBefore + 3)
    const campBeforePotion = guideCampOpenRequest.value
    expect(openGuideQuestStep(8, store)).toBe('workshop')
    expect(guideCampOpenRequest.value).toBe(campBeforePotion + 1)
    expect(openGuideQuestStep(9, store)).toBe('encounters')
    expect(appTab.value).toBe('encounters')
    expect(mainlineTab.value).toBe('battlefield')
    expect(store.getItem(MAINLINE_TAB_KEY)).toBe('battlefield')
    expect(openGuideQuestStep(10, store)).toBe('workshop')
    expect(guideCampOpenRequest.value).toBe(campBeforePotion + 1)
    expect(openGuideQuestTask('tech', store)).toBe('tech')
    expect(openGuideQuestTask('market', store)).toBe('encounters')
    expect(mainlineTab.value).toBe('market')

    expect(pendingGuideRunePick.value).toBe(false)
    expect(openGuideQuestTask('rune', store)).toBe('encounters')
    expect(mainlineTab.value).toBe('battlefield')
    expect(store.getItem(MAINLINE_TAB_KEY)).toBe('battlefield')
    expect(pendingGuideRunePick.value).toBe(true)

    const campAfterAuto = guideCampOpenRequest.value
    expect(openGuideQuestTask('autoHerb', store)).toBe('workshop')
    expect(workshopTab.value).toBe('herbalism')
    expect(guideCampOpenRequest.value).toBe(campAfterAuto)
    expect(openGuideQuestTask('autoLine', store)).toBe('workshop')
    expect(openGuideQuestTask('herbSickle', store)).toBe('workshop')
    expect(workshopTab.value).toBe('herbalism')
    const camp = guideCampOpenRequest.value
    expect(openGuideQuestTask('restFood', store)).toBe('workshop')
    expect(guideCampOpenRequest.value).toBe(camp + 1)
    expect(openGuideQuestTask('slotsFull', store)).toBe('workshop')
    expect(appTab.value).toBe('workshop')
    expect(guideCampOpenRequest.value).toBe(camp + 2)
    expect(openGuideQuestTask('veteran', store)).toBe('encounters')
    expect(mainlineTab.value).toBe('battlefield')

    expect(openGuideQuestTask('alchemy3', store)).toBe('workshop')
    expect(workshopTab.value).toBe('alchemy')
    expect(openStationDetailId.value).toBe('alchemy')
  })
})
