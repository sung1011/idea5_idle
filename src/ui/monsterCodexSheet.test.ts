import { describe, expect, it } from 'vitest'
import source from './monsterCodexSheet.vue?raw'
import panel from './encounterPanel.vue?raw'

describe('monster codex sheet', () => {
  it('lists species, progress rewards, and shard exchange', () => {
    expect(source).toContain('怪物图鉴')
    expect(source).toContain('已点亮')
    expect(source).toContain('碎片兑换')
    expect(source).toContain('claimMonsterProgress')
    expect(source).toContain('exchangeMonsterShard')
    expect(source).toContain('row.how')
    expect(source).toContain('row.dropHint')
    expect(panel).toContain('MonsterCodexSheet')
    expect(panel).toContain('图鉴')
  })
})
