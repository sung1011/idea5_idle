import { describe, expect, it } from 'vitest'
import { actIntervalMs } from '../sim/combat'
import { actChargeFill, actChargeStunned } from './actCharge'

describe('actChargeFill', () => {
  it('uses the same interval as stepEnemyCombat and refills after a swing', () => {
    const spd = 5
    const interval = actIntervalMs(spd)
    expect(interval).toBe(5_000)
    const swingAt = 10_000
    expect(actChargeFill(spd, swingAt, swingAt)).toBe(1)
    expect(actChargeFill(spd, swingAt, swingAt - 1)).toBeCloseTo(1 - 1 / interval)

    const next = swingAt + interval
    expect(actChargeFill(spd, next, swingAt)).toBe(0)
    expect(actChargeFill(spd, next, swingAt + interval / 2)).toBeCloseTo(0.5)
    expect(actChargeFill(spd, next, next)).toBe(1)
  })

  it('stays empty until the last full interval, then caps at the swing', () => {
    const spd = 4
    const interval = actIntervalMs(spd)
    const nextActAt = 40_000
    expect(actChargeFill(spd, nextActAt, nextActAt - interval - 1)).toBe(0)
    expect(actChargeFill(spd, nextActAt, nextActAt - interval)).toBe(0)
    expect(actChargeFill(spd, nextActAt, nextActAt + 500)).toBe(1)
  })

  it('floors the interval at 1s for non-positive spd and rejects dirty clocks', () => {
    expect(actIntervalMs(0)).toBe(1_000)
    expect(actIntervalMs(-3)).toBe(1_000)
    expect(actChargeFill(0, 2_000, 1_000)).toBe(0)
    expect(actChargeFill(0, 2_000, 1_500)).toBeCloseTo(0.5)
    expect(actChargeFill(Number.NaN, 2_000, 1_000)).toBe(0)
    expect(actChargeFill(5, Number.NaN, 1_000)).toBe(0)
    expect(actChargeFill(5, 2_000, Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('grays a stun without changing the fill toward the delayed swing', () => {
    const spd = 10
    const interval = actIntervalMs(spd)
    const stunUntil = 54_000
    const nextActAt = stunUntil
    expect(actChargeStunned(stunUntil, stunUntil - 1)).toBe(true)
    expect(actChargeStunned(stunUntil, stunUntil)).toBe(false)
    expect(actChargeStunned(null, stunUntil - 1)).toBe(false)
    expect(actChargeStunned(undefined, stunUntil - 1)).toBe(false)

    const during = stunUntil - 3_000
    expect(actChargeFill(spd, nextActAt, during)).toBeCloseTo(1 - 3_000 / interval)
    expect(actChargeFill(spd, nextActAt, stunUntil)).toBe(1)
  })
})
