import { describe, expect, it } from 'vitest'
import panel from './beastPvpPanel.vue?raw'

describe('困兽战斗按钮', () => {
  it('畏缩和打断、闪避并排，并显示倒计时', () => {
    expect(panel).toContain('>打断</ActButton>')
    expect(panel).toContain('>闪避</ActButton>')
    expect(panel).toContain('>畏缩</ActButton>')
    expect(panel).toContain('class="cower"')
    expect(panel).toContain('cowerSec')
    expect(panel).toContain('受到的伤害 -50%')
    expect(panel).toContain('打出的伤害 -30%')
    expect(panel).toContain('grid-template-columns: 1fr 1fr 1fr')
  })
})
