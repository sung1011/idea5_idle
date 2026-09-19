import { ITEM_DEF, itemCraftGold, type IoRule } from './tables'
import type { ItemId, StationId } from './types'

export type ItemLot = {
  itemId: ItemId
  qty: number
}

export type CycleGain = {
  stationId: StationId
  lots: ItemLot[]
  notice: string | null
  gold?: number
  /** 本次成功产出时，该站有在岗工人已虚弱（HP 效率 < 1）。 */
  weak?: boolean
}

export type GainSink = (gain: CycleGain) => void

export type CycleTipKind = 'ok' | 'err'

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

/** 一次吞吐按产出数量结算的工坊金币。无产出 / craftGold 为 0 则 0。 */
export function craftGoldForLots(lots: ItemLot[]): number {
  let gold = 0
  for (const lot of mergeLots(lots)) {
    gold += itemCraftGold(lot.itemId) * lot.qty
  }
  return gold
}

function normalizeGold(gold: number | undefined): number {
  if (typeof gold !== 'number' || !Number.isFinite(gold) || gold <= 0) return 0
  return Math.floor(gold)
}

/** 一次吞吐的获得文案。无产出且无金币则 null，不刷「获得」tips。 */
export function formatGainTip(lots: ItemLot[], gold = 0): string | null {
  const merged = mergeLots(lots)
  const goldQty = normalizeGold(gold)
  if (!merged.length && goldQty <= 0) return null
  const parts = merged.map((lot) => `${ITEM_DEF[lot.itemId].label} ×${lot.qty}`)
  if (goldQty > 0) parts.push(`金币 +${goldQty}`)
  return `获得 ${parts.join('、')}`
}

/** 有产出或工坊金币优先「获得」；空杆 / 软失败 / 遇险等无产出才漂站内 notice。 */
export function formatCycleTip(gain: CycleGain): { text: string; kind: CycleTipKind } | null {
  const text = formatGainTip(gain.lots, gain.gold)
  if (text) return { text, kind: 'ok' }
  const notice = gain.notice?.trim()
  if (!notice) return null
  return { text: notice, kind: 'err' }
}

export function emitGain(
  onGain: GainSink | undefined,
  lots: ItemLot[],
  stationId: StationId,
  notice: string | null = null,
  gold = 0,
  weak = false,
): void {
  if (!onGain) return
  const merged = mergeLots(lots)
  const tipNotice = notice?.trim() || null
  const goldQty = normalizeGold(gold)
  if (!merged.length && !tipNotice && goldQty <= 0) return
  onGain({
    stationId,
    lots: merged,
    notice: tipNotice,
    gold: goldQty,
    ...(weak ? { weak: true } : {}),
  })
}
