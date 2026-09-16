import { generateEncounterBoard } from './encounters'
import { hydrateStations } from './stationProgress'
import { START_GOLD } from './tables'
import type { Save } from './types'

export { blankStation } from './stationProgress'

export function createSave(): Save {
  return {
    gold: START_GOLD,
    bank: {},
    workers: [],
    stations: hydrateStations(),
    lastTick: Date.now(),
    elapsedS: 0,
    nextWorkerId: 1,
    encounters: generateEncounterBoard(0),
    exploreCount: 0,
    departCount: 0,
    lastDepartAt: null,
  }
}
