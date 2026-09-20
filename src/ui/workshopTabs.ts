import { STATION_DEF } from '../sim/tables'
import type { StationId } from '../sim/types'

export const WORKSHOP_TAB_KEY = 'idea5IdleWorkshopStation'
export const LEGACY_WORKSHOP_LINE_KEY = 'idea5IdleWorkshopLine'

/** 工人页左栏 / 派站顺序。工坊页左侧改用 WORKSHOP_GROUPS，不进存档。 */
export const WORKSHOP_TAB_IDS: readonly StationId[] = [
  'mining',
  'forging',
  'hunting',
  'cooking',
  'herbalism',
  'alchemy',
]

export type WorkshopGroupId = 'potion' | 'food' | 'weapon'

export type WorkshopGroupDef = {
  id: WorkshopGroupId
  label: string
  stations: readonly [StationId, StationId]
}

/** 工坊页左侧三组竖签，上→下：药剂 / 食物 / 武器。 */
export const WORKSHOP_GROUPS: readonly WorkshopGroupDef[] = [
  { id: 'potion', label: '药剂', stations: ['herbalism', 'alchemy'] },
  { id: 'food', label: '食物', stations: ['hunting', 'cooking'] },
  { id: 'weapon', label: '武器', stations: ['mining', 'forging'] },
]

/** 工人页「派入」扫空槽：组上→下、站内左→右。 */
export const DISPATCH_STATION_IDS: readonly StationId[] = WORKSHOP_GROUPS.flatMap((row) => [...row.stations])

export const WORKSHOP_GROUP_IDS: readonly WorkshopGroupId[] = WORKSHOP_GROUPS.map((row) => row.id)

const STATION_TO_GROUP = {
  herbalism: 'potion',
  alchemy: 'potion',
  hunting: 'food',
  cooking: 'food',
  mining: 'weapon',
  forging: 'weapon',
} as const satisfies Record<StationId, WorkshopGroupId>

/** 竖签 / 工人左栏仍按 7 行均分，去掉钓鱼后不把剩余 6 站拉高。 */
export const WORKSHOP_RAIL_ROW_COUNT = 7

export const DEFAULT_WORKSHOP_TAB: StationId = WORKSHOP_TAB_IDS[0]
export const DEFAULT_WORKSHOP_GROUP: WorkshopGroupId = STATION_TO_GROUP[DEFAULT_WORKSHOP_TAB]

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

export function isWorkshopGroupId(id: unknown): id is WorkshopGroupId {
  return typeof id === 'string' && (WORKSHOP_GROUP_IDS as readonly string[]).includes(id)
}

export function workshopTabOf(id: unknown): StationId {
  if (isWorkshopTabId(id)) return id
  if (typeof id === 'string' && Object.prototype.hasOwnProperty.call(LEGACY_LINE_TO_STATION, id)) {
    return LEGACY_LINE_TO_STATION[id]
  }
  return DEFAULT_WORKSHOP_TAB
}

export function workshopGroupOfStation(id: StationId): WorkshopGroupId {
  return STATION_TO_GROUP[id]
}

export function workshopGroupDef(id: WorkshopGroupId): WorkshopGroupDef {
  return WORKSHOP_GROUPS.find((row) => row.id === id) ?? WORKSHOP_GROUPS[0]
}

export function workshopGroupOf(id: unknown): WorkshopGroupId {
  if (isWorkshopGroupId(id)) return id
  return workshopGroupOfStation(workshopTabOf(id))
}

export function stationsOfWorkshopGroup(id: WorkshopGroupId): readonly [StationId, StationId] {
  return workshopGroupDef(id).stations
}

export function workshopTabLabel(id: StationId): string {
  return STATION_DEF[id].label
}

export function workshopGroupLabel(id: WorkshopGroupId): string {
  return workshopGroupDef(id).label
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
