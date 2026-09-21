import { hashString, roll01Bag } from './combatAttrs'
import type { CurrencyPayout } from './currencyReward'
import type { Encounter, EncounterNeedMap, EncounterQuality } from './types'

export const TIMED_ORDER_CHANCE = 0.3
export const TIMED_ORDER_REWARD_MUL = 2
export const TIMED_ORDER_DURATION_S = {
  long: 15 * 60,
  mid: 10 * 60,
  short: 5 * 60,
} as const

export const TIMED_ORDER_EXPIRED_TIP = '限时订单已过期'

export function timedDurationS(quality: EncounterQuality, chapter = 1): number {
  const ch = Number.isFinite(chapter) ? Math.max(1, Math.floor(chapter)) : 1
  let tier = TIMED_ORDER_DURATION_S.long
  if (quality === 'blue') tier = TIMED_ORDER_DURATION_S.mid
  if (quality === 'purple' || quality === 'orange') tier = TIMED_ORDER_DURATION_S.short
  if (ch >= 6 && tier > TIMED_ORDER_DURATION_S.short) {
    tier = tier === TIMED_ORDER_DURATION_S.long ? TIMED_ORDER_DURATION_S.mid : TIMED_ORDER_DURATION_S.short
  }
  return tier
}

export function shouldRollTimed(roll: number): boolean {
  const t = Number.isFinite(roll) ? Math.min(1, Math.max(0, roll)) : 0
  return t < TIMED_ORDER_CHANCE
}

export function isMarketTrade(enc: Encounter): boolean {
  return enc.kind !== 'enemy'
}

export function isMarketCompleted(enc: Encounter): boolean {
  if (enc.kind === 'enemy') return enc.lootClaimed
  return enc.completed === true
}

export function isTimedMarketOrder(enc: Encounter): boolean {
  return isMarketTrade(enc) && typeof enc.timedUntil === 'number' && Number.isFinite(enc.timedUntil)
}

export function timedRemainS(enc: Encounter, now = Date.now()): number | null {
  if (!isTimedMarketOrder(enc)) return null
  return Math.max(0, Math.ceil((enc.timedUntil! - now) / 1000))
}

export function isTimedOrderLive(enc: Encounter, now = Date.now()): boolean {
  return isTimedMarketOrder(enc) && !isMarketCompleted(enc) && now < (enc.timedUntil ?? 0)
}

export function isTimedOrderExpired(enc: Encounter, now = Date.now()): boolean {
  return isTimedMarketOrder(enc) && !isMarketCompleted(enc) && now >= (enc.timedUntil ?? 0)
}

export function timedRewardMul(enc: Encounter, now = Date.now()): number {
  return isTimedOrderLive(enc, now) ? TIMED_ORDER_REWARD_MUL : 1
}

export function scaleCurrencyPayout(payout: CurrencyPayout, mul: number): CurrencyPayout {
  const n = Number.isFinite(mul) && mul > 0 ? mul : 1
  if (n === 1) return payout
  return {
    gold: payout.gold > 0 ? Math.round(payout.gold * n) : 0,
    diamonds: payout.diamonds > 0 ? Math.round(payout.diamonds * n) : 0,
  }
}

export function scaleNeedMap(map: EncounterNeedMap, mul: number): EncounterNeedMap {
  const n = Number.isFinite(mul) && mul > 0 ? mul : 1
  if (n === 1) return { ...map }
  const out: EncounterNeedMap = {}
  for (const [itemId, qty] of Object.entries(map) as Array<[keyof EncounterNeedMap, number | undefined]>) {
    if (!qty) continue
    out[itemId] = Math.max(1, Math.round(qty * n))
  }
  return out
}

export function attachTimedMarketOrder(
  enc: Encounter,
  now: number,
  chapter = 1,
  force = false,
): Encounter {
  if (!isMarketTrade(enc) || isMarketCompleted(enc)) return enc
  if (!force && !shouldRollTimed(roll01Bag(hashString(`market-timed:${enc.id}`))())) return enc
  enc.timedUntil = now + timedDurationS(enc.quality, chapter) * 1000
  return enc
}

export function removeMarketEncounter(save: { marketEncounters?: Encounter[] }, id: string): void {
  if (!Array.isArray(save.marketEncounters)) return
  save.marketEncounters = save.marketEncounters.filter((enc) => enc.id !== id)
}

export function expireTimedMarketOrders(save: { marketEncounters?: Encounter[] }, now = Date.now()): void {
  if (!Array.isArray(save.marketEncounters)) return
  save.marketEncounters = save.marketEncounters.filter((enc) => !isTimedOrderExpired(enc, now))
}

export function formatTimedClock(remainS: number): string {
  const safe = Math.max(0, Math.floor(remainS))
  const m = Math.floor(safe / 60)
  const s = safe % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** 简/详共用：限时倒计时 + 奖励倍率。非限时或已成交返回 null。 */
export function timedOrderLine(enc: Encounter, now = Date.now()): string | null {
  if (!isTimedMarketOrder(enc) || isMarketCompleted(enc)) return null
  return `限时 ${formatTimedClock(timedRemainS(enc, now) ?? 0)} · 奖励×${TIMED_ORDER_REWARD_MUL}`
}
