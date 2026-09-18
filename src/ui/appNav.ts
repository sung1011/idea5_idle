import { ref } from 'vue'
import { itemProducerStation } from '../sim/tables'
import type { ItemId, StationId } from '../sim/types'
import { loadWorkshopTab, saveWorkshopTab } from './workshopTabs'

export const APP_TABS = [
  { id: 'workshop', label: '工坊' },
  { id: 'workers', label: '工人' },
  { id: 'encounters', label: '主线' },
  { id: 'tech', label: '科技' },
] as const

export type AppTabId = (typeof APP_TABS)[number]['id']

export const DEFAULT_APP_TAB: AppTabId = 'encounters'

export const appTab = ref<AppTabId>(DEFAULT_APP_TAB)
export const workshopTab = ref<StationId>(loadWorkshopTab())

export function isAppTabId(id: unknown): id is AppTabId {
  return typeof id === 'string' && APP_TABS.some((tab) => tab.id === id)
}

export function selectAppTab(id: unknown): AppTabId {
  const next = isAppTabId(id) ? id : DEFAULT_APP_TAB
  appTab.value = next
  return next
}

export function selectWorkshopStation(id: unknown, storage?: Storage | null): StationId {
  const next = saveWorkshopTab(id, storage)
  workshopTab.value = next
  return next
}

export function syncWorkshopTab(storage?: Storage | null): StationId {
  workshopTab.value = loadWorkshopTab(storage)
  return workshopTab.value
}

/** 切到底栏工坊，并选中该物资主产站。金币 / Buff / 旧物返回 null。 */
export function openItemWorkshop(itemId: ItemId, storage?: Storage | null): StationId | null {
  const stationId = itemProducerStation(itemId)
  if (!stationId) return null
  selectWorkshopStation(stationId, storage)
  selectAppTab('workshop')
  return stationId
}
