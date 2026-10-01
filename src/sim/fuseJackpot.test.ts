import { afterEach, describe, expect, it } from 'vitest'
import { createSave } from './createSave'
import {
  FUSE_JACKPOT_RATE_BY_TIER,
  FUSE_JACKPOT_RATE_HIGH,
  FUSE_JACKPOT_RATE_LOW,
  FUSE_JACKPOT_RATE_MID,
  fuseJackpotRate,
  fuseWorkers,
} from './fuse'
import { spawnWorkerWith } from './recruit'
import { setRollOverride } from './rng'
import { QUALITY_MAX, QUALITY_TIERS } from './tables'
import type { QualityTier, Save } from './types'
import fuseSource from './fuse.ts?raw'

afterEach(() => {
  setRollOverride(null)
})

function pairAt(tier: QualityTier): Save {
  const save = createSave()
  spawnWorkerWith(save, tier, 'laborer')
  spawnWorkerWith(save, tier, 'laborer')
  return save
}

function fuseAt(tier: QualityTier, roll: number) {
  const save = pairAt(tier)
  setRollOverride(() => roll)
  const result = fuseWorkers(save, save.workers[0].id, save.workers[1].id)
  return { save, result }
}

describe('fuse jackpot', () => {
  it('always rises exactly one tier when the extra roll misses', () => {
    for (const tier of QUALITY_TIERS) {
      if (tier >= QUALITY_MAX) continue
      const { save, result } = fuseAt(tier, 0.99)
      expect(result.ok).toBe(true)
      if (!result.ok) continue
      expect(result.fuseJackpot).toBeUndefined()
      expect(save.workers).toHaveLength(1)
      expect(save.workers[0].qualityTier).toBe(tier + 1)
      expect(save.workers[0].hp).toBe(1)
      expect(result.message).toMatch(/^合成出/)
    }
  })

  it('jumps one more tier when the extra roll hits', () => {
    for (const tier of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
      const { save, result } = fuseAt(tier, 0)
      expect(result.ok).toBe(true)
      if (!result.ok) continue
      expect(result.fuseJackpot).toBe(true)
      expect(save.workers).toHaveLength(1)
      expect(save.workers[0].qualityTier).toBe(tier + 2)
      expect(save.workers[0].hp).toBe(1)
    }
  })

  it('does not roll or jump when the guaranteed tier is already the cap', () => {
    const calls: number[] = []
    const save = pairAt(9)
    setRollOverride(() => {
      calls.push(1)
      return 0
    })
    const result = fuseWorkers(save, save.workers[0].id, save.workers[1].id)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.fuseJackpot).toBeUndefined()
    expect(save.workers[0].qualityTier).toBe(QUALITY_MAX)
    expect(calls.length).toBe(3)
  })

  it('keeps the rate table and uses each band', () => {
    expect(FUSE_JACKPOT_RATE_LOW).toBe(0.12)
    expect(FUSE_JACKPOT_RATE_MID).toBe(0.08)
    expect(FUSE_JACKPOT_RATE_HIGH).toBe(0.03)
    expect(FUSE_JACKPOT_RATE_BY_TIER).toEqual({
      1: FUSE_JACKPOT_RATE_LOW,
      2: FUSE_JACKPOT_RATE_LOW,
      3: FUSE_JACKPOT_RATE_MID,
      4: FUSE_JACKPOT_RATE_MID,
      5: FUSE_JACKPOT_RATE_MID,
      6: FUSE_JACKPOT_RATE_MID,
      7: FUSE_JACKPOT_RATE_HIGH,
      8: FUSE_JACKPOT_RATE_HIGH,
      9: null,
      10: null,
    })
    expect(fuseJackpotRate(1)).toBe(FUSE_JACKPOT_RATE_LOW)
    expect(fuseJackpotRate(2)).toBe(FUSE_JACKPOT_RATE_LOW)
    expect(fuseJackpotRate(4)).toBe(FUSE_JACKPOT_RATE_MID)
    expect(fuseJackpotRate(6)).toBe(FUSE_JACKPOT_RATE_MID)
    expect(fuseJackpotRate(7)).toBe(FUSE_JACKPOT_RATE_HIGH)
    expect(fuseJackpotRate(8)).toBe(FUSE_JACKPOT_RATE_HIGH)
    expect(fuseJackpotRate(9)).toBeNull()
    expect(fuseJackpotRate(10)).toBeNull()
    expect(fuseSource).toContain('fuseJackpotRate(')
    expect(fuseSource).toContain('FUSE_JACKPOT_RATE_BY_TIER')

    const lowHit = fuseAt(1, FUSE_JACKPOT_RATE_LOW - 0.001)
    expect(lowHit.result.ok && lowHit.result.fuseJackpot).toBe(true)
    expect(lowHit.save.workers[0].qualityTier).toBe(3)

    const lowMiss = fuseAt(2, FUSE_JACKPOT_RATE_LOW)
    expect(lowMiss.result.ok && lowMiss.result.fuseJackpot).toBeUndefined()
    expect(lowMiss.save.workers[0].qualityTier).toBe(3)

    const midMiss = fuseAt(4, FUSE_JACKPOT_RATE_LOW - 0.001)
    expect(midMiss.save.workers[0].qualityTier).toBe(5)
    const midHit = fuseAt(5, FUSE_JACKPOT_RATE_MID - 0.001)
    expect(midHit.save.workers[0].qualityTier).toBe(7)

    const highMiss = fuseAt(8, FUSE_JACKPOT_RATE_MID - 0.001)
    expect(highMiss.save.workers[0].qualityTier).toBe(9)
    const highHit = fuseAt(7, FUSE_JACKPOT_RATE_HIGH - 0.001)
    expect(highHit.save.workers[0].qualityTier).toBe(9)
  })
})
