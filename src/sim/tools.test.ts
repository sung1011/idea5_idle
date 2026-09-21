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
  INSCRIPTION_SOFT_FAIL_CHANCE,
  STATION_IDS,
  STATION_TOOL_COUNT,
  TOOL_DEF,
  TOOL_TYPE_DEF,
  TOOL_TYPE_IDS,
} from './tables'
import {
  assignedToolWeight,
  consumeSelectedStationTool,
  forgeToolPickOptions,
  hydrateForgedTools,
  selectForgeOutput,
  selectForgingToolType,
  selectStationTool,
  stationToolPickOptions,
  stationToolSpeedMul,
  unlockedPlusNextPreview,
  workerToolSpeedMul,
} from './tools'
import { convertLegacyToolsToFeedstock as convertFromRunes } from './runes'
import type { Save } from './types'

afterEach(() => {
  setRollOverride(null)
})

describe('unlockedPlusNextPreview', () => {
  it('keeps unlocked rows and only the next locked preview', () => {
    expect(
      unlockedPlusNextPreview([
        { id: 1, unlocked: true },
        { id: 2, unlocked: true },
        { id: 3, unlocked: false },
        { id: 4, unlocked: false },
      ]),
    ).toEqual([
      { id: 1, unlocked: true },
      { id: 2, unlocked: true },
      { id: 3, unlocked: false },
    ])
  })
})

function roster(n: number): Save {
  const save = createSave()
  save.diamonds = 15 * n
  for (let i = 0; i < n; i++) expect(recruitWorker(save).ok).toBe(true)
  return save
}

describe('tool type table leftovers', () => {
  it('maps pot/rack and every station to a type, with hammer on inscription', () => {
    expect(TOOL_TYPE_DEF.pot.matchStationId).toBe('cooking')
    expect(TOOL_TYPE_DEF.rack.matchStationId).toBe('alchemy')
    expect(TOOL_TYPE_DEF.pick.matchStationId).toBe('mining')
    expect(TOOL_TYPE_DEF.hammer.matchStationId).toBe('inscription')
    const stations = TOOL_TYPE_IDS.map((id) => TOOL_TYPE_DEF[id].matchStationId)
    expect(new Set(stations).size).toBe(6)
    expect(STATION_IDS).toHaveLength(6)
    expect(STATION_TOOL_COUNT).toBe(20)
  })

  it('keeps leftover T1/T2 defs for hydrate conversion', () => {
    expect(TOOL_DEF.tool.affixes).toEqual([])
    expect(TOOL_DEF.tool.effects.map((e) => e.effectId)).toEqual([EFFECT_ID.prodSpeed])
    const ironIds = TOOL_DEF.ironTool.affixes.map((a) => a.effectId)
    expect(ironIds).toContain(EFFECT_ID.extraOutput)
    expect(ironIds).toContain(EFFECT_ID.cycleShorten)
  })
})

describe('retired station tool APIs', () => {
  it('rejects selecting or listing tools and never consumes them', () => {
    const save = roster(1)
    save.bank.miningTool01 = 3
    expect(selectStationTool(save, 'mining', 'miningTool01')).toEqual({
      ok: false,
      reason: '工具系统已撤',
    })
    expect(selectForgeOutput(save, 'miningTool01')).toEqual({
      ok: false,
      reason: '工具系统已撤',
    })
    expect(selectForgingToolType(save, 'pick')).toEqual({
      ok: false,
      reason: '工具系统已撤',
    })
    expect(stationToolPickOptions(save, 'mining')).toEqual([])
    expect(forgeToolPickOptions(save)).toEqual([])
    expect(stationToolSpeedMul(save, 'mining')).toBe(1)
    expect(assignedToolWeight(save, 'mining')).toBe(0)
    assignWorker(save, save.workers[0].id, 'mining')
    expect(assignedToolWeight(save, 'mining')).toBe(1)
    expect(workerToolSpeedMul(save, save.workers[0], 'mining')).toBe(1)
    expect(currentSpeed(save, 'mining')).toBeCloseTo(1 / 20)
    consumeSelectedStationTool(save, 'mining')
    expect(bankQty(save, 'miningTool01')).toBe(3)
  })
})

describe('legacy tool hydrate', () => {
  it('keeps forgedTools long enough for convert, then clears them', () => {
    const raw = [
      { itemId: 'tool', matchStationId: 'mining' },
      { itemId: 'miningTool01', matchStationId: 'forging' },
      { itemId: 'ore', matchStationId: 'mining' },
    ]
    const kept = hydrateForgedTools(raw)
    expect(kept).toEqual([
      { itemId: 'tool', matchStationId: 'mining' },
      { itemId: 'miningTool01', matchStationId: 'inscription' },
    ])
    const save = createSave()
    save.forgedTools = kept
    expect(convertFromRunes(save)).toBe(2)
    expect(save.forgedTools).toEqual([])
    expect(bankQty(save, 'wildCrystal')).toBe(4)
  })
})

describe('inscription soft fail', () => {
  it('resolves chance and partial wildCrystal costs', () => {
    expect(resolveSoftFail(0.1, 0.01).outcome).toBe('softFail')
    expect(resolveSoftFail(0.1, 0.5).outcome).toBe('ok')
    expect(softFailCosts([{ itemId: 'wildCrystal', qty: 2 }])).toEqual([{ itemId: 'wildCrystal', qty: 1 }])
    expect(softFailXp(2)).toBe(1)
    expect(INSCRIPTION_SOFT_FAIL_CHANCE).toBeGreaterThan(0)
  })

  it('soft fail spends wildCrystal, gives no rune, still grants some XP', () => {
    setRollOverride(() => 0)
    const save = roster(1)
    save.bank.wildCrystal = 2
    assignWorker(save, save.workers[0].id, 'inscription')
    expect(completeForgingCycle(save)).toBe(true)
    expect(bankQty(save, 'wildCrystal')).toBe(1)
    expect(bankQty(save, 'runeSharp')).toBe(0)
    expect(save.stations.inscription.completed).toBe(1)
    expect(save.stations.inscription.stationXp).toBe(1)
    expect(save.stations.inscription.craftNotice).toContain('软失败')
    expect(save.stations.inscription.stallReason).toBeNull()
  })

  it('success inscribes a rune from wildCrystal', () => {
    setRollOverride(() => 0.99)
    const save = roster(1)
    save.bank.wildCrystal = 2
    assignWorker(save, save.workers[0].id, 'inscription')
    expect(completeCycle(save, 'inscription')).toBe(true)
    expect(bankQty(save, 'wildCrystal')).toBe(0)
    expect(bankQty(save, 'tool')).toBe(0)
    expect(save.stations.inscription.craftNotice).toMatch(/铭成/)
    expect(save.stations.inscription.completed).toBe(1)
  })
})
