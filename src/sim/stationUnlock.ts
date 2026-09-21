import { normalizeKnightLevel } from './knightLevel'
import { PLAYABLE_STATION_IDS, STATION_DEF } from './tables'
import type { Save, StationId } from './types'

/** 骑士等级门槛：到该级才开放对应站。新档骑士 1 级只开采药。 */
export const STATION_UNLOCK_KNIGHT = {
  herbalism: 1,
  alchemy: 2,
  hunting: 5,
  cooking: 6,
  mining: 9,
  inscription: 10,
} as const satisfies Record<StationId, number>

export const STATION_UNLOCK_KNIGHT_MAX = Math.max(
  ...PLAYABLE_STATION_IDS.map((id) => STATION_UNLOCK_KNIGHT[id]),
)

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
  return `骑士 ${stationUnlockKnightLevel(stationId)} 级开放${STATION_DEF[stationId].label}`
}

/** 一组里尚未开放、门槛最低的下一站。 */
export function nextLockedStation(
  save: Pick<Save, 'knightLevel'>,
  stationIds: readonly StationId[],
): StationId | null {
  let next: StationId | null = null
  let best = Number.POSITIVE_INFINITY
  for (const id of stationIds) {
    if (isStationUnlocked(save, id)) continue
    const lv = stationUnlockKnightLevel(id)
    if (lv < best) {
      best = lv
      next = id
    }
  }
  return next
}

export function workshopGroupLockedTip(
  save: Pick<Save, 'knightLevel'>,
  stationIds: readonly StationId[],
): string | null {
  const next = nextLockedStation(save, stationIds)
  return next ? stationLockedTip(next) : null
}

export function unlockedStationIds(save: Pick<Save, 'knightLevel'>): StationId[] {
  return PLAYABLE_STATION_IDS.filter((id) => isStationUnlocked(save, id))
}

/** 测试 / GM：按满级门槛开放六站，不改站等级与库存。 */
export function unlockPlayableStations(save: Save, knightLevel = STATION_UNLOCK_KNIGHT_MAX): Save {
  save.knightLevel = Math.max(1, Math.floor(knightLevel))
  return save
}
