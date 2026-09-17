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
  TOOL_DEF,
  TOOL_TYPE_DEF,
  TOOL_TYPE_IDS,
} from './tables'
import { ticks } from './tick'
import {
  assignedToolWeight,
  equipStationTool,
  makeToolSlot,
  matchingToolEffectMax,
  selectForgingToolType,
  unequipStationTool,
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

describe('equip / unequip', () => {
  it('equips a station from bank and unequips back', () => {
    const save = roster(1)
    save.bank.tool = 1
    expect(equipStationTool(save, 'cooking', 'tool').ok).toBe(true)
    expect(bankQty(save, 'tool')).toBe(0)
    expect(save.stations.cooking.toolSlot?.itemId).toBe('tool')
    expect(save.stations.cooking.toolSlot?.matchStationId).toBe('cooking')
    expect(save.stations.cooking.toolSlot?.affixes).toEqual([])
    expect(save.workers[0].foodSlot).toBeNull()
    expect(unequipStationTool(save, 'cooking').ok).toBe(true)
    expect(save.stations.cooking.toolSlot).toBeNull()
    expect(bankQty(save, 'tool')).toBe(1)
  })

  it('does not apply another station\'s tool', () => {
    const save = roster(1)
    save.bank.tool = 1
    const id = save.workers[0].id
    expect(assignWorker(save, id, 'mining').ok).toBe(true)
    expect(equipStationTool(save, 'cooking', 'tool').ok).toBe(true)
    expect(save.workers[0].assignment).toBe('mining')
    expect(workerToolSpeedMul(save, save.workers[0], 'mining')).toBe(1)
    expect(currentSpeed(save, 'mining')).toBeCloseTo(1 / 20)
  })
})

describe('matching tool speed', () => {
  it('matching T1 is clearly faster than bare work', () => {
    const bare = roster(1)
    assignWorker(bare, bare.workers[0].id, 'mining')
    const tooled = roster(1)
    tooled.bank.tool = 1
    assignWorker(tooled, tooled.workers[0].id, 'mining')
    expect(equipStationTool(tooled, 'mining', 'tool').ok).toBe(true)

    expect(assignedToolWeight(bare, 'mining')).toBe(1)
    expect(assignedToolWeight(tooled, 'mining')).toBeCloseTo(1.25)
    expect(currentSpeed(tooled, 'mining')).toBeGreaterThan(currentSpeed(bare, 'mining'))

    const a = ticks(bare, 16)
    const b = ticks(tooled, 16)
    expect(a.stations.mining.completed).toBe(0)
    expect(bankQty(b, 'ore')).toBe(1)
    expect(b.stations.mining.completed).toBe(1)
  })

  it('T2 extraOutput is a permanent tool effect, not a food buff', () => {
    const save = roster(1)
    save.bank.ironTool = 1
    assignWorker(save, save.workers[0].id, 'cooking')
    expect(equipStationTool(save, 'cooking', 'ironTool').ok).toBe(true)
    expect(save.workers[0].foodSlot).toBeNull()
    expect(matchingToolEffectMax(save, 'cooking', EFFECT_ID.extraOutput)).toBe(1)
    expect(workerToolSpeedMul(save, save.workers[0], 'cooking')).toBeCloseTo(1.2 / 0.8)
  })

  it('one station tool speeds both assigned workers', () => {
    const save = roster(2)
    save.bank.tool = 1
    assignWorker(save, save.workers[0].id, 'mining')
    assignWorker(save, save.workers[1].id, 'mining')
    expect(equipStationTool(save, 'mining', 'tool').ok).toBe(true)
    expect(assignedToolWeight(save, 'mining')).toBeCloseTo(2.5)
    expect(currentSpeed(save, 'mining')).toBeCloseTo((1 / 20) * 2.5)
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
    expect(save.forgedTools[0]).toEqual({ itemId: 'tool', matchStationId: 'cooking' })
    expect(save.stations.forging.craftNotice).toContain('初级工具')
  })
})

describe('makeToolSlot', () => {
  it('copies T2 affixes onto the slot', () => {
    const slot = makeToolSlot('ironTool', 'alchemy')
    expect(slot.matchStationId).toBe('alchemy')
    expect(slot.affixes.map((a) => a.effectId).sort()).toEqual([EFFECT_ID.cycleShorten, EFFECT_ID.extraOutput])
  })
})
