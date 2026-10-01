import { describe, expect, it } from 'vitest'
import {
  MONSTER_FIRST_LIGHT_DIAMONDS,
  MONSTER_PROGRESS,
  MONSTER_SHARD_EXCHANGE_COST,
  MONSTER_TITLE_MASTER,
  MONSTER_TITLE_WIDE,
} from '../sim/monsterCodex'
import { MONSTER_CODEX_HELP_ROWS, MONSTER_CODEX_HELP_TITLE } from './monsterCodexHelp'
import sheetSource from './monsterCodexSheet.vue?raw'

describe('monster codex help', () => {
  it('explains lighting, exchange, and progress in oral copy', () => {
    expect(MONSTER_CODEX_HELP_TITLE).toBe('怪物图鉴')
    expect(MONSTER_CODEX_HELP_ROWS.map((row) => row.label)).toEqual(['怎么玩', '规则要点', '注意'])
    const text = MONSTER_CODEX_HELP_ROWS.map((row) => row.text).join('')
    expect(text).toContain('点 PVE')
    expect(text).toContain('图鉴')
    expect(text).toContain('点亮')
    expect(text).toContain('悬赏')
    expect(text).toContain('集市')
    expect(text).toContain('地牢')
    expect(text).toContain('地精铜矿当')
    expect(text).toContain('首领')
    expect(text).toContain(`${MONSTER_FIRST_LIGHT_DIAMONDS} 钻`)
    expect(text).toContain('牙饰')
    expect(text).toContain('兽纹布')
    expect(text).toContain(`凑 ${MONSTER_SHARD_EXCHANGE_COST}`)
    expect(text).toContain('营地旗')
    expect(text).toContain(String(MONSTER_PROGRESS[0]?.need ?? 5))
    expect(text).toContain(MONSTER_TITLE_WIDE)
    expect(text).toContain(MONSTER_TITLE_MASTER)
    expect(text).toContain('另一个页签')
    expect(text).not.toContain('存档')
    expect(text).not.toContain('hydrate')
    expect(text).not.toContain('lootGold')
    expect(text).not.toContain('订单金钻')
  })

  it('puts the question mark in the sheet header and opens ModeHelpSheet', () => {
    expect(sheetSource).toContain('<HelpMark')
    expect(sheetSource).toContain('<ModeHelpSheet')
    expect(sheetSource).toContain('MONSTER_CODEX_HELP_TITLE')
    expect(sheetSource).toContain('MONSTER_CODEX_HELP_ROWS')
    expect(sheetSource.indexOf('<HelpMark')).toBeLessThan(sheetSource.indexOf('class="close"'))
  })
})
