import { normalizeKnightLevel } from './knightLevel'
import { PLAYABLE_STATION_IDS } from './tables'
import type { Save, StationId } from './types'

/** 骑士等级门槛：到该级才开放对应站。新档骑士 1 级只开采药。 */
export const STATION_UNLOCK_KNIGHT = {
  herbalism: 1,
  alchemy: 2,
  hunting: 3,
  cooking: 4,
  mining: 5,
  forging: 6,
} as const satisfies Record<StationId, number>

export function stationUnlockKnightLevel(stationId: StationId): number {
  return STATION_UNLOCK_KNIGHT[stationId]
}

export function knightLevelOf(save: Pick<Save, 'knightLevel'>): number {
  return normalizeKnightLevel(save.knightLevel)
}

export function isStationUnlocked(save: Pick<Save, 'knightLevel'>, stationId: StationId): boolean {
  return knightLevelOf(save) >= stationUnlockKnightLevel(stationId)
}

export function stationLockedTip(stationId: StationId): string {
  return `骑士 ${stationUnlockKnightLevel(stationId)} 级开放`
}

export function unlockedStationIds(save: Pick<Save, 'knightLevel'>): StationId[] {
  return PLAYABLE_STATION_IDS.filter((id) => isStationUnlocked(save, id))
}

/** 测试 / GM：按满级门槛开放六站，不改站等级与库存。 */
export function unlockPlayableStations(save: Save, knightLevel = PLAYABLE_STATION_IDS.length): Save {
  save.knightLevel = Math.max(1, Math.floor(knightLevel))
  return save
}
