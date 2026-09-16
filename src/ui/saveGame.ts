import { createSave } from '../sim/createSave'
import { hydrateOrderFields } from '../sim/orders'
import { STATION_IDS } from '../sim/tables'
import type { Save, StationState } from '../sim/types'

export const SAVE_KEY = 'idea5Idle'

function canUseStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

function looksLikeSave(value: unknown): value is Save {
  if (!value || typeof value !== 'object') return false
  const s = value as Save
  return (
    typeof s.lastTick === 'number' &&
    typeof s.elapsedS === 'number' &&
    typeof s.gold === 'number' &&
    Array.isArray(s.workers) &&
    !!s.stations &&
    typeof s.stations === 'object'
  )
}

function blankStations(): Save['stations'] {
  return createSave().stations
}

function mergeStations(raw: Save['stations'] | undefined): Save['stations'] {
  const blank = blankStations()
  const next = { ...blank }
  if (!raw) return next
  for (const id of STATION_IDS) {
    const incoming = raw[id] as StationState | undefined
    if (!incoming) continue
    next[id] = {
      progress: incoming.progress ?? 0,
      stallReason: incoming.stallReason ?? null,
      completed: incoming.completed ?? 0,
      resonanceStreak: incoming.resonanceStreak ?? 0,
    }
  }
  return next
}

export function loadSave(): Save | null {
  if (!canUseStorage()) return null
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Save
    if (!looksLikeSave(parsed)) return null
    const blank = createSave()
    return hydrateOrderFields({
      ...blank,
      ...parsed,
      bank: parsed.bank ?? {},
      workers: parsed.workers ?? [],
      stations: mergeStations(parsed.stations),
    })
  } catch {
    return null
  }
}

export function persistSave(save: Save): void {
  if (!canUseStorage()) return
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save))
  } catch {
    // quota / private mode
  }
}
