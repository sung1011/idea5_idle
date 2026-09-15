import { START_GOLD, STATION_IDS } from './tables'
import type { Save, StationState } from './types'

export function blankStation(): StationState {
  return { progress: 0, stallReason: null, completed: 0, resonanceStreak: 0 }
}

export function createSave(): Save {
  const stations = Object.fromEntries(STATION_IDS.map((id) => [id, blankStation()])) as Save['stations']
  return {
    gold: START_GOLD,
    bank: {},
    workers: [],
    stations,
    lastTick: Date.now(),
    elapsedS: 0,
    nextWorkerId: 1,
  }
}
