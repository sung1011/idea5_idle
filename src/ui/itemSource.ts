import { ref } from 'vue'
import { isStationUnlocked } from '../sim/stationUnlock'
import {
  ITEM_DEF,
  isAnyPotionNeed,
  isAnyRuneNeed,
  isPotionItemId,
  isRuneItemId,
  isStationToolId,
  isToolItemId,
  itemProducerStation,
  STATION_DEF,
} from '../sim/tables'
import type { CategoryId, ItemId, Save, StationId } from '../sim/types'

/** 订单消耗跳转后，来源品类 / 站卡青色闪一次的时长。 */
export const ITEM_SOURCE_FLASH_MS = 1800

export type ItemSourceHint = {
  stationId: StationId
  /** 要闪的下拉品类；空则闪整张站卡（炼金 / 铭刻 / 单品类站 / 通配）。 */
  categoryIds: readonly CategoryId[]
}

export type ItemSourceFlash = ItemSourceHint & { until: number }

export const itemSourceFlash = ref<ItemSourceFlash | null>(null)

let flashTimer: ReturnType<typeof setTimeout> | null = null

/** itemId → 主产站 + 品类。只读表，不改 selectedCategory。 */
export function itemSourceHint(itemId: ItemId): ItemSourceHint | null {
  const stationId = itemProducerStation(itemId)
  if (!stationId) return null
  if (
    isAnyPotionNeed(itemId) ||
    isAnyRuneNeed(itemId) ||
    isPotionItemId(itemId) ||
    itemId === 'potion' ||
    isRuneItemId(itemId) ||
    isToolItemId(itemId) ||
    isStationToolId(itemId)
  ) {
    return { stationId, categoryIds: [] }
  }
  const cats = STATION_DEF[stationId].categories
  if (cats.length <= 1) return { stationId, categoryIds: [] }
  const matched = cats.filter((cat) => cat.outputs.some((io) => io.itemId === itemId)).map((cat) => cat.id)
  if (!matched.length) return { stationId, categoryIds: [] }
  return { stationId, categoryIds: matched }
}

export function formatItemSource(hint: ItemSourceHint): string {
  const station = STATION_DEF[hint.stationId].label
  if (!hint.categoryIds.length) return station
  const labels = hint.categoryIds.map((id) => {
    const cat = STATION_DEF[hint.stationId].categories.find((row) => row.id === id)
    return cat?.label ?? id
  })
  return `${station}·${labels.join('/')}`
}

export function itemSourceTip(itemId: ItemId, hint: ItemSourceHint): string {
  return `${ITEM_DEF[itemId].label}来自${formatItemSource(hint)}`
}

export function clearItemSourceFlash(): void {
  if (flashTimer != null) {
    clearTimeout(flashTimer)
    flashTimer = null
  }
  itemSourceFlash.value = null
}

/**
 * 站已解锁才开闪。不写存档、不调用 selectStationCategory。
 * 未解锁返回 hint 供浮字，但不挂 class。
 */
export function beginItemSourceFlash(
  itemId: ItemId,
  save?: Pick<Save, 'knightLevel'> | null,
): ItemSourceHint | null {
  clearItemSourceFlash()
  const hint = itemSourceHint(itemId)
  if (!hint) return null
  if (save && !isStationUnlocked(save, hint.stationId)) return hint
  itemSourceFlash.value = { ...hint, until: Date.now() + ITEM_SOURCE_FLASH_MS }
  flashTimer = setTimeout(clearItemSourceFlash, ITEM_SOURCE_FLASH_MS)
  return hint
}

export function isItemSourceStationFlash(stationId: StationId): boolean {
  const cur = itemSourceFlash.value
  return !!cur && cur.stationId === stationId && cur.categoryIds.length === 0
}

export function itemSourceFlashCategories(stationId: StationId): readonly CategoryId[] {
  const cur = itemSourceFlash.value
  if (!cur || cur.stationId !== stationId) return []
  return cur.categoryIds
}
