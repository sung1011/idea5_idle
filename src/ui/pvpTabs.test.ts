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
    const tags = mine.slice(mine.indexOf('class="tags"'), mine.indexOf('</span>', mine.indexOf('class="tags"')))
    expect(tags).toContain('class="affix-chip"')
    expect(tags).toContain('COMBAT_ATTR_LABEL[id]')
    expect(mine).toContain('消失倒计时 {{ clock(mine) }}')
    expect(mine).not.toContain('剩余 {{ clock(mine) }}')
    const chip = mine.slice(mine.indexOf('.affix-chip {'), mine.indexOf('.label {'))
    expect(chip).toMatch(/font-size:\s*12px/)
    expect(chip).toMatch(/padding:\s*1px 6px/)
    expect(chip).toMatch(/border:\s*1px solid/)
    expect(chip).toMatch(/background:\s*#fff8e8/)
    expect(chip).toMatch(/color:\s*var\(--ink\)/)
    expect(chip).toMatch(/font-weight:\s*700/)
    expect(chip).toMatch(/line-height:\s*1\.25/)
  })
})
