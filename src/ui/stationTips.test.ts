import { afterEach, describe, expect, it, vi } from 'vitest'
import { pushFloatTip, useFloatTips } from './floatTips'
import { clearStationTips, pushCycleGain, pushStationTip, stationTipList } from './stationTips'

describe('stationTips', () => {
  afterEach(() => {
    vi.useRealTimers()
    clearStationTips()
    useFloatTips().tips.value = []
  })

  it('pins 虚弱 to the producing station when workers are worn down', () => {
    pushCycleGain({
      stationId: 'mining',
      lots: [{ itemId: 'ore', qty: 1 }],
      notice: '矿脉 4/5',
      weak: true,
    })
    expect(stationTipList('mining').map((tip) => tip.text)).toEqual(['获得 铜矿 ×1', '虚弱'])
    expect(useFloatTips().tips.value).toEqual([])
  })

  it('keeps 获得 on the producing station and does not use global floatTips', () => {
    pushCycleGain({
      stationId: 'mining',
      lots: [{ itemId: 'ore', qty: 1 }],
      notice: '矿脉 4/5',
    })
    expect(stationTipList('mining').map((tip) => tip.text)).toEqual(['获得 铜矿 ×1'])
    expect(stationTipList('forging')).toEqual([])
    expect(useFloatTips().tips.value).toEqual([])
  })

  it('merges workshop gold into the station 获得 tip', () => {
    pushCycleGain({
      stationId: 'forging',
      lots: [{ itemId: 'tool', qty: 1 }],
      notice: '锻成初级工具',
      gold: 2,
    })
    expect(stationTipList('forging').map((tip) => tip.text)).toEqual(['获得 初级工具 ×1、金币 +2'])
    expect(useFloatTips().tips.value).toEqual([])
  })

  it('pins hazard / soft-fail notices to that station', () => {
    pushCycleGain({ stationId: 'hunting', lots: [], notice: '遇险，短暂停手' })
    pushCycleGain({ stationId: 'forging', lots: [], notice: '软失败，矿石损耗' })
    expect(stationTipList('hunting').map((tip) => ({ text: tip.text, kind: tip.kind }))).toEqual([
      { text: '遇险，短暂停手', kind: 'err' },
    ])
    expect(stationTipList('forging').map((tip) => ({ text: tip.text, kind: tip.kind }))).toEqual([
      { text: '软失败，矿石损耗', kind: 'err' },
    ])
    expect(stationTipList('mining')).toEqual([])
    expect(useFloatTips().tips.value).toEqual([])
  })

  it('drops station tips after the fade and still leaves global intercepts alone', () => {
    vi.useFakeTimers()
    pushStationTip('mining', '获得 铜矿 ×1', 'ok')
    pushFloatTip('金币不足', 'err')
    expect(stationTipList('mining')).toHaveLength(1)
    expect(useFloatTips().tips.value.map((tip) => tip.text)).toEqual(['金币不足'])
    vi.advanceTimersByTime(1400)
    expect(stationTipList('mining')).toEqual([])
    expect(useFloatTips().tips.value).toEqual([])
  })

  it('ignores blank station text', () => {
    pushStationTip('mining', '   ')
    pushCycleGain({ stationId: 'hunting', lots: [], notice: '' })
    expect(stationTipList('mining')).toEqual([])
    expect(stationTipList('hunting')).toEqual([])
  })
})
