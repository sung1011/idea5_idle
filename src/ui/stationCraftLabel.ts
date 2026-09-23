import { selectedCategoryDef } from '../sim/stationProgress'
import { ITEM_DEF } from '../sim/tables'
import type { Save, StationId } from '../sim/types'

/**
 * 站行当前目标物资。只读选中品类的 `outputs`，不看是否有人、是否卡住。
 * 多产出用「、」；没有产出时用品类名。
 */
export function stationCraftLabel(save: Save, stationId: StationId): string {
  const cat = selectedCategoryDef(save, stationId)
  const names = cat.outputs.map((io) => ITEM_DEF[io.itemId]?.label).filter((label): label is string => !!label)
  if (!names.length) return cat.label
  return names.join('、')
}
