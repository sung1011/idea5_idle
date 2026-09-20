import { describe, expect, it } from 'vitest'
import { createSave } from './createSave'
import { computeKnightLevel, normalizeKnightLevel, syncKnightLevel } from './knightLevel'
import { grantStationXp } from './stationProgress'
import { PLAYABLE_STATION_IDS, START_TECH_POINTS, xpToNextLevel } from './tables'
import { hydrateTechFields } from './tech'
import type { Save } from './types'

describe('knight level formula', () => {
  it('starts at 1 when every playable station is Lv1', () => {
    const save = createSave()
    expect(PLAYABLE_STATION_IDS).toHaveLength(6)
    expect(PLAYABLE_STATION_IDS.every((id) => save.stations[id].stationLevel === 1)).toBe(true)
    expect(computeKnightLevel(save)).toBe(1)
    expect(save.knightLevel).toBe(1)
    expect(save.techPoints).toBe(START_TECH_POINTS)
  })

  it('uses 1 + sum(stationLevel - 1), not the raw level sum', () => {
    const save = createSave()
    save.stations.mining.stationLevel = 3
    save.stations.forging.stationLevel = 2
    // 裸求和=1*4+3+2=9；换算=1+(3-1)+(2-1)=4
    expect(computeKnightLevel(save)).toBe(4)
  })

  it('normalizes missing or dirty knightLevel back to 1', () => {
    expect(normalizeKnightLevel(undefined)).toBe(1)
    expect(normalizeKnightLevel(0)).toBe(1)
    expect(normalizeKnightLevel(-2)).toBe(1)
    expect(normalizeKnightLevel(2.8)).toBe(2)
  })
})

describe('knight level grants inspiration', () => {
  it('gives +1 inspiration when a station upgrade raises knight level by 1', () => {
    const save = createSave()
    expect(save.knightLevel).toBe(1)
    expect(save.techPoints).toBe(START_TECH_POINTS)

    grantStationXp(save, 'mining', xpToNextLevel(1))
    expect(save.stations.mining.stationLevel).toBe(2)
    expect(save.knightLevel).toBe(2)
    expect(save.techPoints).toBe(START_TECH_POINTS + 1)
    expect(save.messages[0]?.title).toBe('骑士升级')
    expect(save.stations.mining.progressNotice).toContain('骑士升到 Lv2')
  })

  it('does not grant again when the snapshot already matches', () => {
    const save = createSave()
    grantStationXp(save, 'mining', xpToNextLevel(1))
    expect(save.techPoints).toBe(START_TECH_POINTS + 1)
    syncKnightLevel(save)
    syncKnightLevel(save)
    expect(save.knightLevel).toBe(2)
    expect(save.techPoints).toBe(START_TECH_POINTS + 1)
  })
})

describe('hydrate knight level', () => {
  it('recalculates from stations and backfills inspiration when current > recorded', () => {
    const save = createSave()
    save.stations.mining.stationLevel = 3
    save.knightLevel = 1
    save.techPoints = 5
    hydrateTechFields(save)
    expect(save.knightLevel).toBe(3)
    expect(save.techPoints).toBe(7)
  })

  it('does not reset an old save inspiration to 1', () => {
    const save = createSave()
    delete (save as { knightLevel?: number }).knightLevel
    save.techPoints = 9
    hydrateTechFields(save as Save)
    expect(save.knightLevel).toBe(1)
    expect(save.techPoints).toBe(9)
  })

  it('keeps missing inspiration at 0 instead of forcing a new-save 1', () => {
    const save = createSave()
    delete (save as { techPoints?: number }).techPoints
    delete (save as { knightLevel?: number }).knightLevel
    hydrateTechFields(save as Save)
    expect(save.knightLevel).toBe(1)
    expect(save.techPoints).toBe(0)
  })

  it('does not dump inspiration when an old played save is missing knightLevel', () => {
    const save = createSave()
    delete (save as { knightLevel?: number }).knightLevel
    save.stations.mining.stationLevel = 5
    save.stations.hunting.stationLevel = 2
    save.techPoints = 9
    hydrateTechFields(save as Save)
    expect(save.knightLevel).toBe(6)
    expect(save.techPoints).toBe(9)
  })
})
