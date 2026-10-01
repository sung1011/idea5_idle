import { describe, expect, it } from 'vitest'
import {
  FUSE_JACKPOT_RATE_HIGH,
  FUSE_JACKPOT_RATE_LOW,
  FUSE_JACKPOT_RATE_MID,
} from '../sim/fuse'
import { CAMP_HELP_ROWS, CAMP_HELP_TITLE } from './campHelp'
import sheetSource from './campSheet.vue?raw'

describe('camp help', () => {
  it('explains the queue, a guaranteed tier, and the jackpot bands', () => {
    expect(CAMP_HELP_TITLE).toBe('营地')
    expect(CAMP_HELP_ROWS.map((row) => row.label)).toEqual(['怎么玩', '规则要点', '注意'])
    const text = CAMP_HELP_ROWS.map((row) => row.text).join('')
    expect(text).toContain('点营地')
    expect(text).toContain('队首')
    expect(text).toContain('堵队')
    expect(text).toContain('队尾')
    expect(text).toContain('同品质')
    expect(text).toContain('拖到一起')
    expect(text).toContain('一定升一阶')
    expect(text).toContain('虚弱')
    expect(text).toContain('一点血')
    expect(text).toContain('回满才能派')
    expect(text).toContain('大成功合出来的人同样虚弱')
    expect(text).toContain('大成功')
    expect(text).toContain('再跳一阶')
    expect(text).toContain(`大约 ${Math.round(FUSE_JACKPOT_RATE_LOW * 100)}%`)
    expect(text).toContain(`大约 ${Math.round(FUSE_JACKPOT_RATE_MID * 100)}%`)
    expect(text).toContain(`大约 ${Math.round(FUSE_JACKPOT_RATE_HIGH * 100)}%`)
    expect(text).toContain('白、绿')
    expect(text).toContain('蓝、青、紫、橙')
    expect(text).toContain('粉、红')
    expect(text).toContain('不再跳')
    expect(text).toContain('彩不能再合')
    expect(text).not.toContain('工人')
    expect(text).not.toContain('品质档')
    expect(text).not.toContain('概率')
  })

  it('puts the question mark to the left of the camp close button', () => {
    const helpAt = sheetSource.indexOf('class="camp-help"')
    const closeAt = sheetSource.indexOf('class="close"')
    expect(helpAt).toBeGreaterThan(0)
    expect(closeAt).toBeGreaterThan(helpAt)
    expect(sheetSource).toContain('aria-label="营地说明"')
    expect(sheetSource).toContain('>？</button>')
    expect(sheetSource).toContain('CAMP_HELP_TITLE')
    expect(sheetSource).toContain('CAMP_HELP_ROWS')
    expect(sheetSource).toContain('<ModeHelpSheet')
    const helpCss = sheetSource.slice(sheetSource.indexOf('.camp-help {'), sheetSource.indexOf('.close {'))
    const closeCss = sheetSource.slice(sheetSource.indexOf('.close {'), sheetSource.indexOf('.close svg'))
    const helpRight = Number(helpCss.match(/right:\s*(\d+)px/)?.[1])
    const closeRight = Number(closeCss.match(/right:\s*(\d+)px/)?.[1])
    expect(helpRight).toBeGreaterThan(closeRight)
  })
})