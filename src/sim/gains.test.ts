import { afterEach, describe, expect, it } from 'vitest'
import { assignWorker } from './assign'
import { bankQty } from './bank'
import { createSave } from './createSave'
import { craftGoldForLots, formatCycleTip, formatGainTip, mergeLots, type CycleGain } from './gains'
import { recruitWorker } from './recruit'
import { setRollOverride } from './rng'
import { completeCycle } from './stations'
import { grantStationXp, selectStationCategory } from './stationProgress'
import { ITEM_DEF, xpToNextLevel } from './tables'
import { loadFood } from './food'
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
    expect(formatGainTip([{ itemId: 'tool', qty: 1 }], 2)).toBe('获得 初级工具 ×1、金币 +2')
    expect(formatGainTip([], 3)).toBe('获得 金币 +3')
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

  it('uses hazard / soft-fail notice when there is no output', () => {
    expect(formatCycleTip({ stationId: 'hunting', lots: [], notice: '遇险，短暂停手' })).toEqual({
      text: '遇险，短暂停手',
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

  it('merges hunting multi-drops and tips hazard / soft fail on that station', () => {
    setRollOverride(() => 0.9)
    const hunt = roster(1)
    unlockHuntingDeer(hunt)
    assignWorker(hunt, hunt.workers[0].id, 'hunting')
    const huntGain = collectGain(hunt, 'hunting')
    expect(huntGain.events[0]?.stationId).toBe('hunting')
    expect(huntGain.tips).toEqual(['获得 肉 ×1、鱼 ×1、血 ×1、眼 ×1、金币 +2'])

    setRollOverride(() => 0)
    const hazard = roster(1)
    assignWorker(hazard, hazard.workers[0].id, 'hunting')
    const hazardGain = collectGain(hazard, 'hunting')
    expect(hazardGain.ok).toBe(true)
    expect(hazard.stations.hunting.gatherNotice).toContain('遇险')
    expect(hazardGain.events[0]?.stationId).toBe('hunting')
    expect(hazardGain.events[0]?.lots).toEqual([])
    expect(hazardGain.tips[0]).toContain('遇险')

    const fail = roster(1)
    fail.stations.forging.selectedForgeToolId = 'miningTool01'
    fail.bank.ore = 1
    assignWorker(fail, fail.workers[0].id, 'forging')
    const failGain = collectGain(fail, 'forging')
    expect(failGain.ok).toBe(true)
    expect(fail.stations.forging.craftNotice).toContain('软失败')
    expect(bankQty(fail, 'miningTool01')).toBe(0)
    expect(bankQty(fail, 'tool')).toBe(0)
    expect(failGain.events).toEqual([{ stationId: 'forging', lots: [], notice: '软失败，矿石损耗', gold: 0 }])
    expect(failGain.tips).toEqual(['软失败，矿石损耗'])
  })

  it('tips forging and alchemy success', () => {
    setRollOverride(() => 0.99)
    const forge = roster(1)
    forge.stations.forging.selectedForgeToolId = 'miningTool01'
    forge.bank.ore = 1
    assignWorker(forge, forge.workers[0].id, 'forging')
    const forgeGain = collectGain(forge, 'forging')
    expect(forgeGain.events[0]?.stationId).toBe('forging')
    expect(forgeGain.tips).toEqual(['获得 采矿工具1 ×1、金币 +1'])

    const brew = roster(1)
    brew.bank.blood = 1
    assignWorker(brew, brew.workers[0].id, 'alchemy')
    const brewGain = collectGain(brew, 'alchemy')
    expect(brewGain.events[0]?.stationId).toBe('alchemy')
    expect(brewGain.tips).toEqual(['获得 战鼓药 ×6、金币 +12'])
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

describe('completeCycle craft gold', () => {
  it('pays craftGold by output qty and skips empty / zero-gold cycles', () => {
    expect(craftGoldForLots([{ itemId: 'ore', qty: 1 }])).toBe(0)
    expect(craftGoldForLots([{ itemId: 'tool', qty: 1 }])).toBe(ITEM_DEF.tool.craftGold)
    expect(craftGoldForLots([{ itemId: 'tool', qty: 2 }])).toBe(ITEM_DEF.tool.craftGold * 2)
    expect(craftGoldForLots([{ itemId: 'meat', qty: 1 }, { itemId: 'blood', qty: 1 }, { itemId: 'eye', qty: 1 }])).toBe(2)

    const mine = roster(1)
    const mineGold = mine.gold
    assignWorker(mine, mine.workers[0].id, 'mining')
    const mined = collectGain(mine, 'mining')
    expect(mined.ok).toBe(true)
    expect(mine.gold).toBe(mineGold)
    expect(mined.events[0]?.gold).toBe(0)

    setRollOverride(() => 0.99)
    const forge = roster(1)
    const forgeGold = forge.gold
    forge.stations.forging.selectedForgeToolId = 'miningTool01'
    forge.bank.ore = 1
    assignWorker(forge, forge.workers[0].id, 'forging')
    const forged = collectGain(forge, 'forging')
    expect(forged.ok).toBe(true)
    expect(forge.gold).toBe(forgeGold + 1)
    expect(forged.events[0]?.gold).toBe(1)
    expect(forged.tips).toEqual(['获得 采矿工具1 ×1、金币 +1'])

    const cook = roster(1)
    const cookGold = cook.gold
    cook.bank.fish = 1
    assignWorker(cook, cook.workers[0].id, 'cooking')
    const cooked = collectGain(cook, 'cooking')
    expect(cooked.ok).toBe(true)
    expect(cook.gold).toBe(cookGold + 1)
    expect(cooked.events[0]?.gold).toBe(1)

    setRollOverride(() => 0)
    const empty = roster(1)
    const emptyGold = empty.gold
    assignWorker(empty, empty.workers[0].id, 'hunting')
    const emptyGain = collectGain(empty, 'hunting')
    expect(emptyGain.ok).toBe(true)
    expect(empty.gold).toBe(emptyGold)
    expect(emptyGain.events[0]?.gold).toBe(0)
  })

  it('does not let roast food double workshop lots anymore', () => {
    const save = roster(1)
    const before = save.gold
    save.bank.fish = 1
    save.bank.roast = 1
    assignWorker(save, save.workers[0].id, 'cooking')
    expect(loadFood(save, save.workers[0].id, 'roast', 1).ok).toBe(true)
    const cooked = collectGain(save, 'cooking')
    expect(cooked.ok).toBe(true)
    expect(cooked.events[0]?.lots).toEqual([{ itemId: 'meal', qty: 1 }])
    expect(save.gold).toBe(before + 1)
    expect(cooked.tips).toEqual(['获得 熟食 ×1、金币 +1'])
  })
})
