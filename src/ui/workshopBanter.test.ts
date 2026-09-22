import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appTab, workshopTab } from './appNav'
import { DEFAULT_APP_TAB } from './appTabs'
import type { StationId } from '../sim/types'
import type { AppTabId } from './appTabs'
import {
  WORKSHOP_BANTER_KEY,
  dismissWorkshopBanter,
  loadWorkshopBanter,
  playWorkshopBanter,
  saveWorkshopBanter,
  workshopBanterBubble,
} from './workshopBanter'

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

describe('workshop banter bubbles', () => {
  let prevApp: AppTabId = DEFAULT_APP_TAB
  let prevStation: StationId = 'herbalism'

  beforeEach(() => {
    prevApp = appTab.value
    prevStation = workshopTab.value
  })

  afterEach(() => {
    vi.useRealTimers()
    dismissWorkshopBanter()
    appTab.value = prevApp
    workshopTab.value = prevStation
  })

  it('defaults on and stores the workshopBanter key', () => {
    const store = memory()
    expect(loadWorkshopBanter(store)).toBe(true)
    expect(saveWorkshopBanter(false, store)).toBe(false)
    expect(store.getItem(WORKSHOP_BANTER_KEY)).toBe('0')
    expect(loadWorkshopBanter(store)).toBe(false)
    saveWorkshopBanter(true, store)
    expect(store.getItem(WORKSHOP_BANTER_KEY)).toBe('1')
    expect(loadWorkshopBanter(store)).toBe(true)
    store.setItem(WORKSHOP_BANTER_KEY, 'off')
    expect(loadWorkshopBanter(store)).toBe(false)
  })

  it('plays the second beat in order, and drops it when the workshop closes', () => {
    vi.useFakeTimers()
    appTab.value = 'workshop'
    workshopTab.value = 'cooking'
    playWorkshopBanter({
      stationId: 'cooking',
      kind: 'duet',
      beats: [
        { workerId: 'a', stationId: 'cooking', text: '先做完这锅带着香味走', delayMs: 0 },
        { workerId: 'b', stationId: 'cooking', text: '你是高级材料', delayMs: 1000 },
      ],
    })
    expect(workshopBanterBubble('cooking')).toMatchObject({ workerId: 'a', text: '先做完这锅带着香味走' })
    vi.advanceTimersByTime(1000)
    expect(workshopBanterBubble('cooking')).toMatchObject({ workerId: 'b', text: '你是高级材料' })
    vi.advanceTimersByTime(2200)
    expect(workshopBanterBubble('cooking')).toBeNull()

    playWorkshopBanter({
      stationId: 'cooking',
      kind: 'duet',
      beats: [
        { workerId: 'a', stationId: 'cooking', text: '战场缺人', delayMs: 0 },
        { workerId: 'b', stationId: 'cooking', text: '工坊也缺', delayMs: 900 },
      ],
    })
    expect(workshopBanterBubble('cooking')?.text).toBe('战场缺人')
    dismissWorkshopBanter()
    vi.advanceTimersByTime(900)
    expect(workshopBanterBubble('cooking')).toBeNull()
  })

  it('does not show a line that fires off the workshop tab', () => {
    vi.useFakeTimers()
    appTab.value = 'workers'
    playWorkshopBanter({
      stationId: 'herbalism',
      kind: 'solo',
      beats: [{ workerId: 'a', stationId: 'herbalism', text: '我还在岗吗', delayMs: 0 }],
    })
    expect(workshopBanterBubble('herbalism')).toBeNull()
    appTab.value = 'workshop'
    vi.advanceTimersByTime(10)
    expect(workshopBanterBubble('herbalism')).toBeNull()
  })
})
