import { describe, expect, it } from 'vitest'
import { createSave, normalizeDiamonds } from './createSave'
import { spawnWorker } from './recruit'
import { PLAYABLE_STATION_IDS, START_DIAMONDS, START_GOLD, STATION_IDS, WORKER_QUALITY_REV } from './tables'

describe('createSave diamonds', () => {
  it('starts diamonds at 0 as a premium-token placeholder', () => {
    const save = createSave()
    expect(save.diamonds).toBe(START_DIAMONDS)
    expect(save.diamonds).toBe(0)
    expect(save.gold).toBe(START_GOLD)
  })

  it('normalizes missing or dirty diamonds back to 0', () => {
    expect(normalizeDiamonds(undefined)).toBe(0)
    expect(normalizeDiamonds(null)).toBe(0)
    expect(normalizeDiamonds(-3)).toBe(0)
    expect(normalizeDiamonds(Number.NaN)).toBe(0)
    expect(normalizeDiamonds(4.8)).toBe(4)
  })
})

describe('createSave seven stations', () => {
  it('opens with the seven stations and empty dual slots', () => {
    const save = createSave()
    expect(STATION_IDS).toEqual(['mining', 'forging', 'hunting', 'cooking', 'herbalism', 'alchemy', 'fishing'])
    expect(Object.keys(save.stations)).toEqual(STATION_IDS)
    expect(PLAYABLE_STATION_IDS).toContain('hunting')
    expect(PLAYABLE_STATION_IDS).toContain('herbalism')
    expect((save.stations as Record<string, unknown>).woodcutting).toBeUndefined()
    expect(save.stations.mining.miningNode?.nodeHp).toBe(20)
    expect(save.stations.mining.miningNode?.recoverAt).toBeNull()
    expect(save.rngState).toBe(1)
    expect(save.forgedTools).toEqual([])
    expect(save.stations.forging.selectedToolType).toBe('pick')
    expect(save.stations.fishing.selectedCategory).toBe('copper')
    expect(save.stations.hunting.selectedCategory).toBe('copper')
    expect(save.stations.cooking.selectedCategory).toBe('copper')
    expect(save.stations.cooking.unlockedCategories).toEqual(['copper', 'iron'])
    const worker = spawnWorker(save)
    expect(worker.foodSlot).toBeNull()
    expect(save.stations.mining.toolSlot).toBeNull()
    expect(save.stations.forging.toolSlot).toBeNull()
    expect(worker.qualityTier).toBe(1)
    expect(save.workerQualityRev).toBe(WORKER_QUALITY_REV)
    expect(save.techPoints).toBe(0)
    expect(save.unlockedTechIds).toEqual([])
  })
})
