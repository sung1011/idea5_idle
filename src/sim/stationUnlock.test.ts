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
  it('opens only herbalism at knight 1', () => {
    const save = createSave()
    expect(save.knightLevel).toBe(1)
    expect(unlockedStationIds(save)).toEqual(['herbalism'])
    expect(isStationUnlocked(save, 'herbalism')).toBe(true)
    expect(isStationUnlocked(save, 'alchemy')).toBe(false)
    expect(isStationUnlocked(save, 'hunting')).toBe(false)
    expect(isStationUnlocked(save, 'inscription')).toBe(false)
    expect(stationLockedTip('alchemy')).toBe('骑士 2 级开放炼金')
    expect(stationLockedTip('hunting')).toBe('骑士 5 级开放狩猎')
    expect(stationUnlockKnightLevel('inscription')).toBe(10)
    expect(STATION_UNLOCK_KNIGHT).toEqual({
      herbalism: 1,
      alchemy: 2,
      hunting: 5,
      cooking: 8,
      mining: 8,
      inscription: 10,
    })
    expect(STATION_UNLOCK_KNIGHT_MAX).toBe(10)
  })

  it('unlocks later stations as knight level rises', () => {
    const save = createSave()
    save.knightLevel = 2
    expect(unlockedStationIds(save)).toEqual(['herbalism', 'alchemy'])
    save.knightLevel = 5
    expect(unlockedStationIds(save)).toEqual(['herbalism', 'alchemy', 'hunting'])
    save.knightLevel = 8
    expect(unlockedStationIds(save)).toEqual(['herbalism', 'alchemy', 'hunting', 'cooking', 'mining'])
    save.knightLevel = 9
    expect(unlockedStationIds(save)).toEqual(['herbalism', 'alchemy', 'hunting', 'cooking', 'mining'])
    save.knightLevel = 10
    expect(unlockedStationIds(save)).toEqual([...PLAYABLE_STATION_IDS])
    unlockPlayableStations(save)
    expect(knightLevelOf(save)).toBe(STATION_UNLOCK_KNIGHT_MAX)
    expect(unlockedStationIds(save)).toEqual([...PLAYABLE_STATION_IDS])
  })

  it('tips the next locked station in a workshop group', () => {
    const save = createSave()
    expect(nextLockedStation(save, ['hunting', 'cooking'])).toBe('hunting')
    expect(workshopGroupLockedTip(save, ['hunting', 'cooking'])).toBe('骑士 5 级开放狩猎')
    expect(workshopGroupLockedTip(save, ['mining', 'inscription'])).toBe('骑士 8 级开放采矿')
    save.knightLevel = 8
    expect(workshopGroupLockedTip(save, ['mining', 'inscription'])).toBe('骑士 10 级开放铭刻')
    save.knightLevel = 5
    expect(workshopGroupLockedTip(save, ['hunting', 'cooking'])).toBe('骑士 8 级开放烹饪')
    expect(workshopGroupLockedTip(save, ['herbalism', 'alchemy'])).toBeNull()
  })

  it('blocks new assigns to locked stations and keeps existing crew', () => {
    const save = createSave()
    spawnWorker(save)
    spawnWorker(save)
    expect(assignIdleWorker(save, 'mining')).toEqual({
      ok: false,
      reason: '骑士 8 级开放采矿',
    })
    expect(save.workers[0].assignment).toBeNull()
    expect(assignIdleWorker(save, 'hunting')).toEqual({ ok: false, reason: '骑士 5 级开放狩猎' })
    expect(assignIdleWorker(save, 'alchemy')).toEqual({ ok: false, reason: '骑士 2 级开放炼金' })

    expect(assignIdleWorker(save, 'herbalism').ok).toBe(true)
    expect(save.workers[0].assignment).toBe('herbalism')
    expect(assignWorker(save, save.workers[1].id, 'mining').ok).toBe(true)
    expect(assignWorker(save, save.workers[1].id, null).ok).toBe(true)
  })

  it('hydrates old saves by current knight level without stripping bank', () => {
    const raw = createSave()
    raw.stations.herbalism.stationLevel = 5
    raw.knightLevel = 5
    raw.bank = { ore: 12, stim: 3 }
    raw.workers = []
    const loaded = hydrateLoadedSave(raw)
    expect(loaded?.knightLevel).toBe(5)
    expect(loaded?.bank.ore).toBe(12)
    expect(loaded?.bank.stim).toBe(3)
    expect(isStationUnlocked(loaded!, 'hunting')).toBe(true)
    expect(isStationUnlocked(loaded!, 'cooking')).toBe(false)
    expect(isStationUnlocked(loaded!, 'mining')).toBe(false)
    expect(isStationUnlocked(loaded!, 'inscription')).toBe(false)
  })
})
