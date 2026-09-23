import { computed, ref } from 'vue'
import { itemProducerStation } from '../sim/tables'
import type { ItemId, StationId } from '../sim/types'
import { loadAppTab, saveAppTab, type AppTabId } from './appTabs'
import { showStationDetail } from './stationDetailNav'
import {
  loadWorkshopTab,
  saveWorkshopTab,
  stationsOfWorkshopGroup,
  workshopGroupOf,
  workshopGroupOfStation,
  type WorkshopGroupId,
} from './workshopTabs'

export { APP_TABS, DEFAULT_APP_TAB, isAppTabId, type AppTabId } from './appTabs'

export const appTab = ref(loadAppTab())
export const workshopTab = ref<StationId>(loadWorkshopTab())
export const workshopGroup = computed(() => workshopGroupOfStation(workshopTab.value))

export function selectAppTab(id: unknown, storage?: Storage | null): AppTabId {
  const next = saveAppTab(id, storage)
  appTab.value = next
  return next
}

export function selectWorkshopStation(id: unknown, storage?: Storage | null): StationId {
  const next = saveWorkshopTab(id, storage)
  workshopTab.value = next
  return next
}

/** 切工坊组。当前站已在该组则保留焦点，否则落到该组第一站。 */
export function selectWorkshopGroup(id: unknown, storage?: Storage | null): WorkshopGroupId {
  const group = workshopGroupOf(id)
  const current = workshopTab.value
  if (stationsOfWorkshopGroup(group).includes(current)) {
    selectWorkshopStation(current, storage)
    return group
  }
  selectWorkshopStation(stationsOfWorkshopGroup(group)[0], storage)
  return group
}

export function syncWorkshopTab(storage?: Storage | null): StationId {
  workshopTab.value = loadWorkshopTab(storage)
  return workshopTab.value
}

/** 切到底栏工坊并选中该站。无效 id 回落到默认工坊签。 */
export function openWorkshopStation(stationId: unknown, storage?: Storage | null): StationId {
  const next = selectWorkshopStation(stationId, storage)
  selectAppTab('workshop', storage)
  showStationDetail(next)
  return next
}

/** 切到底栏工坊，并选中该物资主产站。金币 / Buff / 非工具旧物返回 null。 */
export function openItemWorkshop(itemId: ItemId, storage?: Storage | null): StationId | null {
  const stationId = itemProducerStation(itemId)
  if (!stationId) return null
  return openWorkshopStation(stationId, storage)
}
