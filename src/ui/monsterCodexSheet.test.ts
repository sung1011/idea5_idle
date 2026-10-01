import { describe, expect, it } from 'vitest'
import source from './monsterCodexSheet.vue?raw'
import panel from './encounterPanel.vue?raw'

describe('monster codex sheet', () => {
  it('splits list and exchange into tabs, and shows unlock copy on locked rows', () => {
    expect(source).toContain('怪物图鉴')
    expect(source).toContain('已点亮')
    expect(source).toContain('碎片兑换')
    expect(source).toContain('claimMonsterProgress')
    expect(source).toContain('exchangeMonsterShard')
    expect(source).toContain("tab === 'list'")
    expect(source).toContain("tab === 'exchange'")
    expect(source).toContain('>图鉴<')
    expect(source).toContain('>兑换<')
    expect(source).toContain('row.label')
    expect(source).toContain('row.how')
    expect(source).toContain('row.dropHint')
    expect(source).not.toContain('???')
    expect(source).not.toContain('订单金钻仍只看')
    expect(panel).toContain('MonsterCodexSheet')
    expect(panel).toContain('图鉴')
  })
})
