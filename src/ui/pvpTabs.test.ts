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
    expect(mine).toContain('aria-label="宝库"')
    expect(mine).toContain('刷新 {{ TREASURE_REFRESH_SAND_COST }} 砂金')
    expect(mine).toContain('刷新 {{ TREASURE_REFRESH_COST }} 钻')
    expect(mine).toContain("onRefresh('sandGold')")
    expect(mine).toContain("onRefresh('diamonds')")
    expect(mine).toContain('侦察 {{ TREASURE_SCOUT_COST }} 砂金')
    expect(mine).toContain('抢夺 {{ stakeOf(mine) }} 砂金')
    expect(mine).toContain('is-short')
    const tags = mine.slice(mine.indexOf('class="tags"'), mine.indexOf('</span>', mine.indexOf('class="tags"')))
    expect(tags).not.toContain('affix-chip')
    expect(tags).not.toContain('COMBAT_ATTR_LABEL')
    expect(tags).not.toContain('mine.weaknesses')
    expect(mine).toContain('class="weak"')
    expect(mine).toContain('<CombatAttrIcon')
    expect(mine).toContain('mineWeaknessSlots(mine)')
    expect(mine).toContain(':attr="slot"')
    expect(mine).not.toContain('affix-chip')
    expect(mine).toContain('消失倒计时 {{ clock(mine) }}')
    expect(mine).not.toContain('剩余 {{ clock(mine) }}')
  })
})
