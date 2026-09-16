import { describe, expect, it } from 'vitest'
import {
  ALCHEMY_COST_OPTIONS,
  CLASS_PLACEHOLDERS,
  classPoolForQuality,
  QUALITY_TIERS,
  WORKER_QUALITY_TABLE,
  FISHING_DROP_TABLE,
  FOOD_BUFF_DEF,
  FORGING_SOFT_FAIL_CHANCE,
  HERBALISM_DROP_TABLE,
  HUNTING_PREY_TABLE,
  MINING_NODE_DEF,
  leftoverStockItems,
  PLAYABLE_STATION_IDS,
  SELLABLE_GOODS,
  SKELETON_STATION_IDS,
  resolveStationId,
  stationRelatedItems,
  STATION_DEF,
  TOOL_DEF,
  TOOL_TYPE_DEF,
} from './tables'

describe('production phase-1 tables', () => {
  it('marks seven stations with gather/craft and the new resonance graph', () => {
    expect(STATION_DEF.mining.kind).toBe('gather')
    expect(STATION_DEF.forging.kind).toBe('craft')
    expect(STATION_DEF.hunting.kind).toBe('gather')
    expect(STATION_DEF.cooking.kind).toBe('craft')
    expect(STATION_DEF.herbalism.kind).toBe('gather')
    expect(STATION_DEF.alchemy.kind).toBe('craft')
    expect(STATION_DEF.fishing.kind).toBe('gather')
    expect(STATION_DEF.mining.neighbors).toEqual(['forging'])
    expect(STATION_DEF.forging.neighbors).toEqual(['mining'])
    expect(STATION_DEF.fishing.neighbors).toEqual(['cooking'])
    expect(STATION_DEF.hunting.neighbors).toEqual(['cooking'])
    expect(STATION_DEF.cooking.neighbors).toEqual(['fishing', 'hunting'])
    expect(STATION_DEF.herbalism.neighbors).toEqual(['alchemy'])
    expect(STATION_DEF.alchemy.neighbors).toEqual(['herbalism'])
    expect(PLAYABLE_STATION_IDS).toEqual([
      'mining',
      'forging',
      'fishing',
      'hunting',
      'cooking',
      'herbalism',
      'alchemy',
    ])
  })

  it('maps smithing to forging and drops woodcutting', () => {
    expect(resolveStationId('smithing')).toBe('forging')
    expect(resolveStationId('woodcutting')).toBeNull()
    expect(STATION_DEF.forging.categories.map((c) => c.outputs[0].itemId)).toEqual([
      'tool',
      'ironTool',
      'mithrilTool',
    ])
    expect(STATION_DEF.alchemy.categories[0].costs).toEqual([{ itemId: 'herb', qty: 1 }])
    expect(ALCHEMY_COST_OPTIONS).toEqual([
      [{ itemId: 'herb', qty: 1 }],
      [{ itemId: 'blood', qty: 1 }],
      [{ itemId: 'tooth', qty: 1 }],
      [{ itemId: 'eye', qty: 1 }],
    ])
    expect(SKELETON_STATION_IDS).toEqual([])
    expect(SELLABLE_GOODS).toEqual(['tool', 'ironTool', 'mithrilTool', 'meal', 'roast', 'stew'])
    expect(STATION_DEF.cooking.categories.map((c) => c.outputs[0].itemId)).toEqual(['meal', 'roast', 'stew'])
    expect(STATION_DEF.cooking.categories[1].costs).toEqual([{ itemId: 'meat', qty: 1 }])
  })

  it('keeps placeholder tables for later phases', () => {
    expect(MINING_NODE_DEF.copper.nodeHpMax).toBeGreaterThan(0)
    expect(FISHING_DROP_TABLE.beginner.some((row) => row.outcome === 'empty' && row.weight > 0)).toBe(true)
    expect(FISHING_DROP_TABLE.beginner.every((row) => !row.catchTier || row.catchTier === 'beginner')).toBe(
      true,
    )
    expect(HUNTING_PREY_TABLE.every((row) => row.hazardChance > 0 && row.hazardChance < 1)).toBe(true)
    expect(HERBALISM_DROP_TABLE.every((row) => row.weight > 0)).toBe(true)
    expect(FORGING_SOFT_FAIL_CHANCE.copper).toBeGreaterThan(0)
    expect(TOOL_DEF.tool.effects[0].effectId).toBe('prodSpeed')
    expect(QUALITY_TIERS).toHaveLength(10)
    expect(WORKER_QUALITY_TABLE[1].label).toBe('灰')
    expect(WORKER_QUALITY_TABLE[10].label).toBe('彩')
    expect(classPoolForQuality(1)).toEqual(CLASS_PLACEHOLDERS)
    expect(classPoolForQuality(10).length).toBeGreaterThan(classPoolForQuality(1).length)
    expect(TOOL_DEF.ironTool.affixes.map((a) => a.effectId)).toEqual(
      expect.arrayContaining(['extraOutput', 'cycleShorten']),
    )
    expect(TOOL_TYPE_DEF.pot.matchStationId).toBe('cooking')
    expect(TOOL_TYPE_DEF.rack.matchStationId).toBe('alchemy')
    expect(FOOD_BUFF_DEF.meal.effectId).toBe('prodSpeed')
    expect(FOOD_BUFF_DEF.roast.effectId).toBe('extraOutput')
    expect(FOOD_BUFF_DEF.stew.mul).toBeGreaterThan(FOOD_BUFF_DEF.meal.mul)
  })

  it('exposes fishing grounds, hunting prey and alchemy-facing herbal drops', () => {
    expect(STATION_DEF.fishing.categories.map((c) => c.label)).toEqual(['初级渔场', '中级渔场', '高级渔场'])
    expect(STATION_DEF.hunting.categories.map((c) => c.label)).toEqual(['野猪', '狼', '鹿'])
    expect(HUNTING_PREY_TABLE.some((row) => row.outputs.some((io) => io.itemId === 'eye'))).toBe(true)
    expect(HERBALISM_DROP_TABLE.map((row) => row.itemId).sort()).toEqual(['herb', 'spice'])
    expect(FISHING_DROP_TABLE.beginner.some((row) => row.outcome === 'empty')).toBe(true)
  })

  it('lists each station\'s related costs and outputs for workshop stock', () => {
    expect(stationRelatedItems('mining')).toEqual({
      costs: [],
      outputs: ['ore', 'ironOre', 'mithrilOre'],
    })
    expect(stationRelatedItems('forging')).toEqual({
      costs: ['ore', 'slag', 'ironOre', 'mithrilOre'],
      outputs: ['tool', 'ironTool', 'mithrilTool', 'blueprint'],
    })
    expect(stationRelatedItems('fishing')).toEqual({
      costs: [],
      outputs: ['fish', 'junk'],
    })
    expect(stationRelatedItems('hunting')).toEqual({
      costs: [],
      outputs: ['meat', 'tooth', 'blood', 'eye'],
    })
    expect(stationRelatedItems('cooking')).toEqual({
      costs: ['fish', 'meat', 'spice'],
      outputs: ['meal', 'roast', 'stew'],
    })
    expect(stationRelatedItems('herbalism')).toEqual({
      costs: [],
      outputs: ['herb', 'spice'],
    })
    expect(stationRelatedItems('alchemy')).toEqual({
      costs: ['herb', 'blood', 'tooth', 'eye'],
      outputs: ['potion'],
    })
    expect(leftoverStockItems()).toEqual(['wood', 'weapon', 'ironWeapon', 'mithrilWeapon'])
  })
})
