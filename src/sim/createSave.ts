import { generateEncounterBoard } from './encounters'
import { hydrateStations } from './stationProgress'
import { START_DIAMONDS, START_GOLD, WORKER_QUALITY_REV } from './tables'
import type { Save } from './types'

export { blankStation } from './stationProgress'

/** 旧档缺字段或脏值时钉回 0。 */
export function normalizeDiamonds(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return START_DIAMONDS
  return Math.floor(value)
}

export function createSave(): Save {
  return {
    gold: START_GOLD,
    diamonds: START_DIAMONDS,
    bank: {},
    workers: [],
    stations: hydrateStations(),
    lastTick: Date.now(),
    elapsedS: 0,
    nextWorkerId: 1,
    encounters: generateEncounterBoard(0),
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
  }
}
