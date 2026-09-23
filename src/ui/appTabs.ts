export const APP_TABS = [
  { id: 'workshop', label: '工坊' },
  { id: 'encounters', label: 'PVE' },
  { id: 'pvp', label: 'PVP' },
  { id: 'tech', label: '科技' },
] as const

export type AppTabId = (typeof APP_TABS)[number]['id']

export const APP_TAB_KEY = 'idea5IdleAppTab'
export const DEFAULT_APP_TAB: AppTabId = 'encounters'
const LEGACY_APP_TAB: Record<string, AppTabId> = { workers: 'workshop', workersV2: 'workshop' }

function storageOf(storage?: Storage | null): Storage | null {
  if (storage) return storage
  if (typeof localStorage === 'undefined') return null
  return localStorage
}

export function isAppTabId(id: unknown): id is AppTabId {
  return typeof id === 'string' && APP_TABS.some((tab) => tab.id === id)
}

export function appTabOf(id: unknown): AppTabId {
  if (isAppTabId(id)) return id
  if (typeof id === 'string' && Object.prototype.hasOwnProperty.call(LEGACY_APP_TAB, id)) {
    return LEGACY_APP_TAB[id]
  }
  return DEFAULT_APP_TAB
}

export function loadAppTab(storage?: Storage | null): AppTabId {
  const store = storageOf(storage)
  if (!store) return DEFAULT_APP_TAB
  try {
    const raw = store.getItem(APP_TAB_KEY)
    const next = appTabOf(raw)
    if (raw === 'workers' || raw === 'workersV2') store.setItem(APP_TAB_KEY, next)
    return next
  } catch {
    return DEFAULT_APP_TAB
  }
}

export function saveAppTab(id: unknown, storage?: Storage | null): AppTabId {
  const next = appTabOf(id)
  const store = storageOf(storage)
  if (!store) return next
  try {
    store.setItem(APP_TAB_KEY, next)
  } catch {
    // quota / private mode
  }
  return next
}
