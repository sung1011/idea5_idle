import { describe, expect, it } from 'vitest'
import { visualStationProgress } from './visualProgress'

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
})
