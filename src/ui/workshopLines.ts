import { STATION_DEF } from '../sim/tables'
import type { StationId } from '../sim/types'

export const WORKSHOP_LINE_KEY = 'idea5IdleWorkshopLine'

export type WorkshopLineId = 'smelt' | 'hunt' | 'brew' | 'fish'

export type WorkshopLine = {
  id: WorkshopLineId
  label: string
  stationIds: readonly StationId[]
}

/** 工坊页左侧四条产线 → 右侧站卡。只服务 UI，不进存档。 */
export const WORKSHOP_LINES: readonly WorkshopLine[] = [
  { id: 'smelt', label: '矿冶', stationIds: ['mining', 'forging'] },
  { id: 'hunt', label: '狩猎', stationIds: ['hunting', 'cooking'] },
  { id: 'brew', label: '药炼', stationIds: ['herbalism', 'alchemy'] },
  { id: 'fish', label: '钓鱼', stationIds: ['fishing'] },
]

export const DEFAULT_WORKSHOP_LINE: WorkshopLineId = WORKSHOP_LINES[0].id

export function isWorkshopLineId(id: unknown): id is WorkshopLineId {
  return typeof id === 'string' && WORKSHOP_LINES.some((line) => line.id === id)
}

export function workshopLineOf(id: unknown): WorkshopLine {
  return WORKSHOP_LINES.find((line) => line.id === id) ?? WORKSHOP_LINES[0]
}

export function workshopLineTitle(line: WorkshopLine): string {
  return line.stationIds.map((id) => STATION_DEF[id].label).join(' → ')
}

function storageOf(storage?: Storage | null): Storage | null {
  if (storage) return storage
  if (typeof localStorage === 'undefined') return null
  return localStorage
}

export function loadWorkshopLine(storage?: Storage | null): WorkshopLineId {
  const store = storageOf(storage)
  if (!store) return DEFAULT_WORKSHOP_LINE
  try {
    return workshopLineOf(store.getItem(WORKSHOP_LINE_KEY)).id
  } catch {
    return DEFAULT_WORKSHOP_LINE
  }
}

export function saveWorkshopLine(id: unknown, storage?: Storage | null): WorkshopLineId {
  const next = workshopLineOf(id).id
  const store = storageOf(storage)
  if (!store) return next
  try {
    store.setItem(WORKSHOP_LINE_KEY, next)
  } catch {
    // quota / private mode
  }
  return next
}
