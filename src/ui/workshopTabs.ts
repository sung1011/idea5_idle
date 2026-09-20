import { STATION_DEF } from '../sim/tables'
import type { StationId } from '../sim/types'

export const WORKSHOP_TAB_KEY = 'idea5IdleWorkshopStation'
export const LEGACY_WORKSHOP_LINE_KEY = 'idea5IdleWorkshopLine'

/** 工坊页左侧竖签顺序。只服务 UI，不进存档，也不改 PLAYABLE_CHAINS。 */
export const WORKSHOP_TAB_IDS: readonly StationId[] = [
  'mining',
  'forging',
  'hunting',
  'cooking',
  'herbalism',
  'alchemy',
]

/** 竖签 / 工人左栏仍按 7 行均分，去掉钓鱼后不把剩余 6 站拉高。 */
export const WORKSHOP_RAIL_ROW_COUNT = 7

export const DEFAULT_WORKSHOP_TAB: StationId = WORKSHOP_TAB_IDS[0]

/** 旧四条产线签 → 该线第一站。 */
const LEGACY_LINE_TO_STATION: Record<string, StationId> = {
  smelt: 'mining',
  hunt: 'hunting',
  brew: 'herbalism',
  fish: 'hunting',
  fishing: 'hunting',
}

export function isWorkshopTabId(id: unknown): id is StationId {
  return typeof id === 'string' && (WORKSHOP_TAB_IDS as readonly string[]).includes(id)
}

export function workshopTabOf(id: unknown): StationId {
  if (isWorkshopTabId(id)) return id
  if (typeof id === 'string' && Object.prototype.hasOwnProperty.call(LEGACY_LINE_TO_STATION, id)) {
    return LEGACY_LINE_TO_STATION[id]
  }
  return DEFAULT_WORKSHOP_TAB
}

export function workshopTabLabel(id: StationId): string {
  return STATION_DEF[id].label
}

function storageOf(storage?: Storage | null): Storage | null {
  if (storage) return storage
  if (typeof localStorage === 'undefined') return null
  return localStorage
}

function persistTab(id: StationId, store: Storage): void {
  try {
    store.setItem(WORKSHOP_TAB_KEY, id)
    store.removeItem(LEGACY_WORKSHOP_LINE_KEY)
  } catch {
    // quota / private mode
  }
}

export function loadWorkshopTab(storage?: Storage | null): StationId {
  const store = storageOf(storage)
  if (!store) return DEFAULT_WORKSHOP_TAB
  try {
    const fresh = store.getItem(WORKSHOP_TAB_KEY)
    if (fresh != null) return workshopTabOf(fresh)
    const legacy = store.getItem(LEGACY_WORKSHOP_LINE_KEY)
    if (legacy != null) {
      const next = workshopTabOf(legacy)
      persistTab(next, store)
      return next
    }
    return DEFAULT_WORKSHOP_TAB
  } catch {
    return DEFAULT_WORKSHOP_TAB
  }
}

export function saveWorkshopTab(id: unknown, storage?: Storage | null): StationId {
  const next = workshopTabOf(id)
  const store = storageOf(storage)
  if (!store) return next
  persistTab(next, store)
  return next
}
