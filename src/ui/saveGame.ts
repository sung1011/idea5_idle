import { hydrateBank } from '../sim/bank'
import { createSave, normalizeDiamonds } from '../sim/createSave'
import { hydrateEncounterFields } from '../sim/encounters'
import { hydrateMessages } from '../sim/messages'
import { normalizeRngState } from '../sim/rng'
import { hydrateStations } from '../sim/stationProgress'
import { clampStationAssignments } from '../sim/assign'
import { hydrateWorkers } from '../sim/recruit'
import { hydrateForgedTools, migrateWorkerToolsToStations } from '../sim/tools'
import { hydrateTechFields } from '../sim/tech'
import { WORKER_QUALITY_REV } from '../sim/tables'
import type { Save } from '../sim/types'

export const SAVE_KEY = 'idea5Idle'

type LegacySave = Save & {
  capacity?: unknown
  items?: unknown
}

function canUseStorage(storage?: Storage | null): storage is Storage {
  return !!storage
}

function storageOf(storage?: Storage | null): Storage | null {
  if (storage) return storage
  if (typeof localStorage === 'undefined') return null
  return localStorage
}

function looksLikeSave(value: unknown): value is LegacySave {
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

/** 旧档 bank / items 收数量；capacity 丢掉。 */
export function hydrateLoadedSave(parsed: unknown): Save | null {
  if (!looksLikeSave(parsed)) return null
  const blank = createSave()
  const { capacity: _ignoredCapacity, items, bank, ...rest } = parsed
  const mail = hydrateMessages(
    (parsed as { messages?: unknown }).messages,
    (parsed as { nextMessageId?: unknown }).nextMessageId,
  )
  const merged: Save = {
    ...blank,
    ...rest,
    bank: { ...hydrateBank(items), ...hydrateBank(bank) },
    workers: hydrateWorkers(
      parsed.workers,
      (parsed as { workerQualityRev?: unknown }).workerQualityRev,
    ),
    workerQualityRev: WORKER_QUALITY_REV,
    stations: hydrateStations(parsed.stations),
    diamonds: normalizeDiamonds((parsed as { diamonds?: unknown }).diamonds),
    messages: mail.messages,
    nextMessageId: mail.nextMessageId,
    offlineCount:
      typeof (parsed as { offlineCount?: unknown }).offlineCount === 'number' &&
      Number.isFinite((parsed as { offlineCount?: number }).offlineCount) &&
      (parsed as { offlineCount: number }).offlineCount > 0
        ? Math.floor((parsed as { offlineCount: number }).offlineCount)
        : 0,
    rngState: normalizeRngState((parsed as { rngState?: unknown }).rngState),
    forgedTools: hydrateForgedTools((parsed as { forgedTools?: unknown }).forgedTools),
  }
  migrateWorkerToolsToStations(merged, parsed.workers)
  clampStationAssignments(merged)
  hydrateTechFields(merged)
  if (!Array.isArray(parsed.encounters)) merged.encounters = []
  return hydrateEncounterFields(merged)
}

export function loadSave(storage?: Storage | null): Save | null {
  const store = storageOf(storage)
  if (!canUseStorage(store)) return null
  try {
    const raw = store.getItem(SAVE_KEY)
    if (!raw) return null
    return hydrateLoadedSave(JSON.parse(raw))
  } catch {
    return null
  }
}

export function persistSave(save: Save, storage?: Storage | null): void {
  const store = storageOf(storage)
  if (!canUseStorage(store)) return
  try {
    store.setItem(SAVE_KEY, JSON.stringify(save))
  } catch {
    // quota / private mode
  }
}

export function clearSave(storage?: Storage | null): void {
  const store = storageOf(storage)
  if (!canUseStorage(store)) return
  try {
    store.removeItem(SAVE_KEY)
  } catch {
    // private mode
  }
}
