import { describe, expect, it } from 'vitest'
import { assignWorker } from './assign'
import { createSave } from './createSave'
import {
  ENRAGE_COOLDOWN_MS,
  ENRAGE_DURATION_MS,
  ENRAGE_SPEED_MUL,
  startStationEnrage,
  stationEnrageSpeedMul,
  stationEnrageStatus,
} from './enrage'
import { currentSpeed } from './query'
import { recruitWorker } from './recruit'
import { hydrateStations } from './stationProgress'

function roster() {
  const save = createSave()
  save.gold = 15
  expect(recruitWorker(save).ok).toBe(true)
  assignWorker(save, save.workers[0].id, 'mining')
  return save
}

describe('station enrage', () => {
  it('lasts 60s at 2.5x speed then cools down 300s per station', () => {
    const save = roster()
    const t0 = 9_000_000
    const bare = currentSpeed(save, 'mining', t0)
    expect(startStationEnrage(save, 'mining', t0)).toEqual({ ok: true, message: '狂暴开启' })
    expect(save.stations.mining.enrageUntil).toBe(t0 + ENRAGE_DURATION_MS)
    expect(save.stations.mining.enrageReadyAt).toBe(t0 + ENRAGE_DURATION_MS + ENRAGE_COOLDOWN_MS)
    expect(stationEnrageSpeedMul(save, 'mining', t0 + 1_000)).toBe(ENRAGE_SPEED_MUL)
    expect(currentSpeed(save, 'mining', t0 + 1_000)).toBeCloseTo(bare * ENRAGE_SPEED_MUL)
    expect(startStationEnrage(save, 'mining', t0 + 1_000).ok).toBe(false)
    expect(stationEnrageStatus(save, 'herbalism', t0 + 1_000).ready).toBe(true)

    const after = t0 + ENRAGE_DURATION_MS + 1
    expect(stationEnrageStatus(save, 'mining', after).active).toBe(false)
    expect(stationEnrageStatus(save, 'mining', after).ready).toBe(false)
    expect(stationEnrageSpeedMul(save, 'mining', after)).toBe(1)
    const cooling = startStationEnrage(save, 'mining', after)
    expect(cooling.ok).toBe(false)
    if (!cooling.ok) expect(cooling.reason).toContain('冷却')

    const readyAt = t0 + ENRAGE_DURATION_MS + ENRAGE_COOLDOWN_MS
    expect(stationEnrageStatus(save, 'mining', readyAt).ready).toBe(true)
    expect(startStationEnrage(save, 'mining', readyAt).ok).toBe(true)
  })

  it('hydrates missing enrage fields to null', () => {
    const stations = hydrateStations({
      mining: {
        progress: 0,
        stallReason: null,
        completed: 0,
        resonanceStreak: 0,
      },
    })
    expect(stations.mining.enrageUntil).toBeNull()
    expect(stations.mining.enrageReadyAt).toBeNull()
    expect(stations.mining.fatigueCombo).toEqual({ streak: 0, key: null, frustration: 0, fog: 0 })
  })
})
