import { afterEach, describe, expect, it, vi } from 'vitest'
import { appTab } from './appNav'
import { pushFloatTip, useFloatTips } from './floatTips'
import {
  clearTreasureMineTips,
  noteTreasureDrop,
  pushTreasureMineTip,
  treasureMineTipList,
} from './treasureMineTips'
import panelSource from './treasureMinePanel.vue?raw'
import storeSource from './gameStore.ts?raw'

describe('treasure mine tips', () => {
  afterEach(() => {
    vi.useRealTimers()
    clearTreasureMineTips()
    useFloatTips().tips.value = []
    appTab.value = 'encounters'
  })

  it('stacks drops on that mine card and skips the global float tip', () => {
    pushTreasureMineTip('mine-1', '获得 砂金 ×1')
    pushTreasureMineTip('mine-1', '获得 珠宝 ×1')
    expect(treasureMineTipList('mine-1').map((tip) => tip.text)).toEqual(['获得 砂金 ×1', '获得 珠宝 ×1'])
    expect(treasureMineTipList('mine-2')).toEqual([])
    expect(useFloatTips().tips.value).toEqual([])
  })

  it('plays only while the PVP page is open', () => {
    appTab.value = 'workshop'
    noteTreasureDrop({ mineId: 'mine-1', item: 'sandGold', qty: 1 })
    expect(treasureMineTipList('mine-1')).toEqual([])

    appTab.value = 'pvp'
    noteTreasureDrop({ mineId: 'mine-1', item: 'jewel', qty: 1 })
    expect(treasureMineTipList('mine-1').map((tip) => tip.text)).toEqual(['获得 珠宝 ×1'])
    pushFloatTip('不应被夺宝占用', 'err')
    expect(useFloatTips().tips.value.map((tip) => tip.text)).toEqual(['不应被夺宝占用'])
  })

  it('anchors the tip layer on the mine card instead of the global floater', () => {
    expect(panelSource).toContain('<TreasureMineTips :mine-id="mine.id" />')
    expect(panelSource).toContain('class="card"')
    const card = panelSource.slice(panelSource.indexOf('<article'), panelSource.indexOf('</article>'))
    expect(card.indexOf('<TreasureMineTips')).toBeGreaterThan(-1)
    expect(storeSource).toContain('noteTreasureDrop(drop)')
    expect(storeSource).not.toContain('onTreasureDrop: (drop) => {\n        pushFloatTip')
  })
})