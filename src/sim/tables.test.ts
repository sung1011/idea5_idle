import { describe, expect, it } from 'vitest'
import {
  FISHING_DROP_TABLE,
  FOOD_BUFF_DEF,
  FORGING_SOFT_FAIL_CHANCE,
  HERBALISM_DROP_TABLE,
  HUNTING_PREY_TABLE,
  MINING_NODE_DEF,
  PLAYABLE_STATION_IDS,
  resolveStationId,
  STATION_DEF,
  TOOL_DEF,
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
    expect(FOOD_BUFF_DEF.meal?.effectId).toBe('prodSpeed')
  })
})
