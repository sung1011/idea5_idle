import { ALCHEMY_COST_OPTIONS, ITEM_DEF } from './tables'
import type { EffectId, EffectInstance, ItemId } from './types'

export { ALCHEMY_COST_OPTIONS }
export { rollAlchemyPotionBatch } from './potions'

/** 炼金效果解析口。药剂走账号级 buff，不占 effectId。 */
export function potionEffects(_itemId: ItemId): EffectInstance[] {
  return []
}

/** 与工具 / 食物共用 effectId 解析；药剂恒为 0，效率改走兴奋剂 / 赶工粉，产量改走双份雾。 */
export function potionEffectValue(_itemId: ItemId | null | undefined, _effectId: EffectId): number {
  return 0
}

export function alchemyCostLabel(rules: { itemId: ItemId; qty: number }[]): string {
  const first = rules[0]
  return first ? ITEM_DEF[first.itemId].label : '原料'
}
