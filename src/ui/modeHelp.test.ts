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
    expect(treasure).toContain('行军')
    expect(treasure).not.toContain('出征')
    expect(treasure).toContain('保留战斗中与我方开采')
    expect(treasure).not.toContain('我方开采工人回休息')
    expect(treasure).toContain('开采不装符文')
    expect(treasure).toContain('抢夺可以装')
    expect(treasure).not.toContain('快照')
    expect(treasure).not.toContain('联机')
    expect(treasure).not.toContain('NPC')
    expect(treasure).not.toContain('假玩家')
    expect(treasure).not.toContain('玩家名')
    expect(treasure).toContain('不能再开')
    expect(treasure).toContain('无人矿')
    expect(treasure).toContain('放弃')
    expect(treasure).toContain('洞种不同，掉落偏重不同')
    expect(treasure).toContain('一半没有守军')
    expect(treasure).toContain('揭开后一直留到这个洞消失')
    expect(treasure).toContain('自己的名字')
    expect(treasure).toContain('每洞都画储量条')
    expect(treasure).toContain('没人在采不画')
    expect(treasure).not.toContain('三分之一')
    expect(treasure).not.toContain('补采')
    expect(treasure).not.toContain('影矿卫')
    const battle = modeHelpOf('battlefield').rows.map((row) => row.text).join('')
    expect(battle).toContain('行军')
    expect(battle).not.toContain('出征')
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
