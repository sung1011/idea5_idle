import { afterEach, describe, expect, it } from 'vitest'
import { assignWorker } from './assign'
import { bankQty } from './bank'
import { createSave } from './createSave'
import { formatCycleTip, formatGainTip, mergeLots, type CycleGain } from './gains'
import { recruitWorker } from './recruit'
import { setRollOverride } from './rng'
import { completeCycle } from './stations'
import { grantStationXp, selectStationCategory } from './stationProgress'
import { xpToNextLevel } from './tables'
import { ticks } from './tick'

function roster(n: number) {
  const save = createSave()
  save.gold = 15 * n
  for (let i = 0; i < n; i++) expect(recruitWorker(save).ok).toBe(true)
  return save
}

function unlockHuntingDeer(save: ReturnType<typeof createSave>) {
  const station = save.stations.hunting
  while (station.stationLevel < 10) {
    grantStationXp(save, 'hunting', xpToNextLevel(station.stationLevel))
  }
  expect(selectStationCategory(save, 'hunting', 'mithril').ok).toBe(true)
}

function collectGain(save: ReturnType<typeof createSave>, stationId: Parameters<typeof completeCycle>[1]) {
  const events: CycleGain[] = []
  const ok = completeCycle(save, stationId, Date.now(), (gain) => {
    events.push(gain)
  })
  return {
    ok,
    events,
    tips: events.map((gain) => formatCycleTip(gain)?.text).filter((text): text is string => !!text),
  }
}

afterEach(() => {
  setRollOverride(null)
})

describe('formatGainTip', () => {
  it('merges one throughput into a single 获得 line', () => {
    expect(formatGainTip([{ itemId: 'ore', qty: 1 }])).toBe('获得 铜矿 ×1')
    expect(
      formatGainTip([
        { itemId: 'meat', qty: 1 },
        { itemId: 'blood', qty: 1 },
        { itemId: 'eye', qty: 1 },
      ]),
    ).toBe('获得 肉 ×1、血 ×1、眼 ×1')
    expect(formatGainTip([])).toBeNull()
    expect(mergeLots([{ itemId: 'ore', qty: 1 }, { itemId: 'ore', qty: 2 }])).toEqual([{ itemId: 'ore', qty: 3 }])
  })
})

describe('formatCycleTip', () => {
  it('prefers 获得 over station notice when lots exist', () => {
    expect(
      formatCycleTip({
        stationId: 'mining',
        lots: [{ itemId: 'ore', qty: 1 }],
        notice: '矿脉 4/5',
      }),
    ).toEqual({ text: '获得 铜矿 ×1', kind: 'ok' })
  })

  it('uses empty-rod / soft-fail notice when there is no output', () => {
    expect(formatCycleTip({ stationId: 'fishing', lots: [], notice: '空杆' })).toEqual({
      text: '空杆',
      kind: 'err',
    })
    expect(formatCycleTip({ stationId: 'forging', lots: [], notice: '软失败，矿石损耗' })).toEqual({
      text: '软失败，矿石损耗',
      kind: 'err',
    })
    expect(formatCycleTip({ stationId: 'mining', lots: [], notice: '  ' })).toBeNull()
  })
})

describe('completeCycle gain tips', () => {
  it('tips mining output with stationId', () => {
    const save = roster(1)
    assignWorker(save, save.workers[0].id, 'mining')
    const { ok, events, tips } = collectGain(save, 'mining')
    expect(ok).toBe(true)
    expect(bankQty(save, 'ore')).toBe(1)
    expect(events).toHaveLength(1)
    expect(events[0].stationId).toBe('mining')
    expect(events[0].lots).toEqual([{ itemId: 'ore', qty: 1 }])
    expect(tips).toEqual(['获得 铜矿 ×1'])
  })

  it('merges hunting multi-drops and tips hazard / empty rod / soft fail on that station', () => {
    setRollOverride(() => 0.9)
    const hunt = roster(1)
    unlockHuntingDeer(hunt)
    assignWorker(hunt, hunt.workers[0].id, 'hunting')
    const huntGain = collectGain(hunt, 'hunting')
    expect(huntGain.events[0]?.stationId).toBe('hunting')
    expect(huntGain.tips).toEqual(['获得 肉 ×1、血 ×1、眼 ×1'])

    setRollOverride(() => 0)
    const empty = roster(1)
    assignWorker(empty, empty.workers[0].id, 'fishing')
    const emptyGain = collectGain(empty, 'fishing')
    expect(emptyGain.ok).toBe(true)
    expect(empty.stations.fishing.gatherNotice).toBe('空杆')
    expect(emptyGain.events).toEqual([{ stationId: 'fishing', lots: [], notice: '空杆' }])
    expect(emptyGain.tips).toEqual(['空杆'])

    const hazard = roster(1)
    assignWorker(hazard, hazard.workers[0].id, 'hunting')
    const hazardGain = collectGain(hazard, 'hunting')
    expect(hazardGain.ok).toBe(true)
    expect(hazard.stations.hunting.gatherNotice).toContain('遇险')
    expect(hazardGain.events[0]?.stationId).toBe('hunting')
    expect(hazardGain.events[0]?.lots).toEqual([])
    expect(hazardGain.tips[0]).toContain('遇险')

    const fail = roster(1)
    fail.bank.ore = 1
    assignWorker(fail, fail.workers[0].id, 'forging')
    const failGain = collectGain(fail, 'forging')
    expect(failGain.ok).toBe(true)
    expect(fail.stations.forging.craftNotice).toContain('软失败')
    expect(bankQty(fail, 'tool')).toBe(0)
    expect(failGain.events).toEqual([{ stationId: 'forging', lots: [], notice: '软失败，矿石损耗' }])
    expect(failGain.tips).toEqual(['软失败，矿石损耗'])
  })

  it('tips forging and alchemy success', () => {
    setRollOverride(() => 0.99)
    const forge = roster(1)
    forge.bank.ore = 1
    assignWorker(forge, forge.workers[0].id, 'forging')
    const forgeGain = collectGain(forge, 'forging')
    expect(forgeGain.events[0]?.stationId).toBe('forging')
    expect(forgeGain.tips).toEqual(['获得 初级工具 ×1'])

    const brew = roster(1)
    brew.bank.blood = 1
    assignWorker(brew, brew.workers[0].id, 'alchemy')
    const brewGain = collectGain(brew, 'alchemy')
    expect(brewGain.events[0]?.stationId).toBe('alchemy')
    expect(brewGain.tips).toEqual(['获得 药剂 ×1'])
  })

  it('forwards onGain through live ticks with stationId', () => {
    const save = roster(1)
    assignWorker(save, save.workers[0].id, 'mining')
    const events: CycleGain[] = []
    ticks(save, 20, {
      onGain: (gain) => {
        events.push(gain)
      },
    })
    expect(events).toHaveLength(1)
    expect(events[0].stationId).toBe('mining')
    expect(formatCycleTip(events[0])?.text).toBe('获得 铜矿 ×1')
  })
})
