import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import stationCardSource from './stationCard.vue?raw'
import workersPanelSource from './workersPanelV2.vue?raw'
import { createSave } from '../sim/createSave'
import { BANTER_BUBBLE_MS, banterLines } from '../sim/workshopBanter'
import type { Worker } from '../sim/types'
import { appTab, workshopTab } from './appNav'
import { DEFAULT_APP_TAB } from './appTabs'
import type { StationId } from '../sim/types'
import type { AppTabId } from './appTabs'
import {
  WORKSHOP_BANTER_KEY,
  dismissWorkshopBanter,
  greetWorkshopBanter,
  offerActionBanter,
  resetWorkshopBanterForTests,
  loadWorkshopBanter,
  playWorkshopBanter,
  saveWorkshopBanter,
  workshopBanterBubble,
  workshopBanterText,
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

  it('plays the second beat in order only on the workers page', () => {
    vi.useFakeTimers()
    appTab.value = 'workers'
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
    vi.advanceTimersByTime(BANTER_BUBBLE_MS - 1)
    expect(workshopBanterBubble('cooking')).toMatchObject({ workerId: 'b', text: '你是高级材料' })
    vi.advanceTimersByTime(1)
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

  it('does not show a line that fires off the workers page, and does not replay it later', () => {
    vi.useFakeTimers()
    appTab.value = 'workshop'
    playWorkshopBanter({
      stationId: 'herbalism',
      kind: 'solo',
      beats: [{ workerId: 'a', stationId: 'herbalism', text: '我还在岗吗', delayMs: 0 }],
    })
    expect(workshopBanterBubble('herbalism')).toBeNull()
    expect(workshopBanterText('a')).toBe('')
    appTab.value = 'workers'
    vi.advanceTimersByTime(10)
    expect(workshopBanterBubble('herbalism')).toBeNull()
  })

  it('station card does not render a banter bubble', () => {
    expect(stationCardSource).not.toContain('banter')
  })

  it('renders banter only on workshop slots, not rest or combat rows', () => {
    const combatAt = workersPanelSource.indexOf('aria-label="战斗区"')
    const styleAt = workersPanelSource.indexOf('<style')
    expect(combatAt).toBeGreaterThan(0)
    expect(styleAt).toBeGreaterThan(combatAt)
    expect(workersPanelSource.slice(0, combatAt)).toContain('class="banter"')
    expect(workersPanelSource.slice(combatAt, styleAt)).not.toContain('banter')
  })

  it('skips the forced greet when only rest or combat workers are present', () => {
    const save = createSave()
    save.workers.push(onDuty('rest', null))
    appTab.value = 'workers'
    greetWorkshopBanter(save, () => {
      throw new Error('休息区不应入选')
    })
    expect(workshopBanterText('rest')).toBe('')

    resetWorkshopBanterForTests()
    const fighting = createSave()
    const fighter = onDuty('fight', 'mining')
    fighting.workers.push(fighter)
    fighting.encounters.push({
      id: 'enc-1',
      label: '狼',
      quality: 'green',
      kind: 'enemy',
      needs: {},
      lootGold: 0,
      departed: true,
      lootClaimed: false,
      enemyRank: 'minion',
      weaknesses: [],
      revealedWeaknesses: [],
      combat: {
        startedAt: 0,
        timeoutAt: 900,
        workerIds: [fighter.id],
        workers: [{ id: fighter.id, label: '甲', hp: 8, hpMax: 10, atk: 1, spd: 2, nextActAt: 0 }],
        enemy: { id: 'wolf', label: '狼', hp: 10, hpMax: 10, atk: 1, spd: 2, nextActAt: 0 },
        logs: [],
        outcome: null,
      },
    } as (typeof fighting.encounters)[number])
    greetWorkshopBanter(fighting, () => {
      throw new Error('战斗区不应入选')
    })
    expect(workshopBanterText('fight')).toBe('')
  })

  it('lands the forced greet on a workshop station worker, not a fighter', () => {
    const save = createSave()
    const duty = onDuty('duty', 'cooking')
    const fighter = onDuty('fight', 'mining')
    save.workers.push(duty, fighter)
    save.encounters.push({
      id: 'enc-2',
      label: '狼',
      quality: 'green',
      kind: 'enemy',
      needs: {},
      lootGold: 0,
      departed: true,
      lootClaimed: false,
      enemyRank: 'minion',
      weaknesses: [],
      revealedWeaknesses: [],
      combat: {
        startedAt: 0,
        timeoutAt: 900,
        workerIds: [fighter.id],
        workers: [{ id: fighter.id, label: '乙', hp: 8, hpMax: 10, atk: 1, spd: 2, nextActAt: 0 }],
        enemy: { id: 'wolf', label: '狼', hp: 10, hpMax: 10, atk: 1, spd: 2, nextActAt: 0 },
        logs: [],
        outcome: null,
      },
    } as (typeof save.encounters)[number])
    appTab.value = 'workers'
    greetWorkshopBanter(save, () => 0)
    expect(workshopBanterBubble('cooking')?.workerId).toBe('duty')
    expect(workshopBanterText('fight')).toBe('')
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
    appTab.value = 'workers'
    greetWorkshopBanter(save)
    expect(workshopBanterBubble('herbalism')).toBeNull()
    saveWorkshopBanter(true, store)
    greetWorkshopBanter(save)
    expect(workshopBanterBubble('herbalism')).toBeNull()
    expect(onDuty.isNew).toBe(true)
    vi.unstubAllGlobals()
  })

  it('does not spend the forced line while the workers page is closed', () => {
    appTab.value = 'workshop'
    const save = createSave()
    save.workers.push(onDuty('a', 'cooking'))
    greetWorkshopBanter(save, () => {
      throw new Error('不在工人页，不应掷骰')
    })
    expect(workshopBanterBubble('cooking')).toBeNull()
    expect(workshopBanterText('a')).toBe('')
  })

  it('plays the forced line once on the first visit to the workers page', () => {
    const save = createSave()
    save.workers.push(onDuty('a', 'cooking'))
    appTab.value = 'workshop'
    greetWorkshopBanter(save, () => 0)
    expect(workshopBanterText('a')).toBe('')

    appTab.value = 'workers'
    greetWorkshopBanter(save, () => 0)
    expect(workshopBanterBubble('cooking')).toMatchObject({
      workerId: 'a',
      text: banterLines('gripe', 'cooking')[0],
    })
    expect(workshopBanterText('a')).toBe(banterLines('gripe', 'cooking')[0])
    greetWorkshopBanter(save, () => {
      throw new Error('已经打过招呼')
    })
    expect(workshopBanterText('a')).toBe(banterLines('gripe', 'cooking')[0])
  })

  it('plays an assign line only while the workers page is open', () => {
    appTab.value = 'workers'
    const save = createSave()
    save.workers.push(onDuty('a', 'cooking'))
    offerActionBanter(save, 'assign', { workerId: 'a', stationId: 'cooking' }, () => 0)
    expect(workshopBanterBubble('cooking')).toMatchObject({
      workerId: 'a',
      text: banterLines('byStation', 'cooking')[0],
    })

    resetWorkshopBanterForTests()
    appTab.value = 'workshop'
    offerActionBanter(save, 'assign', { workerId: 'a', stationId: 'cooking' }, () => {
      throw new Error('不在工人页，不应掷骰')
    })
    expect(workshopBanterBubble('cooking')).toBeNull()
    appTab.value = 'workers'
    expect(workshopBanterText('a')).toBe('')
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
