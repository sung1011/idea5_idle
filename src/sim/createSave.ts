import { firstOrderId } from './orders'
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
    currentOrderId: firstOrderId(),
    orderIndex: 0,
    orderSubmitted: false,
    departCount: 0,
    lastDepartAt: null,
  }
}
