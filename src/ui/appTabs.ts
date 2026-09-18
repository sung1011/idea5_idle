export const APP_TABS = [
  { id: 'workshop', label: '工坊' },
  { id: 'workers', label: '工人' },
  { id: 'workersV2', label: '工人v2' },
  { id: 'encounters', label: '主线' },
  { id: 'tech', label: '科技' },
] as const

export type AppTabId = (typeof APP_TABS)[number]['id']

export const APP_TAB_KEY = 'idea5IdleAppTab'
export const DEFAULT_APP_TAB: AppTabId = 'encounters'

function storageOf(storage?: Storage | null): Storage | null {
  if (storage) return storage
  if (typeof localStorage === 'undefined') return null
  return localStorage
}

export function isAppTabId(id: unknown): id is AppTabId {
  return typeof id === 'string' && APP_TABS.some((tab) => tab.id === id)
}

export function appTabOf(id: unknown): AppTabId {
  return isAppTabId(id) ? id : DEFAULT_APP_TAB
}

export function loadAppTab(storage?: Storage | null): AppTabId {
  const store = storageOf(storage)
  if (!store) return DEFAULT_APP_TAB
  try {
    return appTabOf(store.getItem(APP_TAB_KEY))
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
