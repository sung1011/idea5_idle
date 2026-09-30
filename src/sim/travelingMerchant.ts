import { bankQty, takeFromBank } from './bank'
import { mainNeedItemPool } from './encounters'
import { roll01 } from './rng'
import { isAnyPotionNeed, isAnyRuneNeed, ITEM_DEF } from './tables'
import type { ActionResult, ItemId, Save, TravelingMerchantOrder, TravelingMerchantState } from './types'

/** 新档游玩满这么多秒，商人必出一次。 */
export const MERCHANT_DEBUT_S = 5 * 60
/** 之后每隔这么多秒掷一次。商人在场时不掷。 */
export const MERCHANT_ROLL_EVERY_S = 5 * 60
export const MERCHANT_APPEAR_CHANCE = 0.05
/** 到访停留。到点自动离开。 */
export const MERCHANT_STAY_S = 2 * 60 * 60
export const MERCHANT_QTY_MIN = 100
export const MERCHANT_QTY_MAX = 300
/** 酋长每高 1 级，单种数量 ×(1 + 等级差 × 此值)。1 级不加。 */
export const MERCHANT_LEVEL_QTY_STEP = 0.05
export const MERCHANT_DIAMOND_MIN = 30
export const MERCHANT_DIAMOND_MAX = 60

export const MERCHANT_LINES = [
  '路过的行商。货齐了，钻石就给你。',
  '我只收这一单。交完就走。',
  '这两小时我还在。差的货备齐再来。',
] as const

export function blankTravelingMerchant(): TravelingMerchantState {
  return {
    debutDone: false,
    nextCheckAt: MERCHANT_DEBUT_S,
    until: null,
    unseen: false,
    order: null,
  }
}

function stateOf(save: Save): TravelingMerchantState {
  if (!save.travelingMerchant) save.travelingMerchant = blankTravelingMerchant()
  return save.travelingMerchant
}

export function merchantQtyScale(knightLevel: number): number {
  const level = Number.isFinite(knightLevel) ? Math.max(1, Math.floor(knightLevel)) : 1
  return 1 + (level - 1) * MERCHANT_LEVEL_QTY_STEP
}

/** 已开放工位的具体产物。不要通配、荒晶和旧工具标记。 */
export function travelingMerchantPool(save: Save): ItemId[] {
  const pool = mainNeedItemPool(save).filter((id) => {
    if (isAnyPotionNeed(id) || isAnyRuneNeed(id)) return false
    if (id === 'potion' || id === 'tool' || id === 'wildCrystal') return false
    return ITEM_DEF[id] != null
  })
  return pool.length > 0 ? pool : ['herb']
}

export function merchantDiamondReward(totalQty: number, knightLevel: number): number {
  const scale = merchantQtyScale(knightLevel)
  const minTotal = 2 * MERCHANT_QTY_MIN * scale
  const maxTotal = 3 * MERCHANT_QTY_MAX * scale
  const span = Math.max(1, maxTotal - minTotal)
  const t = Math.min(1, Math.max(0, (totalQty - minTotal) / span))
  return MERCHANT_DIAMOND_MIN + Math.round(t * (MERCHANT_DIAMOND_MAX - MERCHANT_DIAMOND_MIN))
}

function rollQty(save: Save, knightLevel: number): number {
  const base = MERCHANT_QTY_MIN + Math.floor(roll01(save) * (MERCHANT_QTY_MAX - MERCHANT_QTY_MIN + 1))
  return Math.max(MERCHANT_QTY_MIN, Math.round(base * merchantQtyScale(knightLevel)))
}

export function rollTravelingMerchantOrder(save: Save): TravelingMerchantOrder {
  const pool = travelingMerchantPool(save)
  const want = roll01(save) < 0.5 ? 2 : 3
  const count = Math.max(1, Math.min(want, pool.length))
  const bag = pool.slice()
  const lines: TravelingMerchantOrder['lines'] = []
  for (let i = 0; i < count; i++) {
    const idx = Math.min(bag.length - 1, Math.floor(roll01(save) * bag.length))
    const [itemId] = bag.splice(idx, 1)
    if (!itemId) break
    lines.push({ itemId, qty: rollQty(save, save.knightLevel) })
  }
  const total = lines.reduce((sum, line) => sum + line.qty, 0)
  return { lines, diamonds: merchantDiamondReward(total, save.knightLevel) }
}

function spawnTravelingMerchant(save: Save): void {
  const state = stateOf(save)
  state.debutDone = true
  state.order = rollTravelingMerchantOrder(save)
  state.until = save.elapsedS + MERCHANT_STAY_S
  state.unseen = true
}

function leaveTravelingMerchant(save: Save): void {
  const state = stateOf(save)
  state.until = null
  state.order = null
  state.unseen = false
  state.debutDone = true
  state.nextCheckAt = save.elapsedS + MERCHANT_ROLL_EVERY_S
}

export function travelingMerchantActive(save: Save): boolean {
  const state = save.travelingMerchant
  return !!state && state.until != null && state.order != null && save.elapsedS < state.until
}

export function travelingMerchantRemainS(save: Save): number {
  const until = save.travelingMerchant?.until
  if (until == null) return 0
  return Math.max(0, until - save.elapsedS)
}

export function travelingMerchantLine(save: Save): string {
  const until = save.travelingMerchant?.until ?? 0
  const index = Math.abs(Math.floor(until)) % MERCHANT_LINES.length
  return MERCHANT_LINES[index] ?? MERCHANT_LINES[0]
}

export type MerchantGap = {
  itemId: ItemId
  need: number
  have: number
  short: number
}

export function travelingMerchantGaps(save: Save): MerchantGap[] {
  const lines = save.travelingMerchant?.order?.lines ?? []
  const gaps: MerchantGap[] = []
  for (const line of lines) {
    const have = bankQty(save, line.itemId)
    const short = Math.max(0, line.qty - have)
    if (short > 0) gaps.push({ itemId: line.itemId, need: line.qty, have, short })
  }
  return gaps
}

/** 每个 sim 秒走一次。离线追赶同样调用。在场时不掷骰。 */
export function stepTravelingMerchant(save: Save): void {
  const state = stateOf(save)
  if (state.until != null) {
    if (save.elapsedS >= state.until) leaveTravelingMerchant(save)
    return
  }
  if (save.elapsedS < state.nextCheckAt) return
  if (!state.debutDone) {
    spawnTravelingMerchant(save)
    return
  }
  if (roll01(save) < MERCHANT_APPEAR_CHANCE) spawnTravelingMerchant(save)
  else state.nextCheckAt = save.elapsedS + MERCHANT_ROLL_EVERY_S
}

export function markTravelingMerchantSeen(save: Save): ActionResult {
  const state = stateOf(save)
  state.unseen = false
  return { ok: true }
}

export function deliverTravelingMerchant(save: Save): ActionResult {
  const state = stateOf(save)
  const order = state.order
  if (state.until == null || !order) return { ok: false, reason: '商人不在' }
  const gaps = travelingMerchantGaps(save)
  if (gaps.length) {
    const text = gaps.map((gap) => `${ITEM_DEF[gap.itemId].label}×${gap.short}`).join('、')
    return { ok: false, reason: `还差 ${text}` }
  }
  for (const line of order.lines) {
    const took = takeFromBank(save, line.itemId, line.qty)
    if (!took.ok) return took
  }
  const current =
    typeof save.diamonds === 'number' && Number.isFinite(save.diamonds) ? Math.max(0, Math.floor(save.diamonds)) : 0
  save.diamonds = current + order.diamonds
  const gained = order.diamonds
  leaveTravelingMerchant(save)
  return { ok: true, message: `钻石 +${gained}` }
}

/** 立刻到访，并重置停留。已经在场则换一单。 */
export function gmSummonTravelingMerchant(save: Save): ActionResult {
  spawnTravelingMerchant(save)
  return { ok: true, message: '商人已到' }
}
