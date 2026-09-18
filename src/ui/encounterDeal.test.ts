import { describe, expect, it } from 'vitest'
import { pawnRewardGold } from '../sim/encounters'
import { itemProducerStation } from '../sim/tables'
import type {
  ArtisanEncounter,
  BlackMerchantEncounter,
  BulkBuyEncounter,
  EnemyEncounter,
  PasserbyEncounter,
  PawnEncounter,
} from '../sim/types'
import {
  encounterDeal,
  formatConsumeToken,
  formatEncounterDealLines,
  isConsumeShort,
} from './encounterDeal'

function enemy(overrides: Partial<EnemyEncounter> = {}): EnemyEncounter {
  return {
    kind: 'enemy',
    id: 'e1',
    label: '试敌',
    quality: 'green',
    needs: { meal: 2 },
    lootGold: 8,
    departed: false,
    combat: null,
    lootClaimed: false,
    enemyRank: 'minion',
    weaknesses: ['fire'],
    revealedWeaknesses: [],
    ...overrides,
  }
}

describe('encounterDeal', () => {
  it('splits each order into consume and gain lines', () => {
    expect(formatEncounterDealLines(enemy(), { meal: 12 })).toEqual({
      consume: '消耗：熟食 ×2 / 12',
      gain: '获得：8 金（战斗后领）',
    })

    const merchant: BlackMerchantEncounter = {
      kind: 'blackMerchant',
      id: 'm1',
      label: '干粮贩',
      quality: 'green',
      buyGold: 8,
      buyOffers: { meal: 1 },
      completed: false,
    }
    expect(formatEncounterDealLines(merchant)).toEqual({
      consume: '消耗：8 金',
      gain: '获得：熟食×1',
    })

    const passerby: PasserbyEncounter = {
      kind: 'passerby',
      id: 'p1',
      label: '换货路人',
      quality: 'green',
      wants: { ore: 2 },
      offers: { fish: 1 },
      completed: false,
    }
    expect(formatEncounterDealLines(passerby, { ore: 5 })).toEqual({
      consume: '消耗：铜矿 ×2 / 5',
      gain: '获得：鱼×1',
    })

    const pawn: PawnEncounter = {
      kind: 'pawn',
      id: 'w1',
      label: '工具当',
      quality: 'green',
      pawnWants: { tool: 1 },
      completed: false,
    }
    expect(formatEncounterDealLines(pawn, { tool: 1 })).toEqual({
      consume: '消耗：初级工具 ×1 / 1',
      gain: `获得：${pawnRewardGold(pawn)} 金`,
    })

    const artisan: ArtisanEncounter = {
      kind: 'artisan',
      id: 'a1',
      label: '灶头加餐',
      quality: 'green',
      wants: { meal: 2 },
      rewardGold: 0,
      buffMul: 1.15,
      buffDurationS: 180,
      completed: false,
    }
    expect(formatEncounterDealLines(artisan, { meal: 0 })).toEqual({
      consume: '消耗：熟食 ×2 / 0',
      gain: '获得：产量 +15% · 03:00',
    })
    expect(encounterDeal(artisan).gain.every((token) => token.kind !== 'gold')).toBe(true)

    const bulk: BulkBuyEncounter = {
      kind: 'bulkBuy',
      id: 'b1',
      label: '成品收购',
      quality: 'green',
      wants: { roast: 1 },
      rewardGold: 12,
      completed: false,
    }
    expect(formatEncounterDealLines(bulk, { roast: 4 })).toEqual({
      consume: '消耗：烤肉 ×1 / 4',
      gain: '获得：12 金',
    })

    const merchantDeal = encounterDeal(merchant)
    expect(merchantDeal.consume.every((token) => token.kind === 'gold')).toBe(true)
    expect(
      merchantDeal.gain.every((token) => token.kind === 'item' && itemProducerStation(token.itemId) === 'cooking'),
    ).toBe(true)
    const artisanDeal = encounterDeal(artisan)
    expect(artisanDeal.gain.every((token) => token.kind === 'buff')).toBe(true)
  })

  it('joins multiple items with顿号 and hides an empty side', () => {
    expect(formatEncounterDealLines(enemy({ needs: { meal: 2, ore: 1 } }), { meal: 2, ore: 0 })).toEqual({
      consume: '消耗：熟食 ×2 / 2、铜矿 ×1 / 0',
      gain: '获得：8 金（战斗后领）',
    })
    expect(formatEncounterDealLines(enemy({ needs: {} }))).toEqual({
      consume: '',
      gain: '获得：8 金（战斗后领）',
    })
  })

  it('formats a consume item as name ×need / have and flags a shortage', () => {
    const iron = { kind: 'item' as const, itemId: 'ironOre' as const, qty: 3 }
    expect(formatConsumeToken(iron, 12)).toBe('铁矿 ×3 / 12')
    expect(isConsumeShort(iron, 12)).toBe(false)
    expect(isConsumeShort(iron, 2)).toBe(true)
    expect(formatConsumeToken({ kind: 'gold', qty: 8 })).toBe('8 金')
  })
})
