import { ref } from 'vue'
import { isEncounterBoardId, type EncounterBoardId } from '../sim/encounters'

export const MAINLINE_TAB_KEY = 'idea5IdleMainlineTab'
export const MAINLINE_TAB_IDS = ['battlefield', 'market', 'dungeon', 'mine'] as const
export type MainlineTabId = (typeof MAINLINE_TAB_IDS)[number]

export const MAINLINE_TAB_LABELS: Record<MainlineTabId, string> = {
  battlefield: '战场',
  market: '商场',
  dungeon: '地牢',
  mine: '矿洞',
}

export const DEFAULT_MAINLINE_TAB: MainlineTabId = 'battlefield'

function storageOf(storage?: Storage | null): Storage | null {
  if (storage) return storage
  if (typeof localStorage === 'undefined') return null
  return localStorage
}

export function isMainlineTabId(id: unknown): id is MainlineTabId {
  return id === 'battlefield' || id === 'market' || id === 'dungeon' || id === 'mine'
}

export function mainlineTabOf(id: unknown): MainlineTabId {
  if (isMainlineTabId(id)) return id
  return isEncounterBoardId(id) ? id : DEFAULT_MAINLINE_TAB
}

export function loadMainlineTab(storage?: Storage | null): MainlineTabId {
  const store = storageOf(storage)
  if (!store) return DEFAULT_MAINLINE_TAB
  try {
    return mainlineTabOf(store.getItem(MAINLINE_TAB_KEY))
  } catch {
    return DEFAULT_MAINLINE_TAB
  }
}

export function saveMainlineTab(id: unknown, storage?: Storage | null): MainlineTabId {
  const next = mainlineTabOf(id)
  const store = storageOf(storage)
  if (!store) return next
  try {
    store.setItem(MAINLINE_TAB_KEY, next)
  } catch {
    // quota / private mode
  }
  return next
}

export const mainlineTab = ref(loadMainlineTab())

export function selectMainlineTab(id: unknown, storage?: Storage | null): MainlineTabId {
  const next = saveMainlineTab(id, storage)
  mainlineTab.value = next
  return next
}

export type { EncounterBoardId }
