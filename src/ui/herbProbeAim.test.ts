import { describe, expect, it } from 'vitest'
import panel from './herbPvpPanel.vue?raw'
import { herbProbeAimAfterPlot, herbProbeAimOnOutside, nextHerbProbeAim } from './herbProbeAim'

describe('herb probe aim', () => {
  it('enters on the item, leaves after one successful use, and cancels on a second tap or outside', () => {
    let aim = nextHerbProbeAim(false, 3)
    expect(aim).toBe(true)
    aim = herbProbeAimAfterPlot(aim, false)
    expect(aim).toBe(true)
    aim = herbProbeAimAfterPlot(aim, true)
    expect(aim).toBe(false)
    expect(nextHerbProbeAim(false, 2)).toBe(true)

    aim = nextHerbProbeAim(false, 3)
    expect(nextHerbProbeAim(aim, 3)).toBe(false)
    expect(herbProbeAimOnOutside(true)).toBe(false)
    expect(herbProbeAimOnOutside(false)).toBe(false)
    expect(nextHerbProbeAim(true, 0)).toBe(false)
  })

  it('wires a single probe button that can leave aim mode', () => {
    expect(panel).toContain('nextHerbProbeAim')
    expect(panel).toContain('herbProbeAimAfterPlot')
    expect(panel).toContain('herbProbeAimOnOutside')
    expect(panel).toContain('侦测')
    expect(panel).not.toContain('1格')
    expect(panel).not.toContain('2格')
    expect(panel).not.toContain('4格')
  })
})