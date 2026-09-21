/** 战场 / 商场货币掉落：一单只发金币或钻石。 */

export const REWARD_DIAMOND_CHANCE = {
  minion: 0.28,
  elite: 0.5,
  boss: 1,
  pawn: 0.2,
  bulkBuy: 0.25,
  artisan: 0.75,
} as const

/** 钻石数量约为原金币奖励的 1/5～1/10。 */
export const DIAMOND_FROM_GOLD_DIV = { min: 5, max: 10 } as const

export type CurrencyPayout = {
  gold: number
  diamonds: number
}

export function diamondQtyFromGold(goldAmount: number, roll01: number): number {
  const gold = Math.max(0, Math.floor(goldAmount))
  if (gold <= 0) return 0
  const t = Number.isFinite(roll01) ? Math.min(1, Math.max(0, roll01)) : 0.5
  const span = DIAMOND_FROM_GOLD_DIV.max - DIAMOND_FROM_GOLD_DIV.min
  const div = DIAMOND_FROM_GOLD_DIV.min + t * span
  return Math.max(1, Math.round(gold / div))
}

export function rollCurrencyPayout(
  goldAmount: number,
  diamondChance: number,
  roll: () => number,
): CurrencyPayout {
  const gold = Math.max(0, Math.floor(goldAmount))
  if (gold <= 0) return { gold: 0, diamonds: 0 }
  const chance = Number.isFinite(diamondChance) ? diamondChance : 0
  if (chance >= 1 || (chance > 0 && roll() < chance)) {
    return { gold: 0, diamonds: diamondQtyFromGold(gold, roll()) }
  }
  return { gold, diamonds: 0 }
}

export function readRewardDiamonds(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return Math.floor(value)
}

export function exclusiveCurrencyPayout(gold: number, diamonds: number): CurrencyPayout {
  const d = readRewardDiamonds(diamonds)
  if (d > 0) return { gold: 0, diamonds: d }
  const g = typeof gold === 'number' && Number.isFinite(gold) && gold > 0 ? Math.floor(gold) : 0
  return { gold: g, diamonds: 0 }
}
