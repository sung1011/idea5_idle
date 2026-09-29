import { describe, expect, it } from 'vitest'
import { craftHaltText, craftProgressView, visualStationProgress, wrapCycleProgress } from './visualProgress'

const base = {
  progress: 0.2,
  speed: 0.2,
  stalled: false,
  assigned: 1,
  lastTick: 1000,
}

describe('visualStationProgress', () => {
  it('holds the real progress when idle or stalled', () => {
    expect(visualStationProgress({ ...base, assigned: 0, now: 1500 })).toBe(0.2)
    expect(visualStationProgress({ ...base, stalled: true, now: 1500 })).toBe(0.2)
    expect(visualStationProgress({ ...base, speed: 0, now: 1500 })).toBe(0.2)
  })

  it('interpolates with stationSpeed between ticks', () => {
    expect(visualStationProgress({ ...base, now: 1000 })).toBeCloseTo(0.2)
    expect(visualStationProgress({ ...base, now: 1500 })).toBeCloseTo(0.3)
    expect(visualStationProgress({ ...base, now: 2000 })).toBeCloseTo(0.4)
  })

  it('does not cross a full cycle before the sim wraps', () => {
    const value = visualStationProgress({
      ...base,
      progress: 0.9,
      speed: 0.2,
      now: 1800,
    })
    expect(value).toBe(0.999)
    expect(value).toBeLessThan(1)
  })

  it('wraps a craft cycle on real elapsed time instead of pinning at 99.9%', () => {
    const running = { ...base, wrap: true as const, progress: 0.8, speed: 0.2 }
    expect(visualStationProgress({ ...running, now: 1000 })).toBeCloseTo(0.8)
    expect(visualStationProgress({ ...running, now: 1500 })).toBeCloseTo(0.9)
    expect(visualStationProgress({ ...running, now: 2500 })).toBeCloseTo(0.1)
    expect(wrapCycleProgress(1)).toBe(0)
    expect(wrapCycleProgress(2.25)).toBeCloseTo(0.25)
    expect(wrapCycleProgress(-0.2)).toBe(0)
  })

  it('keeps a long absence on the real timeline when wrapping', () => {
    const value = visualStationProgress({
      ...base,
      wrap: true,
      progress: 0.1,
      speed: 0.05,
      lastTick: 0,
      now: 30_000,
    })
    expect(value).toBeCloseTo(0.6)
    expect(value).toBeLessThanOrEqual(1)
    expect(value).toBeGreaterThanOrEqual(0)
  })
})

describe('craftProgressView', () => {
  const running = {
    progress: 0.4,
    speed: 0.2,
    assigned: 1,
    paused: false,
    closed: false,
    lastTick: 1000,
    now: 1000,
  }

  it('moves with the current item and resets when that item finishes', () => {
    expect(craftProgressView(running).ratio).toBeCloseTo(0.4)
    expect(craftProgressView(running).percent).toBe(40)
    expect(craftProgressView(running).remainS).toBeCloseTo(3)
    const next = craftProgressView({ ...running, now: 4500 })
    expect(next.ratio).toBeCloseTo(0.1)
    expect(next.percent).toBe(10)
    expect(next.fillPct).toBeGreaterThanOrEqual(0)
    expect(next.fillPct).toBeLessThanOrEqual(100)
    expect(next.halted).toBe(false)
    expect(next.remainS).toBeCloseTo(4.5)
  })

  it('clamps a stalled or junk reading to 0–100%', () => {
    const over = craftProgressView({
      ...running,
      progress: 1.8,
      speed: 3,
      paused: true,
      now: 9000,
    })
    expect(over.halted).toBe(true)
    expect(over.ratio).toBe(1)
    expect(over.percent).toBe(100)
    expect(over.fillPct).toBe(100)

    const negative = craftProgressView({ ...running, progress: -2, assigned: 0, now: 8000 })
    expect(negative.ratio).toBe(0)
    expect(negative.percent).toBe(0)
    expect(negative.halt).toBe('empty')

    const junk = craftProgressView({
      ...running,
      progress: Number.NaN,
      speed: Number.NaN,
      lastTick: Number.NaN,
      now: Number.NaN,
    })
    expect(junk.percent).toBeGreaterThanOrEqual(0)
    expect(junk.percent).toBeLessThanOrEqual(100)
    expect(junk.ratio).toBe(0)
  })

  it('holds and names an empty post, a sealed empty post, and a pause', () => {
    const empty = craftProgressView({ ...running, assigned: 0, now: 4000 })
    expect(empty.halted).toBe(true)
    expect(empty.halt).toBe('empty')
    expect(empty.ratio).toBeCloseTo(0.4)
    expect(craftHaltText(empty.halt)).toBe('无苦工在岗')

    const sealed = craftProgressView({ ...running, assigned: 0, closed: true, progress: 0, now: 4000 })
    expect(sealed.halt).toBe('closed')
    expect(sealed.ratio).toBe(0)
    expect(craftHaltText(sealed.halt)).toBe('已封闭')

    const paused = craftProgressView({ ...running, paused: true, now: 4000 })
    expect(paused.halt).toBe('paused')
    expect(paused.ratio).toBeCloseTo(0.4)
    expect(craftHaltText(paused.halt, '草见底：采药空转')).toBe('草见底：采药空转')
    expect(craftHaltText(paused.halt, '  ')).toBe('暂停')

    const busySealed = craftProgressView({ ...running, closed: true, now: 3000 })
    expect(busySealed.halted).toBe(false)
    expect(busySealed.ratio).toBeCloseTo(0.8)
  })
})
