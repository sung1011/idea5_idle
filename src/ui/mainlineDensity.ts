import { ref } from 'vue'

export const MAINLINE_DENSITY_KEY = 'idea5IdleMainlineDensity'
export const MAINLINE_DENSITY_IDS = ['brief', 'detail'] as const
export type MainlineDensityId = (typeof MAINLINE_DENSITY_IDS)[number]

export const MAINLINE_DENSITY_LABELS: Record<MainlineDensityId, string> = {
  brief: '简',
  detail: '详',
}

export const DEFAULT_MAINLINE_DENSITY: MainlineDensityId = 'detail'

function storageOf(storage?: Storage | null): Storage | null {
  if (storage) return storage
  if (typeof localStorage === 'undefined') return null
  return localStorage
}

export function isMainlineDensityId(id: unknown): id is MainlineDensityId {
  return id === 'brief' || id === 'detail'
}

export function mainlineDensityOf(id: unknown): MainlineDensityId {
  return isMainlineDensityId(id) ? id : DEFAULT_MAINLINE_DENSITY
}

export function loadMainlineDensity(storage?: Storage | null): MainlineDensityId {
  const store = storageOf(storage)
  if (!store) return DEFAULT_MAINLINE_DENSITY
  try {
    return mainlineDensityOf(store.getItem(MAINLINE_DENSITY_KEY))
  } catch {
    return DEFAULT_MAINLINE_DENSITY
  }
}

export function saveMainlineDensity(id: unknown, storage?: Storage | null): MainlineDensityId {
  const next = mainlineDensityOf(id)
  const store = storageOf(storage)
  if (!store) return next
  try {
    store.setItem(MAINLINE_DENSITY_KEY, next)
  } catch {
    // quota / private mode
  }
  return next
}

export const mainlineDensity = ref(loadMainlineDensity())

export function selectMainlineDensity(id: unknown, storage?: Storage | null): MainlineDensityId {
  const next = saveMainlineDensity(id, storage)
  mainlineDensity.value = next
  return next
}
