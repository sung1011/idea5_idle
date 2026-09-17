import { ITEM_DEF, type IoRule } from './tables'
import type { ItemId } from './types'

export type ItemLot = {
  itemId: ItemId
  qty: number
}

export type GainSink = (lots: ItemLot[]) => void

/** 同物品数量合并，qty<=0 丢掉。 */
export function mergeLots(lots: ItemLot[]): ItemLot[] {
  const map = new Map<ItemId, number>()
  for (const lot of lots) {
    const qty = Math.floor(lot.qty)
    if (qty <= 0) continue
    map.set(lot.itemId, (map.get(lot.itemId) ?? 0) + qty)
  }
  return [...map.entries()].map(([itemId, qty]) => ({ itemId, qty }))
}

export function pushLot(into: ItemLot[] | undefined, itemId: ItemId, qty: number): void {
  if (!into) return
  const n = Math.floor(qty)
  if (n <= 0) return
  into.push({ itemId, qty: n })
}

export function pushRuleLots(into: ItemLot[] | undefined, rules: IoRule[], bonus = 0): void {
  if (!into) return
  for (const io of rules) {
    pushLot(into, io.itemId, io.qty + (io === rules[0] ? bonus : 0))
  }
}

/** 一次吞吐的获得文案。无产出则 null，不刷「获得」tips。 */
export function formatGainTip(lots: ItemLot[]): string | null {
  const merged = mergeLots(lots)
  if (!merged.length) return null
  const parts = merged.map((lot) => `${ITEM_DEF[lot.itemId].label} ×${lot.qty}`)
  return `获得 ${parts.join('、')}`
}

export function emitGain(onGain: GainSink | undefined, lots: ItemLot[]): void {
  if (!onGain) return
  const merged = mergeLots(lots)
  if (!merged.length) return
  onGain(merged)
}
