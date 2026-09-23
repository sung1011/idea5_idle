import { describe, expect, it } from 'vitest'
import encounter from './encounterPanel.vue?raw'
import sheet from './modeHelpSheet.vue?raw'
import pvp from './pvpPanel.vue?raw'
import { MODE_HELP, modeHelpIdForMainline, modeHelpOf } from './modeHelp'

describe('mode help', () => {
  it('writes the four modes from the current rules', () => {
    for (const help of Object.values(MODE_HELP)) {
      expect(help.rows.map((row) => row.label)).toEqual(['怎么玩', '规则要点', '注意'])
      expect(help.rows.every((row) => row.text.length > 0)).toBe(true)
    }
    const treasure = modeHelpOf('treasure').rows.map((row) => row.text).join('')
    expect(treasure).toContain('10 钻')
    expect(treasure).toContain('快照')
    expect(treasure).toContain('开采不装符文')
    expect(treasure).toContain('抢夺可以装')
    expect(treasure).toContain('不能再开')
    expect(treasure).not.toContain('影矿卫')
    const battle = modeHelpOf('battlefield').rows.map((row) => row.text).join('')
    expect(battle).toContain('探索')
    expect(battle).toContain('增援')
    expect(battle).toContain('1～3')
    const dungeon = modeHelpOf('dungeon').rows.map((row) => row.text).join('')
    expect(dungeon).toContain('两单')
    expect(dungeon).toContain('日切')
    expect(dungeon).toContain('5 人')
    const market = modeHelpOf('market').rows.map((row) => row.text).join('')
    expect(market).toContain('当铺')
    expect(market).toContain('限时')
    expect(market).toContain('奖励 ×2')
  })

  it('maps mainline tabs and unknown values onto a help id', () => {
    expect(modeHelpIdForMainline('battlefield')).toBe('battlefield')
    expect(modeHelpIdForMainline('dungeon')).toBe('dungeon')
    expect(modeHelpIdForMainline('market')).toBe('market')
    expect(modeHelpIdForMainline('mine')).toBe('battlefield')
  })

  it('opens the shared sheet from the tab row', () => {
    expect(sheet).toContain('class="mask"')
    expect(sheet).toContain('<dt>')
    expect(sheet).toContain('关闭')
    expect(sheet).toContain('role="dialog"')
    for (const source of [pvp, encounter]) {
      expect(source).toContain('aria-label="玩法说明"')
      expect(source).toContain('<ModeHelpSheet')
      expect(source).toContain('helpOpen')
    }
    expect(pvp).toContain("modeHelpOf('treasure')")
    expect(encounter).toContain('modeHelpIdForMainline(currentTab.value)')
  })
})
