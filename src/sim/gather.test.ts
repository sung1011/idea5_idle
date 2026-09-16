import { afterEach, describe, expect, it } from 'vitest'
import { assignWorker } from './assign'
import { bankQty } from './bank'
import { createSave } from './createSave'
import {
  allowedFishingDrops,
  expectedGatherItemsPerSecond,
  isGatherFrozen,
  resolveFishingCatch,
  resolveHazard,
  resolveHerbalismDrop,
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

function unlockTo(save: Save, stationId: 'mining' | 'fishing' | 'hunting', level: number) {
  const station = save.stations[stationId]
  while (station.stationLevel < level) {
    grantStationXp(save, stationId, xpToNextLevel(station.stationLevel))
  }
}

afterEach(() => {
  setRollOverride(null)
})

describe('fishing drop table', () => {
  it('can roll empty, fish or junk and beginner never exceeds beginner', () => {
    expect(resolveFishingCatch('beginner', 0).outcome).toBe('empty')
    expect(resolveFishingCatch('beginner', 0.5)).toEqual({ outcome: 'fish', catchTier: 'beginner' })
    expect(resolveFishingCatch('beginner', 0.95)).toEqual({ outcome: 'junk', catchTier: 'beginner' })
    expect(allowedFishingDrops('beginner').every((row) => !row.catchTier || row.catchTier === 'beginner')).toBe(
      true,
    )
    for (let i = 0; i < 20; i++) {
      const caught = resolveFishingCatch('beginner', i / 20)
      if (caught.catchTier) expect(caught.catchTier).toBe('beginner')
    }
  })

  it('mid/high may roll lower tiers but never above the fishery wall', () => {
    const mid = resolveFishingCatch('mid', 0.9)
    if (mid.catchTier) expect(['beginner', 'mid']).toContain(mid.catchTier)
    const highFish = resolveFishingCatch('high', 0.88)
    expect(highFish.outcome).toBe('fish')
    expect(highFish.catchTier).toBe('high')
    expect(allowedFishingDrops('mid').every((row) => !row.catchTier || row.catchTier !== 'high')).toBe(true)
  })

  it('expected catch is slower than mining, herbalism and hunting', () => {
    const fishing = expectedGatherItemsPerSecond('fishing', 'copper')
    const fishingHigh = expectedGatherItemsPerSecond('fishing', 'mithril')
    expect(fishing).toBeLessThan(expectedGatherItemsPerSecond('mining', 'copper'))
    expect(fishing).toBeLessThan(expectedGatherItemsPerSecond('herbalism', 'default'))
    expect(fishing).toBeLessThan(expectedGatherItemsPerSecond('hunting', 'copper'))
    expect(fishingHigh).toBeLessThan(expectedGatherItemsPerSecond('hunting', 'copper'))
    expect(fishingHigh).toBeLessThan(expectedGatherItemsPerSecond('herbalism', 'default'))
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

describe('fishing settlement', () => {
  it('empty rod still finishes the cycle and grants XP', () => {
    setRollOverride(() => 0)
    const save = roster(1)
    assignWorker(save, save.workers[0].id, 'fishing')
    const next = ticks(save, 28)
    expect(bankQty(next, 'fish')).toBe(0)
    expect(bankQty(next, 'junk')).toBe(0)
    expect(next.stations.fishing.completed).toBe(1)
    expect(next.stations.fishing.stationXp).toBe(1)
    expect(next.stations.fishing.gatherNotice).toBe('空杆')
  })

  it('beginner fishery never deposits a higher-tier exclusive catch', () => {
    const save = roster(1)
    assignWorker(save, save.workers[0].id, 'fishing')
    setRollOverride(() => 0.5)
    const next = ticks(save, 28 * 8)
    expect(next.stations.fishing.selectedCategory).toBe('copper')
    expect(bankQty(next, 'fish')).toBeGreaterThan(0)
    expect(next.stations.fishing.gatherNotice).not.toContain('高级')
  })

  it('can switch to a mid fishery after unlock', () => {
    setRollOverride(() => 0.88)
    const save = roster(1)
    unlockTo(save, 'fishing', 5)
    expect(selectStationCategory(save, 'fishing', 'iron').ok).toBe(true)
    assignWorker(save, save.workers[0].id, 'fishing')
    const next = ticks(save, 32)
    expect(next.stations.fishing.completed).toBe(1)
    expect(bankQty(next, 'fish') + bankQty(next, 'junk')).toBe(1)
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
  })
})
