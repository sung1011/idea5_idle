import { describe, expect, it } from 'vitest'
import {
  ATK_INTERVAL_JITTER_CEIL_S,
  ATK_INTERVAL_JITTER_FLOOR_S,
  ATK_INTERVAL_JITTER_MAX,
  ATK_INTERVAL_JITTER_MIN,
  jitterWorkerAtkInterval,
  workerAtkIntervalJitterMul,
} from './atkInterval'
import { workerCombatStats, workerLiveStats } from './combat'
import { createSave } from './createSave'
import { spawnWorkerWith } from './recruit'

describe('worker attack interval jitter', () => {
  it('uses a stable hash from worker id in the ±8%–12% band', () => {
    const a = workerAtkIntervalJitterMul('w-1')
    const b = workerAtkIntervalJitterMul('w-2')
    expect(a).toBe(workerAtkIntervalJitterMul('w-1'))
    expect(Math.abs(a - 1)).toBeGreaterThanOrEqual(ATK_INTERVAL_JITTER_MIN - 1e-9)
    expect(Math.abs(a - 1)).toBeLessThanOrEqual(ATK_INTERVAL_JITTER_MAX + 1e-9)
    expect(a).not.toBe(b)
  })

  it('clamps the jittered interval and keeps display combat stats in sync', () => {
    expect(jitterWorkerAtkInterval(5, 'w-1')).toBe(
      Math.round(5 * workerAtkIntervalJitterMul('w-1') * 100) / 100,
    )
    expect(jitterWorkerAtkInterval(0.2, 'w-1')).toBe(ATK_INTERVAL_JITTER_FLOOR_S)
    expect(jitterWorkerAtkInterval(40, 'w-1')).toBeLessThanOrEqual(ATK_INTERVAL_JITTER_CEIL_S)

    const save = createSave()
    const worker = spawnWorkerWith(save, 1, 'laborer')
    const base = workerCombatStats(1, 'laborer', 1)
    const live = workerLiveStats(worker)
    expect(live.hp).toBe(base.hp)
    expect(live.atk).toBe(base.atk)
    expect(live.spd).toBe(jitterWorkerAtkInterval(base.spd, worker.id))
    expect(workerLiveStats(worker).spd).toBe(live.spd)
  })
})
