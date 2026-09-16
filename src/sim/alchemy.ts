import { ALCHEMY_COST_OPTIONS, ITEM_DEF } from './tables'
import type { EffectId, EffectInstance, ItemId } from './types'

export { ALCHEMY_COST_OPTIONS }

/** 炼金效果解析口。本阶段不填 effectId 数值，药剂不能生效。 */
export function potionEffects(_itemId: ItemId): EffectInstance[] {
  return []
}

/** 与工具 / 食物共用 effectId 解析；药剂本阶段恒为 0。 */
export function potionEffectValue(_itemId: ItemId | null | undefined, _effectId: EffectId): number {
  return 0
}

export function alchemyCostLabel(rules: { itemId: ItemId; qty: number }[]): string {
  const first = rules[0]
  return first ? ITEM_DEF[first.itemId].label : '原料'
}
