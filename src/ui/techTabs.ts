import { isTechTabId, TECH_TAB_IDS, type TechTabId } from '../sim/tech'

export const TECH_TAB_KEY = 'idea5IdleTechTab'
export const DEFAULT_TECH_TAB: TechTabId = TECH_TAB_IDS[0]

function storageOf(storage?: Storage | null): Storage | null {
  if (storage) return storage
  if (typeof localStorage === 'undefined') return null
  return localStorage
}

export function techTabOf(id: unknown): TechTabId {
  return isTechTabId(id) ? id : DEFAULT_TECH_TAB
}

export function loadTechTab(storage?: Storage | null): TechTabId {
  const store = storageOf(storage)
  if (!store) return DEFAULT_TECH_TAB
  try {
    return techTabOf(store.getItem(TECH_TAB_KEY))
  } catch {
    return DEFAULT_TECH_TAB
  }
}

export function saveTechTab(id: unknown, storage?: Storage | null): TechTabId {
  const next = techTabOf(id)
  const store = storageOf(storage)
  if (!store) return next
  try {
    store.setItem(TECH_TAB_KEY, next)
  } catch {
    // quota / private mode
  }
  return next
}
