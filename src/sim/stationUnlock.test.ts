import { describe, expect, it } from 'vitest'
import { assignIdleWorker, assignWorker } from './assign'
import { createSave } from './createSave'
import { spawnWorker } from './recruit'
import { PLAYABLE_STATION_IDS } from './tables'
import {
  STATION_UNLOCK_KNIGHT,
  isStationUnlocked,
  knightLevelOf,
  stationLockedTip,
  stationUnlockKnightLevel,
  unlockPlayableStations,
  unlockedStationIds,
} from './stationUnlock'
import { hydrateLoadedSave } from '../ui/saveGame'

describe('stationUnlock by knight level', () => {
  it('opens only herbalism at knight 1', () => {
    const save = createSave()
    expect(save.knightLevel).toBe(1)
    expect(unlockedStationIds(save)).toEqual(['herbalism'])
    expect(isStationUnlocked(save, 'herbalism')).toBe(true)
    expect(isStationUnlocked(save, 'alchemy')).toBe(false)
    expect(isStationUnlocked(save, 'forging')).toBe(false)
    expect(stationLockedTip('alchemy')).toBe('骑士 2 级开放')
    expect(stationUnlockKnightLevel('forging')).toBe(6)
    expect(STATION_UNLOCK_KNIGHT.mining).toBe(5)
  })

  it('unlocks later stations as knight level rises', () => {
    const save = createSave()
    save.knightLevel = 2
    expect(unlockedStationIds(save)).toEqual(['herbalism', 'alchemy'])
    save.knightLevel = 4
    expect(unlockedStationIds(save)).toEqual(['herbalism', 'alchemy', 'hunting', 'cooking'])
    unlockPlayableStations(save)
    expect(knightLevelOf(save)).toBe(PLAYABLE_STATION_IDS.length)
    expect(unlockedStationIds(save)).toEqual([...PLAYABLE_STATION_IDS])
  })

  it('blocks new assigns to locked stations and keeps existing crew', () => {
    const save = createSave()
    spawnWorker(save)
    spawnWorker(save)
    expect(assignIdleWorker(save, 'mining')).toEqual({
      ok: false,
      reason: '骑士 5 级开放',
    })
    expect(save.workers[0].assignment).toBeNull()
    expect(assignIdleWorker(save, 'alchemy')).toEqual({ ok: false, reason: '骑士 2 级开放' })

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
    expect(isStationUnlocked(loaded!, 'mining')).toBe(true)
    expect(isStationUnlocked(loaded!, 'forging')).toBe(false)
  })
})
