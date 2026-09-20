import { describe, expect, it } from 'vitest'
import {
  ALCHEMY_COST_OPTIONS,
  CLASS_PLACEHOLDERS,
  classPoolForQuality,
  QUALITY_TIERS,
  WORKER_QUALITY_TABLE,
  FOOD_BUFF_DEF,
  FORGING_SOFT_FAIL_CHANCE,
  HERBALISM_DROP_TABLE,
  HUNTING_PREY_TABLE,
  HUNTING_SIDE_DROP_TABLE,
  MINING_NODE_DEF,
  leftoverStockItems,
  itemProducerStation,
  POTION_ITEM_IDS,
  PLAYABLE_STATION_IDS,
  SELLABLE_GOODS,
  SKELETON_STATION_IDS,
  resolveStationId,
  stationRelatedItems,
  STATION_DEF,
  TOOL_DEF,
  TOOL_TYPE_DEF,
  ITEM_DEF,
  itemCraftGold,
  stationToolsOf,
  STATION_TOOL_IDS,
} from './tables'

describe('production phase-1 tables', () => {
  it('marks six stations with gather/craft and no resonance neighbors', () => {
    expect(STATION_DEF.mining.kind).toBe('gather')
    expect(STATION_DEF.forging.kind).toBe('craft')
    expect(STATION_DEF.hunting.kind).toBe('gather')
    expect(STATION_DEF.cooking.kind).toBe('craft')
    expect(STATION_DEF.herbalism.kind).toBe('gather')
    expect(STATION_DEF.alchemy.kind).toBe('craft')
    expect((STATION_DEF as Record<string, unknown>).fishing).toBeUndefined()
    expect(STATION_DEF.mining.neighbors).toEqual([])
    expect(STATION_DEF.forging.neighbors).toEqual([])
    expect(STATION_DEF.hunting.neighbors).toEqual([])
    expect(STATION_DEF.cooking.neighbors).toEqual([])
    expect(STATION_DEF.herbalism.neighbors).toEqual([])
    expect(STATION_DEF.alchemy.neighbors).toEqual([])
    expect(PLAYABLE_STATION_IDS).toEqual([
      'mining',
      'forging',
      'hunting',
      'cooking',
      'herbalism',
      'alchemy',
    ])
  })

  it('maps smithing to forging and drops woodcutting', () => {
    expect(resolveStationId('smithing')).toBe('forging')
    expect(resolveStationId('woodcutting')).toBeNull()
    expect(resolveStationId('fishing')).toBeNull()
    expect(STATION_DEF.forging.categories.map((c) => c.id)).toEqual(['default'])
    expect(STATION_DEF.forging.categories[0].outputs).toEqual([])
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
    expect(HUNTING_PREY_TABLE.every((row) => row.outputs.some((io) => io.itemId === 'fish'))).toBe(true)
    expect(HUNTING_SIDE_DROP_TABLE.some((row) => row.itemId === 'junk' && row.weight > 0)).toBe(true)
    expect(HUNTING_PREY_TABLE.every((row) => row.hazardChance > 0 && row.hazardChance < 1)).toBe(true)
    expect(HERBALISM_DROP_TABLE.every((row) => row.weight > 0)).toBe(true)
    expect(FORGING_SOFT_FAIL_CHANCE.copper).toBeGreaterThan(0)
    expect(TOOL_DEF.tool.effects[0].effectId).toBe('prodSpeed')
    expect(QUALITY_TIERS).toHaveLength(10)
    expect(WORKER_QUALITY_TABLE[1].label).toBe('白')
    expect(WORKER_QUALITY_TABLE[7].label).toBe('粉')
    expect(WORKER_QUALITY_TABLE[10].label).toBe('彩')
    expect(QUALITY_TIERS.map((tier) => WORKER_QUALITY_TABLE[tier].id)).not.toContain('gray')
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

  it('exposes hunting prey, former fish goods and alchemy-facing herbal drops', () => {
    expect(STATION_DEF.hunting.categories.map((c) => c.label)).toEqual(['野猪', '狼', '鹿'])
    expect(HUNTING_PREY_TABLE.some((row) => row.outputs.some((io) => io.itemId === 'eye'))).toBe(true)
    expect(HUNTING_PREY_TABLE.some((row) => row.outputs.some((io) => io.itemId === 'fish'))).toBe(true)
    expect(HERBALISM_DROP_TABLE.map((row) => row.itemId).sort()).toEqual(['herb', 'spice'])
  })

  it('lists each station\'s related costs and outputs for leftover classification', () => {
    expect(stationRelatedItems('mining')).toEqual({
      costs: stationToolsOf('mining').map((row) => row.id),
      outputs: ['ore', 'ironOre', 'mithrilOre'],
    })
    expect(stationRelatedItems('forging')).toEqual({
      costs: ['ore', 'slag', 'ironOre', 'mithrilOre', ...stationToolsOf('forging').map((row) => row.id)],
      outputs: ['blueprint', ...STATION_TOOL_IDS],
    })
    expect(stationRelatedItems('hunting')).toEqual({
      costs: stationToolsOf('hunting').map((row) => row.id),
      outputs: ['meat', 'fish', 'tooth', 'blood', 'eye', 'junk'],
    })
    expect(stationRelatedItems('cooking')).toEqual({
      costs: ['fish', 'meat', 'spice', ...stationToolsOf('cooking').map((row) => row.id)],
      outputs: ['meal', 'roast', 'stew'],
    })
    expect(stationRelatedItems('herbalism')).toEqual({
      costs: stationToolsOf('herbalism').map((row) => row.id),
      outputs: ['herb', 'spice'],
    })
    expect(stationRelatedItems('alchemy')).toEqual({
      costs: ['herb', 'blood', 'tooth', 'eye', ...stationToolsOf('alchemy').map((row) => row.id)],
      outputs: ['potion', ...POTION_ITEM_IDS],
    })
    expect(leftoverStockItems()).toEqual([
      'wood',
      'weapon',
      'ironWeapon',
      'mithrilWeapon',
      'tool',
      'ironTool',
      'mithrilTool',
    ])
  })

  it('maps producible items to one primary station and leaves leftover goods unmapped', () => {
    expect(itemProducerStation('ore')).toBe('mining')
    expect(itemProducerStation('ironOre')).toBe('mining')
    expect(itemProducerStation('tool')).toBeNull()
    expect(itemProducerStation('miningTool01')).toBe('forging')
    expect(itemProducerStation('herbalismTool02')).toBe('forging')
    expect(itemProducerStation('blueprint')).toBe('forging')
    expect(itemProducerStation('fish')).toBe('hunting')
    expect(itemProducerStation('junk')).toBe('hunting')
    expect(itemProducerStation('meat')).toBe('hunting')
    expect(itemProducerStation('eye')).toBe('hunting')
    expect(itemProducerStation('meal')).toBe('cooking')
    expect(itemProducerStation('stew')).toBe('cooking')
    expect(itemProducerStation('herb')).toBe('herbalism')
    expect(itemProducerStation('spice')).toBe('herbalism')
    expect(itemProducerStation('potion')).toBe('alchemy')
    expect(itemProducerStation('stim')).toBe('alchemy')
    expect(itemProducerStation('salve')).toBe('alchemy')
    expect(itemProducerStation('clearMind')).toBe('alchemy')
    expect(itemProducerStation('wood')).toBeNull()
    expect(itemProducerStation('weapon')).toBeNull()
    expect(itemProducerStation('slag')).toBeNull()
  })

  it('gives workshop craftGold of 0–1 for gathers and 1–3 for finished goods', () => {
    const gathers = ['ore', 'ironOre', 'mithrilOre', 'fish', 'junk', 'meat', 'blood', 'tooth', 'eye', 'herb', 'spice'] as const
    const finished = ['meal', 'roast', 'stew', 'potion', ...POTION_ITEM_IDS, 'tool', 'ironTool', 'mithrilTool'] as const
    for (const id of gathers) {
      expect(ITEM_DEF[id].craftGold).toBeGreaterThanOrEqual(0)
      expect(ITEM_DEF[id].craftGold).toBeLessThanOrEqual(1)
      expect(itemCraftGold(id)).toBe(ITEM_DEF[id].craftGold)
    }
    for (const id of finished) {
      expect(ITEM_DEF[id].craftGold).toBeGreaterThanOrEqual(1)
      expect(ITEM_DEF[id].craftGold).toBeLessThanOrEqual(3)
      expect(itemCraftGold(id)).toBe(ITEM_DEF[id].craftGold)
    }
    expect(itemCraftGold('ore')).toBe(0)
    expect(itemCraftGold('weapon')).toBe(0)
  })
})
