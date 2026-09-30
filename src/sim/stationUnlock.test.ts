import { describe, expect, it } from 'vitest'
import { assignIdleWorker, assignWorker } from './assign'
import { createSave } from './createSave'
import { spawnWorker } from './recruit'
import { PLAYABLE_STATION_IDS } from './tables'
import {
  STATION_UNLOCK_KNIGHT,
  STATION_UNLOCK_KNIGHT_MAX,
  isStationUnlocked,
  knightLevelOf,
  nextLockedStation,
  stationLockedTip,
  stationUnlockKnightLevel,
  unlockPlayableStations,
  unlockedStationIds,
  workshopGroupLockedTip,
} from './stationUnlock'
import { hydrateLoadedSave } from '../ui/saveGame'

describe('stationUnlock by knight level', () => {
  it('opens herbalism and alchemy at knight 1', () => {
    const save = createSave()
    expect(save.knightLevel).toBe(1)
    expect(unlockedStationIds(save)).toEqual(['herbalism'])
    expect(isStationUnlocked(save, 'herbalism')).toBe(true)
    expect(isStationUnlocked(save, 'alchemy')).toBe(false)
    expect(isStationUnlocked(save, 'hunting')).toBe(false)
    expect(isStationUnlocked(save, 'inscription')).toBe(false)
    expect(stationLockedTip('hunting')).toBe('完成主线「升到酋长 6 级（开放狩猎、集市）」后开启')
    expect(stationUnlockKnightLevel('alchemy')).toBe(2)
    expect(stationUnlockKnightLevel('inscription')).toBe(18)
    expect(STATION_UNLOCK_KNIGHT).toEqual({
      herbalism: 1,
      alchemy: 2,
      hunting: 6,
      cooking: 8,
      mining: 16,
      inscription: 18,
    })
    expect(STATION_UNLOCK_KNIGHT_MAX).toBe(18)
  })

  it('keeps later stations locked until the mainline grant, then opens them with the helper', () => {
    const save = createSave()
    save.knightLevel = 18
    expect(unlockedStationIds(save)).toEqual(['herbalism'])
    unlockPlayableStations(save, 6)
    expect(unlockedStationIds(save)).toEqual(['herbalism', 'alchemy', 'hunting'])
    unlockPlayableStations(save, 8)
    expect(unlockedStationIds(save)).toEqual(['herbalism', 'alchemy', 'hunting', 'cooking'])
    unlockPlayableStations(save, 16)
    expect(unlockedStationIds(save)).toEqual(['herbalism', 'alchemy', 'hunting', 'cooking', 'mining'])
    unlockPlayableStations(save)
    expect(knightLevelOf(save)).toBe(STATION_UNLOCK_KNIGHT_MAX)
    expect(unlockedStationIds(save)).toEqual([...PLAYABLE_STATION_IDS])
  })

  it('tips the next locked station in a workshop group', () => {
    const save = createSave()
    expect(nextLockedStation(save, ['hunting', 'cooking'])).toBe('hunting')
    expect(workshopGroupLockedTip(save, ['hunting', 'cooking'])).toBe('完成主线「升到酋长 6 级（开放狩猎、集市）」后开启')
    expect(workshopGroupLockedTip(save, ['mining', 'inscription'])).toBe('完成主线「升到酋长 16 级（开放采矿）」后开启')
    unlockPlayableStations(save, 16)
    expect(workshopGroupLockedTip(save, ['mining', 'inscription'])).toBe('完成主线「升到酋长 18 级（开放铭刻、符文槽）」后开启')
    const huntingOpen = createSave()
    unlockPlayableStations(huntingOpen, 6)
    expect(workshopGroupLockedTip(huntingOpen, ['hunting', 'cooking'])).toBe('完成主线「升到酋长 8 级（开放烹饪、伙食、地牢）」后开启')
    expect(workshopGroupLockedTip(save, ['herbalism', 'alchemy'])).toBeNull()
  })

  it('blocks new assigns to locked stations and keeps existing crew', () => {
    const save = createSave()
    spawnWorker(save)
    spawnWorker(save)
    expect(assignIdleWorker(save, 'mining')).toEqual({
      ok: false,
      reason: '完成主线「升到酋长 16 级（开放采矿）」后开启',
    })
    expect(save.workers[0].assignment).toBeNull()
    expect(assignIdleWorker(save, 'hunting')).toEqual({
      ok: false,
      reason: '完成主线「升到酋长 6 级（开放狩猎、集市）」后开启',
    })
    expect(assignIdleWorker(save, 'alchemy').ok).toBe(false)
    expect(save.workers[0].assignment).toBeNull()

    expect(assignIdleWorker(save, 'herbalism').ok).toBe(true)
    expect(save.workers[0].assignment).toBe('herbalism')
    expect(assignWorker(save, save.workers[0].id, 'mining')).toEqual({
      ok: false,
      reason: '完成主线「升到酋长 16 级（开放采矿）」后开启',
    })
    expect(save.workers[0].assignment).toBe('herbalism')
    expect(assignWorker(save, save.workers[0].id, null).ok).toBe(true)
  })

  it('keeps bank and does not open stations from knight level alone', () => {
    const raw = createSave()
    raw.stations.herbalism.stationLevel = 6
    raw.knightLevel = 6
    delete (raw as { mainlineUnlockRev?: number }).mainlineUnlockRev
    raw.bank = { ore: 12, stim: 3 }
    raw.workers = []
    const loaded = hydrateLoadedSave(raw)
    expect(loaded?.knightLevel).toBe(6)
    expect(loaded?.bank.ore).toBe(12)
    expect(loaded?.bank.stim).toBe(3)
    expect(isStationUnlocked(loaded!, 'alchemy')).toBe(false)
    expect(isStationUnlocked(loaded!, 'hunting')).toBe(false)
    expect(isStationUnlocked(loaded!, 'cooking')).toBe(false)
  })
})
