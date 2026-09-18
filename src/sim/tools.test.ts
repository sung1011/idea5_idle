import { afterEach, describe, expect, it } from 'vitest'
import { assignWorker } from './assign'
import { bankQty } from './bank'
import { createSave } from './createSave'
import { completeForgingCycle, resolveSoftFail, softFailCosts, softFailXp } from './forging'
import { currentSpeed } from './query'
import { recruitWorker } from './recruit'
import { setRollOverride } from './rng'
import { completeCycle } from './stations'
import {
  EFFECT_ID,
  FORGING_SOFT_FAIL_CHANCE,
  STATION_IDS,
  STATION_TOOL_COUNT,
  STATION_TOOL_SPEED_STEP,
  STATION_TOOL_UNLOCK_EVERY,
  TOOL_DEF,
  TOOL_TYPE_DEF,
  TOOL_TYPE_IDS,
  isStationToolUnlocked,
  stationToolItemId,
  stationToolSpeedMulOf,
  stationToolUnlockCount,
  stationToolsOf,
} from './tables'
import { ticks } from './tick'
import {
  assignedToolWeight,
  consumeSelectedStationTool,
  selectForgingToolType,
  selectStationTool,
  stationToolPickOptions,
  stationToolSpeedMul,
  workerToolSpeedMul,
} from './tools'
import type { Save } from './types'

afterEach(() => {
  setRollOverride(null)
})

function roster(n: number): Save {
  const save = createSave()
  save.gold = 15 * n
  for (let i = 0; i < n; i++) expect(recruitWorker(save).ok).toBe(true)
  return save
}

describe('tool type table', () => {
  it('maps pot/rack and every station to a type', () => {
    expect(TOOL_TYPE_DEF.pot.matchStationId).toBe('cooking')
    expect(TOOL_TYPE_DEF.rack.matchStationId).toBe('alchemy')
    expect(TOOL_TYPE_DEF.pick.matchStationId).toBe('mining')
    expect(TOOL_TYPE_DEF.hammer.matchStationId).toBe('forging')
    const stations = TOOL_TYPE_IDS.map((id) => TOOL_TYPE_DEF[id].matchStationId)
    expect(new Set(stations).size).toBe(7)
  })

  it('gives T1 speed only and T2+ two effect kinds', () => {
    expect(TOOL_DEF.tool.affixes).toEqual([])
    expect(TOOL_DEF.tool.effects.map((e) => e.effectId)).toEqual([EFFECT_ID.prodSpeed])
    const ironIds = TOOL_DEF.ironTool.affixes.map((a) => a.effectId)
    expect(ironIds).toContain(EFFECT_ID.extraOutput)
    expect(ironIds).toContain(EFFECT_ID.cycleShorten)
    expect(new Set(ironIds).size).toBeGreaterThanOrEqual(2)
    const mythIds = TOOL_DEF.mithrilTool.affixes.map((a) => a.effectId)
    expect(mythIds).toContain(EFFECT_ID.extraOutput)
    expect(mythIds).toContain(EFFECT_ID.cycleShorten)
  })
})

describe('station exclusive tools', () => {
  it('lists 20 placeholder tools per station', () => {
    expect(STATION_TOOL_COUNT).toBe(20)
    expect(STATION_TOOL_UNLOCK_EVERY).toBe(5)
    for (const stationId of STATION_IDS) {
      const rows = stationToolsOf(stationId)
      expect(rows).toHaveLength(20)
      expect(rows[0]).toMatchObject({ id: stationToolItemId(stationId, 1), index: 1 })
      expect(rows[19]).toMatchObject({ id: stationToolItemId(stationId, 20), index: 20 })
      expect(new Set(rows.map((row) => row.id)).size).toBe(20)
    }
  })

  it('unlocks floor(stationLevel/5) tools, capped at 20; Lv1-4 none', () => {
    expect(stationToolUnlockCount(1)).toBe(0)
    expect(stationToolUnlockCount(4)).toBe(0)
    expect(stationToolUnlockCount(5)).toBe(1)
    expect(stationToolUnlockCount(9)).toBe(1)
    expect(stationToolUnlockCount(10)).toBe(2)
    expect(stationToolUnlockCount(100)).toBe(20)
    expect(stationToolUnlockCount(105)).toBe(20)
    expect(isStationToolUnlocked(4, 1)).toBe(false)
    expect(isStationToolUnlocked(5, 1)).toBe(true)
    expect(isStationToolUnlocked(5, 2)).toBe(false)
    expect(stationToolSpeedMulOf(1)).toBeCloseTo(1 + STATION_TOOL_SPEED_STEP)
    expect(stationToolSpeedMulOf(20)).toBeCloseTo(1 + 20 * STATION_TOOL_SPEED_STEP)
  })
})

describe('select station tool', () => {
  it('starts at 无 and rejects locked tools even with stock', () => {
    const save = roster(1)
    save.bank.miningTool01 = 3
    save.bank.miningTool02 = 1
    expect(save.stations.mining.selectedToolId).toBeNull()
    expect(selectStationTool(save, 'mining', 'miningTool01')).toEqual({
      ok: false,
      reason: '未解锁（需 Lv5）',
    })
    save.stations.mining.stationLevel = 5
    expect(selectStationTool(save, 'mining', 'miningTool01').ok).toBe(true)
    expect(save.stations.mining.selectedToolId).toBe('miningTool01')
    expect(bankQty(save, 'miningTool01')).toBe(3)
    expect(selectStationTool(save, 'mining', 'miningTool02')).toEqual({
      ok: false,
      reason: '未解锁（需 Lv10）',
    })
    expect(save.stations.mining.selectedToolId).toBe('miningTool01')
  })

  it('rejects another station\'s tool and empty stock', () => {
    const save = roster(1)
    save.stations.mining.stationLevel = 5
    save.bank.cookingTool01 = 1
    expect(selectStationTool(save, 'mining', 'cookingTool01')).toEqual({
      ok: false,
      reason: '不是本站工具',
    })
    expect(selectStationTool(save, 'mining', 'miningTool01')).toEqual({
      ok: false,
      reason: '采矿工具1见底',
    })
  })

  it('dropdown starts with 无 and marks locked rows', () => {
    const save = roster(1)
    save.stations.mining.stationLevel = 5
    save.bank.miningTool01 = 2
    const opts = stationToolPickOptions(save, 'mining')
    expect(opts[0]).toMatchObject({ id: null, label: '无', unlocked: true })
    expect(opts).toHaveLength(21)
    expect(opts[1]).toMatchObject({ id: 'miningTool01', unlocked: true, qty: 2, unlockLevel: 5 })
    expect(opts[2]).toMatchObject({ id: 'miningTool02', unlocked: false, unlockLevel: 10 })
  })

  it('clears back to 无', () => {
    const save = roster(1)
    save.stations.cooking.stationLevel = 5
    save.bank.cookingTool01 = 1
    expect(selectStationTool(save, 'cooking', 'cookingTool01').ok).toBe(true)
    expect(selectStationTool(save, 'cooking', null).ok).toBe(true)
    expect(save.stations.cooking.selectedToolId).toBeNull()
  })
})

describe('matching tool speed', () => {
  it('selected tool is a small station mul and does not apply to other stations', () => {
    const save = roster(1)
    save.stations.mining.stationLevel = 5
    save.bank.miningTool01 = 1
    const id = save.workers[0].id
    expect(assignWorker(save, id, 'mining').ok).toBe(true)
    expect(selectStationTool(save, 'mining', 'miningTool01').ok).toBe(true)
    expect(workerToolSpeedMul(save, save.workers[0], 'mining')).toBe(1)
    expect(stationToolSpeedMul(save, 'mining')).toBeCloseTo(1.03)
    expect(assignedToolWeight(save, 'mining')).toBeCloseTo(1.03)
    expect(currentSpeed(save, 'mining')).toBeCloseTo((1 / 20) * 1.03)

    expect(assignWorker(save, id, 'cooking').ok).toBe(true)
    expect(workerToolSpeedMul(save, save.workers[0], 'cooking')).toBe(1)
    expect(stationToolSpeedMul(save, 'cooking')).toBe(1)
    expect(currentSpeed(save, 'cooking')).toBeCloseTo(1 / 28)
  })

  it('matching first tool is slightly faster than bare work', () => {
    const bare = roster(1)
    assignWorker(bare, bare.workers[0].id, 'mining')
    const tooled = roster(1)
    tooled.stations.mining.stationLevel = 5
    tooled.bank.miningTool01 = 8
    assignWorker(tooled, tooled.workers[0].id, 'mining')
    expect(selectStationTool(tooled, 'mining', 'miningTool01').ok).toBe(true)

    expect(assignedToolWeight(bare, 'mining')).toBe(1)
    expect(assignedToolWeight(tooled, 'mining')).toBeCloseTo(1.03)
    expect(currentSpeed(tooled, 'mining')).toBeGreaterThan(currentSpeed(bare, 'mining'))

    const a = ticks(bare, 20)
    const b = ticks(tooled, 20)
    expect(a.stations.mining.completed).toBe(1)
    expect(b.stations.mining.completed).toBe(1)
    expect(bankQty(b, 'miningTool01')).toBe(7)
  })

  it('one selected tool speeds both assigned workers', () => {
    const save = roster(2)
    save.stations.mining.stationLevel = 5
    save.bank.miningTool01 = 1
    assignWorker(save, save.workers[0].id, 'mining')
    assignWorker(save, save.workers[1].id, 'mining')
    expect(selectStationTool(save, 'mining', 'miningTool01').ok).toBe(true)
    expect(assignedToolWeight(save, 'mining')).toBeCloseTo(2.06)
    expect(currentSpeed(save, 'mining')).toBeCloseTo((1 / 20) * 2.06 * 0.5)
  })

  it('consumes 1 on successful cycle and returns to 无 when empty', () => {
    const save = roster(1)
    save.stations.mining.stationLevel = 5
    save.bank.miningTool01 = 1
    assignWorker(save, save.workers[0].id, 'mining')
    expect(selectStationTool(save, 'mining', 'miningTool01').ok).toBe(true)
    expect(completeCycle(save, 'mining')).toBe(true)
    expect(bankQty(save, 'miningTool01')).toBe(0)
    expect(save.stations.mining.selectedToolId).toBeNull()
    expect(stationToolSpeedMul(save, 'mining')).toBe(1)
  })

  it('无 does not consume stock', () => {
    const save = roster(1)
    save.stations.mining.stationLevel = 5
    save.bank.miningTool01 = 2
    expect(completeCycle(save, 'mining')).toBe(true)
    expect(bankQty(save, 'miningTool01')).toBe(2)
    consumeSelectedStationTool(save, 'mining')
    expect(bankQty(save, 'miningTool01')).toBe(2)
  })
})

describe('forging soft fail', () => {
  it('resolves chance and partial ore costs', () => {
    expect(resolveSoftFail(0.1, 0.01).outcome).toBe('softFail')
    expect(resolveSoftFail(0.1, 0.5).outcome).toBe('ok')
    expect(softFailCosts([{ itemId: 'ore', qty: 1 }])).toEqual([{ itemId: 'ore', qty: 1 }])
    expect(softFailCosts([{ itemId: 'ore', qty: 2 }])).toEqual([{ itemId: 'ore', qty: 1 }])
    expect(softFailXp(2)).toBe(1)
    expect(FORGING_SOFT_FAIL_CHANCE.copper).toBeGreaterThan(0)
  })

  it('soft fail spends ore, gives no tool, still grants some XP', () => {
    setRollOverride(() => 0)
    const save = roster(1)
    save.bank.ore = 2
    assignWorker(save, save.workers[0].id, 'forging')
    expect(completeForgingCycle(save)).toBe(true)
    expect(bankQty(save, 'ore')).toBe(1)
    expect(bankQty(save, 'tool')).toBe(0)
    expect(save.stations.forging.completed).toBe(1)
    expect(save.stations.forging.stationXp).toBe(1)
    expect(save.stations.forging.craftNotice).toContain('软失败')
    expect(save.stations.forging.stallReason).toBeNull()
  })

  it('success forges a tool for the selected type and does not make weapons', () => {
    setRollOverride(() => 0.99)
    const save = roster(1)
    save.bank.ore = 1
    expect(selectForgingToolType(save, 'pot').ok).toBe(true)
    assignWorker(save, save.workers[0].id, 'forging')
    expect(completeCycle(save, 'forging')).toBe(true)
    expect(bankQty(save, 'tool')).toBe(1)
    expect(bankQty(save, 'weapon')).toBe(0)
    expect(bankQty(save, 'cookingTool01')).toBe(1)
    expect(save.forgedTools[0]).toEqual({ itemId: 'tool', matchStationId: 'cooking' })
    expect(save.stations.forging.craftNotice).toContain('初级工具')
  })
})
