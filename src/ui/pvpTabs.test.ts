import { describe, expect, it } from 'vitest'
import panel from './pvpPanel.vue?raw'
import mine from './treasureMinePanel.vue?raw'

describe('pvp treasure tab', () => {
  it('shows a single 夺宝 tab in the PVE-style strip', () => {
    expect(panel).toContain('aria-label="PVP分页"')
    expect(panel).toContain('class="sub"')
    expect(panel).toContain('夺宝')
    expect(panel).toContain('<TreasureMinePanel')
    expect(mine).toContain('class="tags"')
    expect(mine).toContain('class="board"')
  })
})
