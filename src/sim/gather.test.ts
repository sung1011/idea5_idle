import { afterEach, describe, expect, it } from 'vitest'
import { assignWorker } from './assign'
import { bankQty } from './bank'
import { createSave } from './createSave'
import {
  expectedGatherItemsPerSecond,
  isGatherFrozen,
  resolveHazard,
  resolveHerbalismDrop,
  resolveHuntingSideDrop,
} from './gather'
import { recruitWorker } from './recruit'
import { setRollOverride } from './rng'
import { grantStationXp, selectStationCategory } from './stationProgress'
import { HUNTING_HAZARD_PAUSE_S, xpToNextLevel } from './tables'
import { ticks } from './tick'
import type { Save } from './types'

function roster(n: number): Save {
  const save = createSave()
  save.gold = 15 * n
  for (let i = 0; i < n; i++) expect(recruitWorker(save).ok).toBe(true)
  return save
}

function unlockTo(save: Save, stationId: 'mining' | 'hunting', level: number) {
  const station = save.stations[stationId]
  while (station.stationLevel < level) {
    grantStationXp(save, stationId, xpToNextLevel(station.stationLevel))
  }
}

afterEach(() => {
  setRollOverride(null)
})

describe('hunting side drop', () => {
  it('keeps junk as a low-weight extra and otherwise drops nothing', () => {
    expect(resolveHuntingSideDrop(0)).toBe('junk')
    expect(resolveHuntingSideDrop(0.5)).toBeNull()
    expect(resolveHuntingSideDrop(0.9)).toBeNull()
    expect(expectedGatherItemsPerSecond('hunting', 'copper')).toBeGreaterThan(
      expectedGatherItemsPerSecond('mining', 'copper'),
    )
  })
})

describe('herbalism drops', () => {
  it('always yields herb or spice and never empty', () => {
    expect(resolveHerbalismDrop(0.1)).toBe('herb')
    expect(resolveHerbalismDrop(0.85)).toBe('spice')
    for (let i = 0; i < 30; i++) {
      expect(['herb', 'spice']).toContain(resolveHerbalismDrop(i / 30))
    }
  })
})

describe('hunting hazard roll', () => {
  it('treats the roll as safe capture or hazard without combat fields', () => {
    expect(resolveHazard(0.12, 0.01)).toEqual({ chance: 0.12, outcome: 'hazard' })
    expect(resolveHazard(0.12, 0.5)).toEqual({ chance: 0.12, outcome: 'ok' })
    const roll = resolveHazard(0.22, 0.2)
    expect(roll.outcome === 'ok' || roll.outcome === 'hazard').toBe(true)
    expect(roll).not.toHaveProperty('damage')
  })
})

describe('mining node recover', () => {
  it('depletes copper, blocks that vein, and allows switching to iron', () => {
    const save = roster(1)
    unlockTo(save, 'mining', 5)
    assignWorker(save, save.workers[0].id, 'mining')
    save.workers[0].hpMax = 10_000
    save.workers[0].hp = 10_000
    const depleted = ticks(save, 20 * 20)
    expect(bankQty(depleted, 'ore')).toBe(20)
    expect(depleted.stations.mining.miningNode?.nodeHp).toBe(0)
    expect(depleted.stations.mining.miningNode?.recoverAt).toBe(400 + 60)
    expect(isGatherFrozen(depleted, 'mining')).toBe(true)

    const stillBlocked = ticks(depleted, 10)
    expect(bankQty(stillBlocked, 'ore')).toBe(20)
    expect(stillBlocked.stations.mining.completed).toBe(20)

    expect(selectStationCategory(stillBlocked, 'mining', 'iron').ok).toBe(true)
    expect(isGatherFrozen(stillBlocked, 'mining')).toBe(false)
    const switched = ticks(stillBlocked, 24)
    expect(bankQty(switched, 'ironOre')).toBe(1)
    expect(switched.stations.mining.miningNodes?.copper?.recoverAt).not.toBeNull()

    const recovered = ticks(switched, 60)
    expect(recovered.stations.mining.miningNodes?.copper?.recoverAt).toBeNull()
    expect(recovered.stations.mining.miningNodes?.copper?.nodeHp).toBe(20)
    expect(selectStationCategory(recovered, 'mining', 'copper').ok).toBe(true)
    const again = ticks(recovered, 20)
    expect(bankQty(again, 'ore')).toBe(21)
  })
})

describe('hunting fish goods', () => {
  it('safe capture now also deposits former fishing goods', () => {
    setRollOverride(() => 0.5)
    const save = roster(1)
    assignWorker(save, save.workers[0].id, 'hunting')
    const next = ticks(save, 24)
    expect(bankQty(next, 'meat')).toBe(1)
    expect(bankQty(next, 'fish')).toBe(1)
    expect(bankQty(next, 'junk')).toBe(0)
    expect(next.stations.hunting.completed).toBe(1)
    expect(next.stations.hunting.gatherNotice).toContain('安全捕获')
  })
})

describe('herbalism settlement', () => {
  it('never depletes and can produce spice for cooking', () => {
    setRollOverride(() => 0.85)
    const save = roster(1)
    assignWorker(save, save.workers[0].id, 'herbalism')
    const next = ticks(save, 40)
    expect(next.stations.herbalism.completed).toBe(2)
    expect(next.stations.herbalism.miningNode).toBeUndefined()
    expect(bankQty(next, 'spice')).toBe(2)
    expect(bankQty(next, 'herb')).toBe(0)
    expect(isGatherFrozen(next, 'herbalism')).toBe(false)
  })
})

describe('hunting settlement', () => {
  it('safe capture deposits meat and alchemy parts', () => {
    setRollOverride(() => 0.9)
    const save = roster(1)
    unlockTo(save, 'hunting', 10)
    expect(selectStationCategory(save, 'hunting', 'mithril').ok).toBe(true)
    assignWorker(save, save.workers[0].id, 'hunting')
    const next = ticks(save, 24)
    expect(bankQty(next, 'meat')).toBe(1)
    expect(bankQty(next, 'fish')).toBe(1)
    expect(bankQty(next, 'blood')).toBe(1)
    expect(bankQty(next, 'eye')).toBe(1)
    expect(next.stations.hunting.gatherNotice).toContain('安全捕获')
    expect(next.stations.hunting.gatherPauseUntil).toBeNull()
  })

  it('hazard drops this cycle, pauses briefly and may consume a meal', () => {
    setRollOverride(() => 0)
    const save = roster(1)
    save.bank.meal = 1
    assignWorker(save, save.workers[0].id, 'hunting')
    const next = ticks(save, 24)
    expect(bankQty(next, 'meat')).toBe(0)
    expect(bankQty(next, 'fish')).toBe(0)
    expect(bankQty(next, 'meal')).toBe(0)
    expect(next.stations.hunting.completed).toBe(1)
    expect(next.stations.hunting.stationXp).toBe(1)
    expect(next.stations.hunting.gatherNotice).toContain('遇险')
    expect(next.stations.hunting.gatherPauseUntil).toBe(24 + HUNTING_HAZARD_PAUSE_S)
    expect(isGatherFrozen(next, 'hunting')).toBe(true)

    const paused = ticks(next, 4)
    expect(bankQty(paused, 'meat')).toBe(0)
    expect(paused.stations.hunting.completed).toBe(1)

    setRollOverride(() => 0.9)
    const resumed = ticks(paused, HUNTING_HAZARD_PAUSE_S + 24)
    expect(isGatherFrozen(resumed, 'hunting')).toBe(false)
    expect(bankQty(resumed, 'meat')).toBe(1)
    expect(bankQty(resumed, 'fish')).toBe(1)
  })
})
