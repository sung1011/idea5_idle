import { categoryPickOptions, selectedCategoryDef } from '../sim/stationProgress'
import { findCategory, ITEM_DEF } from '../sim/tables'
import type { ItemId, Save, StationId } from '../sim/types'
import type { UiSelectOption } from './uiSelect'

/** 品类产出短名。多产出用「、」；没有产出时用品类名。 */
export function categoryCraftLabel(cat: { label: string; outputs: { itemId: ItemId }[] }): string {
  const names = cat.outputs.map((io) => ITEM_DEF[io.itemId]?.label).filter((label): label is string => !!label)
  if (!names.length) return cat.label
  return names.join('、')
}

/**
 * 站行当前目标物资。只读选中品类的 `outputs`，不看是否有人、是否卡住。
 */
export function stationCraftLabel(save: Save, stationId: StationId): string {
  return categoryCraftLabel(selectedCategoryDef(save, stationId))
}

/**
 * 工作区产出下拉。文案与 `stationCraftLabel` 相同，值是品类 id。
 * 未解锁置灰，并标出站等级门槛。
 */
export function stationCraftPickOptions(save: Save, stationId: StationId): UiSelectOption[] {
  return categoryPickOptions(save, stationId).map((row) => {
    const cat = findCategory(stationId, row.id)
    const name = cat ? categoryCraftLabel(cat) : row.label
    return {
      value: row.id,
      label: row.unlocked ? name : `${name}（Lv${row.unlockLevel}）`,
      disabled: !row.unlocked,
    }
  })
}

/** 只有一项时下拉只读，仍显示当前产出。 */
export function stationCraftPickReadonly(save: Save, stationId: StationId): boolean {
  return categoryPickOptions(save, stationId).length <= 1
}
