import { describe, expect, it } from 'vitest'
import panel from './herbPvpPanel.vue?raw'
import settings from './settingsPanel.vue?raw'

describe('herb stamina hud', () => {
  it('uses a stamina meter and moves the day countdown onto the board', () => {
    expect(panel).toContain('herbStaminaBubbleText')
    expect(panel).toContain('herbStaminaFill')
    expect(panel).toContain('距日结')
    expect(panel).toContain('staminaOpen')
    expect(panel).not.toContain('后 +1')
    expect(panel).not.toContain('第 {{ hud.rank }}')
    expect(panel).not.toContain('日结 {{ formatHerbDuration')
    expect(panel).toContain('上次日结')
    expect(settings).toContain('割草满体力')
    expect(settings).toContain('gmFillHerbStamina')
  })
})
