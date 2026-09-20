import { bankQty, takeFromBank } from './bank'
import { findWorker } from './recruit'
import { ALCHEMY_COST_OPTIONS, ITEM_DEF, POTION_HEAL_RATIO } from './tables'
import type { ActionResult, EffectId, EffectInstance, ItemId, Save } from './types'

export { ALCHEMY_COST_OPTIONS }

/** 炼金效果解析口。药剂只做应急回血，不加工厂效率。 */
export function potionEffects(_itemId: ItemId): EffectInstance[] {
  return []
}

/** 与工具 / 食物共用 effectId 解析；药剂恒为 0，不用来加工厂效率。 */
export function potionEffectValue(_itemId: ItemId | null | undefined, _effectId: EffectId): number {
  return 0
}

export function potionHealAmount(hpMax: number): number {
  return Math.max(1, Math.ceil(Math.max(1, Math.floor(hpMax)) * POTION_HEAL_RATIO))
}

/** 主动应急加血：扣 1 potion，回约 70% hpMax。不改生产速度。 */
export function usePotion(save: Save, workerId: string): ActionResult {
  const worker = findWorker(save, workerId)
  if (!worker) return { ok: false, reason: '没有这个工人' }
  if (bankQty(save, 'potion') < 1) return { ok: false, reason: '没有药剂' }
  if (worker.hp >= worker.hpMax) return { ok: false, reason: '已满血' }
  const took = takeFromBank(save, 'potion', 1)
  if (!took.ok) return took
  const next = Math.min(worker.hpMax, worker.hp + potionHealAmount(worker.hpMax))
  const healed = next - worker.hp
  worker.hp = next
  return { ok: true, message: healed > 0 ? `用了1瓶药剂，HP+${healed}` : '用了1瓶药剂' }
}

export function alchemyCostLabel(rules: { itemId: ItemId; qty: number }[]): string {
  const first = rules[0]
  return first ? ITEM_DEF[first.itemId].label : '原料'
}
