import { normalizeKnightLevel } from './knightLevel'
import { isModuleId, isModuleUnlocked, levelGateTitle } from './moduleUnlock'
import { PLAYABLE_STATION_IDS, STATION_DEF } from './tables'
import type { Save, StationId } from './types'

/** 骑士等级门槛。1 级只开采药；炼金等站还要主线领奖写入 openedModules。 */
export const STATION_UNLOCK_KNIGHT = {
  herbalism: 1,
  alchemy: 2,
  hunting: 6,
  cooking: 8,
  mining: 16,
  inscription: 18,
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

export function isStationUnlocked(
  save: {
    openedModules?: readonly string[] | null
    guideQuestStep?: number
    guideQuestSkipped?: readonly string[] | null
  },
  stationId: StationId,
): boolean {
  if (stationUnlockKnightLevel(stationId) <= 1) return true
  if (save.openedModules?.includes(stationId)) return true
  return isModuleId(stationId) && isModuleUnlocked(save, stationId)
}

export function stationLockedTip(stationId: StationId): string {
  const level = stationUnlockKnightLevel(stationId)
  if (level <= 1) return `${STATION_DEF[stationId].label}已开放`
  return `完成主线「${levelGateTitle(level)}」后开启`
}

/** 一组里尚未开放、门槛最低的下一站。 */
export function nextLockedStation(
  save: Parameters<typeof isStationUnlocked>[0],
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
  save: Parameters<typeof isStationUnlocked>[0],
  stationIds: readonly StationId[],
): string | null {
  const next = nextLockedStation(save, stationIds)
  return next ? stationLockedTip(next) : null
}

export function unlockedStationIds(save: Parameters<typeof isStationUnlocked>[0]): StationId[] {
  return PLAYABLE_STATION_IDS.filter((id) => isStationUnlocked(save, id))
}

/** 测试：等级不够也允许派到后开的站，不改骑士等级。 */
export function keepStationsOpen(save: Save): Save {
  const ids = ['alchemy', 'hunting', 'cooking', 'mining', 'inscription', 'treasure']
  const next = new Set([...(save.openedModules ?? []), ...ids])
  save.openedModules = [...next]
  return save
}

/** 测试 / GM：按酋长等级把对应模块写入已开放，不改站等级与库存。 */
export function unlockPlayableStations(save: Save, knightLevel = STATION_UNLOCK_KNIGHT_MAX): Save {
  save.knightLevel = Math.max(1, Math.floor(knightLevel))
  const gates: Record<string, number> = {
    hunting: 6,
    market: 6,
    cooking: 8,
    restFood: 8,
    dungeon: 8,
    herb: 10,
    alchemy: 2,
    tech: 11,
    beast: 13,
    mining: 16,
    inscription: 18,
    rune: 18,
    treasure: 20,
  }
  const open = new Set(save.openedModules ?? [])
  for (const [id, need] of Object.entries(gates)) {
    if (need <= save.knightLevel) open.add(id)
  }
  save.openedModules = [...open]
  return save
}
