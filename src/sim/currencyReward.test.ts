import { describe, expect, it } from 'vitest'
import {
  DIAMOND_FROM_GOLD_DIV,
  REWARD_DIAMOND_CHANCE,
  diamondQtyFromGold,
  exclusiveCurrencyPayout,
  rollCurrencyPayout,
} from './currencyReward'

describe('currency reward tables', () => {
  it('leans gold on minions and pawn, either on elite, diamonds on boss and artisan', () => {
    expect(REWARD_DIAMOND_CHANCE.minion).toBeLessThan(0.5)
    expect(REWARD_DIAMOND_CHANCE.pawn).toBeLessThan(0.5)
    expect(REWARD_DIAMOND_CHANCE.bulkBuy).toBeLessThan(0.5)
    expect(REWARD_DIAMOND_CHANCE.elite).toBe(0.5)
    expect(REWARD_DIAMOND_CHANCE.boss).toBe(1)
    expect(REWARD_DIAMOND_CHANCE.artisan).toBeGreaterThan(0.5)
    expect(DIAMOND_FROM_GOLD_DIV).toEqual({ min: 5, max: 10 })
  })

  it('converts gold to 1/5～1/10 diamonds and never both currencies', () => {
    expect(diamondQtyFromGold(20, 0)).toBe(Math.round(20 / 5))
    expect(diamondQtyFromGold(20, 1)).toBe(Math.round(20 / 10))
    expect(diamondQtyFromGold(8, 0.5)).toBeGreaterThanOrEqual(1)
    expect(diamondQtyFromGold(8, 0.5)).toBeLessThanOrEqual(2)
    expect(diamondQtyFromGold(0, 0.5)).toBe(0)

    expect(rollCurrencyPayout(12, 1, () => 0.3)).toEqual({ gold: 0, diamonds: diamondQtyFromGold(12, 0.3) })
    expect(rollCurrencyPayout(12, 0, () => 0)).toEqual({ gold: 12, diamonds: 0 })
    expect(rollCurrencyPayout(12, 0.2, () => 0.5)).toEqual({ gold: 12, diamonds: 0 })
    expect(exclusiveCurrencyPayout(9, 2)).toEqual({ gold: 0, diamonds: 2 })
    expect(exclusiveCurrencyPayout(9, 0)).toEqual({ gold: 9, diamonds: 0 })
  })
})
