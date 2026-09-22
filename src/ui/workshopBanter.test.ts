import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSave } from '../sim/createSave'
import { banterLines } from '../sim/workshopBanter'
import type { Worker } from '../sim/types'
import { appTab, workshopTab } from './appNav'
import { DEFAULT_APP_TAB } from './appTabs'
import type { StationId } from '../sim/types'
import type { AppTabId } from './appTabs'
import {
  WORKSHOP_BANTER_KEY,
  dismissWorkshopBanter,
  greetWorkshopBanter,
  resetWorkshopBanterForTests,
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
    resetWorkshopBanterForTests()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
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

  it('skips the entry greet when the switch is off and does not replay after it is turned on', () => {
    const store = memory()
    vi.stubGlobal('localStorage', store)
    saveWorkshopBanter(false, store)
    const save = createSave()
    const onDuty: Worker = {
      id: 'a',
      assignment: 'herbalism',
      qualityTier: 1,
      foodSlot: null,
      fatigueDebt: 0,
      isNew: true,
      hp: 20,
      hpMax: 20,
      level: 1,
      xp: 0,
      combatAttrs: [],
    }
    save.workers.push(onDuty)
    prevApp = appTab.value
    prevStation = workshopTab.value
    appTab.value = 'workshop'
    workshopTab.value = 'herbalism'
    greetWorkshopBanter(save)
    expect(workshopBanterBubble('herbalism')).toBeNull()
    saveWorkshopBanter(true, store)
    greetWorkshopBanter(save)
    expect(workshopBanterBubble('herbalism')).toBeNull()
    expect(onDuty.isNew).toBe(true)
    vi.unstubAllGlobals()
  })

  it('does not spend the forced line when the clock starts off the workshop tab', () => {
    appTab.value = 'encounters'
    workshopTab.value = 'herbalism'
    const save = createSave()
    save.workers.push(onDuty('a', 'herbalism'))
    greetWorkshopBanter(save, () => {
      throw new Error('开钟不在工坊，不应掷骰')
    })
    expect(workshopBanterBubble('herbalism')).toBeNull()
  })

  it('plays the forced line once on the first visit to the workshop', () => {
    const save = createSave()
    save.workers.push(onDuty('a', 'herbalism'))
    appTab.value = 'encounters'
    workshopTab.value = 'cooking'
    greetWorkshopBanter(save, () => 0)
    expect(workshopBanterBubble('herbalism')).toBeNull()

    appTab.value = 'workshop'
    workshopTab.value = 'herbalism'
    greetWorkshopBanter(save, () => 0)
    expect(workshopBanterBubble('herbalism')).toMatchObject({
      workerId: 'a',
      text: banterLines('gripe', 'herbalism')[0],
    })
    greetWorkshopBanter(save, () => {
      throw new Error('已经打过招呼')
    })
    expect(workshopBanterBubble('herbalism')?.text).toBe(banterLines('gripe', 'herbalism')[0])
  })

  it('does not commit the forced line when that station is off the current group', () => {
    const save = createSave()
    save.workers.push(onDuty('a', 'cooking'))
    appTab.value = 'workshop'
    workshopTab.value = 'herbalism'
    greetWorkshopBanter(save, () => {
      throw new Error('当前组看不见烹饪，不应掷骰')
    })
    expect(workshopBanterBubble('cooking')).toBeNull()

    workshopTab.value = 'cooking'
    greetWorkshopBanter(save, () => 0)
    expect(workshopBanterBubble('cooking')).toMatchObject({
      workerId: 'a',
      text: banterLines('gripe', 'cooking')[0],
    })
  })
})

function onDuty(id: string, assignment: Worker['assignment']): Worker {
  return {
    id,
    assignment,
    qualityTier: 1,
    foodSlot: null,
    fatigueDebt: 0,
    isNew: false,
    hp: 20,
    hpMax: 20,
    level: 1,
    xp: 0,
    combatAttrs: [],
  }
}
