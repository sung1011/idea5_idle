import { generateEncounterBoard } from './encounters'
import { encounterSlotCount } from './tech'
import { computeKnightLevel } from './knightLevel'
import { hydrateStations } from './stationProgress'
import { START_DIAMONDS, START_GOLD, START_TECH_POINTS, WORKER_QUALITY_REV } from './tables'
import type { Save } from './types'

export { blankStation } from './stationProgress'

/** 旧档缺字段或脏值时钉回 0。 */
export function normalizeDiamonds(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return START_DIAMONDS
  return Math.floor(value)
}

export function createSave(): Save {
  const stations = hydrateStations()
  const save: Save = {
    gold: START_GOLD,
    diamonds: START_DIAMONDS,
    bank: {},
    workers: [],
    stations,
    lastTick: Date.now(),
    elapsedS: 0,
    nextWorkerId: 1,
    encounters: [],
    mainChapter: 1,
    mainLootClaims: 0,
    workshopBuff: null,
    exploreCount: 0,
    departCount: 0,
    lastDepartAt: null,
    messages: [],
    nextMessageId: 1,
    offlineCount: 0,
    rngState: 1,
    forgedTools: [],
    workerQualityRev: WORKER_QUALITY_REV,
    /** 新档：骑士 1 级，灵感 START_TECH_POINTS。七站开局都是 Lv1，公式见 computeKnightLevel。 */
    knightLevel: 1,
    techPoints: START_TECH_POINTS,
    unlockedTechIds: [],
    techLevels: {},
  }
  save.knightLevel = computeKnightLevel(save)
  save.encounters = generateEncounterBoard(0, encounterSlotCount(save), {
    rng: save,
    mainChapter: save.mainChapter,
    starterCopperPawn: true,
  })
  return save
}
