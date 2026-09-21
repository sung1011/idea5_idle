import { PLAYABLE_CHAINS, STATION_DEF, STATION_ORDER } from '../sim/tables'
import type { StationId } from '../sim/types'

export const WORKSHOP_TAB_KEY = 'idea5IdleWorkshopStation'
export const LEGACY_WORKSHOP_LINE_KEY = 'idea5IdleWorkshopLine'

/** 工人页左栏 / 派站顺序。与 STATION_ORDER 同一份，工坊页左侧改用 WORKSHOP_GROUPS，不进存档。 */
export const WORKSHOP_TAB_IDS: readonly StationId[] = STATION_ORDER

export type WorkshopGroupId = 'potion' | 'food' | 'weapon'

export type WorkshopGroupDef = {
  id: WorkshopGroupId
  label: string
  stations: readonly [StationId, StationId]
}

export type WorkshopGroupProgress = {
  from: string
  to: string
}

/** 工坊生产进度按组上色；竖签 chrome 仍走金边羊皮纸。 */
export const WORKSHOP_GROUP_PROGRESS: Record<WorkshopGroupId, WorkshopGroupProgress> = {
  potion: { from: '#6a8f72', to: '#8fb89a' },
  food: { from: '#b07a52', to: '#c99470' },
  weapon: { from: '#8a6a4e', to: '#a48462' },
}

export function workshopGroupProgressStyle(id: WorkshopGroupId): Record<string, string> {
  const row = WORKSHOP_GROUP_PROGRESS[id]
  return {
    '--workshop-progress-from': row.from,
    '--workshop-progress-to': row.to,
  }
}

const WORKSHOP_GROUP_META: readonly { id: WorkshopGroupId; label: string }[] = [
  { id: 'potion', label: '药剂' },
  { id: 'food', label: '食物' },
  { id: 'weapon', label: '武器' },
]

/** 工坊页左侧三组竖签，上→下：药剂 / 食物 / 武器。站序来自 PLAYABLE_CHAINS。 */
export const WORKSHOP_GROUPS: readonly WorkshopGroupDef[] = PLAYABLE_CHAINS.map((stations, index) => {
  const meta = WORKSHOP_GROUP_META[index]
  if (!meta) throw new Error('工坊组元数据与 PLAYABLE_CHAINS 不对齐')
  return { id: meta.id, label: meta.label, stations }
})

/** 工人页「派入」扫空槽：与 STATION_ORDER 同一份。 */
export const DISPATCH_STATION_IDS: readonly StationId[] = STATION_ORDER

export const WORKSHOP_GROUP_IDS: readonly WorkshopGroupId[] = WORKSHOP_GROUPS.map((row) => row.id)

const STATION_TO_GROUP = Object.fromEntries(
  WORKSHOP_GROUPS.flatMap((row) => row.stations.map((id) => [id, row.id])),
) as Record<StationId, WorkshopGroupId>

/** 竖签 / 工人左栏仍按 7 行均分，去掉钓鱼后不把剩余 6 站拉高。 */
export const WORKSHOP_RAIL_ROW_COUNT = 7

/** 新档只开采药，工坊默认落到药剂组。 */
export const DEFAULT_WORKSHOP_TAB: StationId = 'herbalism'
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

export function stationProgressStyle(id: StationId): Record<string, string> {
  return workshopGroupProgressStyle(workshopGroupOfStation(id))
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
