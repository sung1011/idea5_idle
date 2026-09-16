import { bankQty, takeFromBank } from './bank'
import { ITEM_DEF, type IoRule } from './tables'
import type { ActionResult, ItemId, Save } from './types'

/** 同 item 合并数量，支持 `[{ ore, 1 }, { ore, 2 }]` → 共 3。 */
export function collapseCosts(rules: IoRule[]): IoRule[] {
  const map = new Map<ItemId, number>()
  for (const io of rules) {
    const qty = Math.floor(io.qty)
    if (qty <= 0) continue
    map.set(io.itemId, (map.get(io.itemId) ?? 0) + qty)
  }
  return [...map.entries()].map(([itemId, qty]) => ({ itemId, qty }))
}

export function missingCosts(save: Save, rules: IoRule[]): IoRule[] {
  const missing: IoRule[] = []
  for (const io of collapseCosts(rules)) {
    const have = bankQty(save, io.itemId)
    if (have < io.qty) missing.push({ itemId: io.itemId, qty: io.qty - have })
  }
  return missing
}

export function canAffordCosts(save: Save, rules: IoRule[]): boolean {
  return missingCosts(save, rules).length === 0
}

export function costLabels(rules: IoRule[]): string[] {
  return collapseCosts(rules).map((io) => ITEM_DEF[io.itemId].label)
}

export function missingCostLabels(save: Save, rules: IoRule[]): string[] {
  return costLabels(missingCosts(save, rules))
}

export function formatCosts(rules: IoRule[]): string {
  const collapsed = collapseCosts(rules)
  if (collapsed.length === 0) return '—'
  return collapsed.map((io) => `${ITEM_DEF[io.itemId].label}×${io.qty}`).join(' + ')
}

/** 多组配方：草×1 / 血×1。空组跳过。 */
export function formatCostOptions(sets: IoRule[][]): string {
  const parts = sets.map(formatCosts).filter((text) => text !== '—')
  return parts.length ? parts.join(' / ') : '—'
}

/**
 * 一次扣光 costs。任一原料不够则整单不扣。
 * 空数组视为无消耗，成功。
 */
export function takeCosts(save: Save, rules: IoRule[]): ActionResult {
  const missing = missingCosts(save, rules)
  if (missing.length > 0) {
    return { ok: false, reason: `${missingCostLabels(save, rules).join('、')}见底` }
  }
  for (const io of collapseCosts(rules)) {
    const took = takeFromBank(save, io.itemId, io.qty)
    if (!took.ok) return took
  }
  return { ok: true }
}
