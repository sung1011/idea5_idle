import { describe, expect, it } from 'vitest'
import { createSave } from '../sim/createSave'
import { pawnRewardGold } from '../sim/encounters'
import { itemProducerStation } from '../sim/tables'
import type {
  ArtisanEncounter,
  BlackMerchantEncounter,
  BulkBuyEncounter,
  Encounter,
  EnemyEncounter,
  PasserbyEncounter,
  PawnEncounter,
  Save,
} from '../sim/types'
import {
  CONSUME_SHORT_TIP,
  encounterDeal,
  formatConsumeToken,
  formatEncounterDealLines,
  isConsumeShortageReason,
  isConsumeShort,
  isEncounterActionConsumeShort,
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
      gain: '获得：金币 ×8（战斗后领）',
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
      consume: '消耗：金币 ×8',
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
      gain: `获得：金币 ×${pawnRewardGold(pawn)}`,
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
      gain: '获得：金币 ×12',
    })

    const merchantDeal = encounterDeal(merchant)
    expect(merchantDeal.consume.every((token) => token.kind === 'gold')).toBe(true)
    expect(
      merchantDeal.gain.every((token) => token.kind === 'item' && itemProducerStation(token.itemId) === 'cooking'),
    ).toBe(true)
    const artisanDeal = encounterDeal(artisan)
    expect(artisanDeal.gain.every((token) => token.kind === 'buff')).toBe(true)
  })

  it('doubles live timed market gains on the card', () => {
    const now = 5_000
    const pawn: PawnEncounter = {
      kind: 'pawn',
      id: 'timed-pawn',
      label: '限时当',
      quality: 'green',
      pawnWants: { ore: 2 },
      rewardGold: 10,
      completed: false,
      timedUntil: now + 60_000,
    }
    expect(encounterDeal(pawn, undefined, now).gain).toMatchObject([{ kind: 'gold', qty: 20 }])
    const passerby: PasserbyEncounter = {
      kind: 'passerby',
      id: 'timed-pass',
      label: '限时路人',
      quality: 'green',
      wants: { ore: 2 },
      offers: { fish: 1 },
      completed: false,
      timedUntil: now + 60_000,
    }
    expect(encounterDeal(passerby, undefined, now).gain).toEqual([{ kind: 'item', itemId: 'fish', qty: 2 }])
  })

  it('joins multiple items with顿号 and hides an empty side', () => {
    expect(formatEncounterDealLines(enemy({ needs: { meal: 2, ore: 1 } }), { meal: 2, ore: 0 })).toEqual({
      consume: '消耗：熟食 ×2 / 2、铜矿 ×1 / 0',
      gain: '获得：金币 ×8（战斗后领）',
    })
    expect(formatEncounterDealLines(enemy({ needs: {} }))).toEqual({
      consume: '',
      gain: '获得：金币 ×8（战斗后领）',
    })
    expect(formatEncounterDealLines(enemy({ lootGold: 0, lootDiamonds: 2 }))).toEqual({
      consume: '消耗：熟食 ×2 / 0',
      gain: '获得：钻石 ×2（战斗后领）',
    })
  })

  it('formats a consume item as name ×need / have and flags a shortage', () => {
    const iron = { kind: 'item' as const, itemId: 'ironOre' as const, qty: 3 }
    expect(formatConsumeToken(iron, 12)).toBe('铁矿 ×3 / 12')
    expect(isConsumeShort(iron, 12)).toBe(false)
    expect(isConsumeShort(iron, 2)).toBe(true)
    expect(formatConsumeToken({ kind: 'gold', qty: 8 })).toBe('金币 ×8')
    expect(formatConsumeToken({ kind: 'diamonds', qty: 3 })).toBe('钻石 ×3')
  })
})

function withEnc(enc: Encounter, gold = 0, bank: Save['bank'] = {}): Save {
  const save = createSave()
  save.gold = gold
  save.bank = { ...bank }
  if (enc.kind === 'enemy') save.encounters = [enc]
  else save.marketEncounters = [enc]
  return save
}

describe('encounter consume lock', () => {
  it('reuses existing shortage reasons and keeps a single tip', () => {
    expect(CONSUME_SHORT_TIP).toBe('物资不足')
    expect(isConsumeShortageReason('货不够：熟食')).toBe(true)
    expect(isConsumeShortageReason('金币不够：购买要 8')).toBe(true)
    expect(isConsumeShortageReason('成品不够：烤肉')).toBe(true)
    expect(isConsumeShortageReason('战斗中')).toBe(false)
    expect(isConsumeShortageReason('这笔买卖已完成')).toBe(false)
    expect(isConsumeShortageReason(null)).toBe(false)
  })

  it('locks fight / trade / deliver when consume is short, and unlocks when enough', () => {
    expect(isEncounterActionConsumeShort(withEnc(enemy({ needs: { meal: 2 } })), 0)).toBe(true)
    expect(isEncounterActionConsumeShort(withEnc(enemy({ needs: { meal: 2 } }), 0, { meal: 2 }), 0)).toBe(
      false,
    )
    expect(
      isEncounterActionConsumeShort(withEnc(enemy({ submitted: true, needs: { meal: 2 } })), 0),
    ).toBe(false)
    expect(
      isEncounterActionConsumeShort(
        withEnc(
          enemy({
            combat: {
              startedAt: 1,
              timeoutAt: 2,
              workerIds: ['w1'],
              workers: [{ id: 'w1', label: '甲', hp: 8, hpMax: 8, atk: 2, spd: 5, nextActAt: 1 }],
              enemy: { id: 'e', label: '敌', hp: 8, hpMax: 8, atk: 2, spd: 5, nextActAt: 1 },
              logs: [],
              outcome: null,
            },
          }),
        ),
        0,
      ),
    ).toBe(false)

    const merchant: BlackMerchantEncounter = {
      kind: 'blackMerchant',
      id: 'm1',
      label: '干粮贩',
      quality: 'green',
      buyGold: 8,
      buyOffers: { meal: 1 },
      completed: false,
    }
    expect(isEncounterActionConsumeShort(withEnc(merchant, 0), 0, 'market')).toBe(true)
    expect(isEncounterActionConsumeShort(withEnc(merchant, 8), 0, 'market')).toBe(false)
    expect(isEncounterActionConsumeShort(withEnc({ ...merchant, completed: true }, 0), 0, 'market')).toBe(false)

    const passerby: PasserbyEncounter = {
      kind: 'passerby',
      id: 'p1',
      label: '换货路人',
      quality: 'green',
      wants: { ore: 2 },
      offers: { fish: 1 },
      completed: false,
    }
    expect(isEncounterActionConsumeShort(withEnc(passerby), 0, 'market')).toBe(true)
    expect(isEncounterActionConsumeShort(withEnc(passerby, 0, { ore: 2 }), 0, 'market')).toBe(false)

    const pawn: PawnEncounter = {
      kind: 'pawn',
      id: 'w1',
      label: '工具当',
      quality: 'green',
      pawnWants: { tool: 1 },
      completed: false,
    }
    expect(isEncounterActionConsumeShort(withEnc(pawn), 0, 'market')).toBe(true)
    expect(isEncounterActionConsumeShort(withEnc(pawn, 0, { tool: 1 }), 0, 'market')).toBe(false)

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
    expect(isEncounterActionConsumeShort(withEnc(artisan), 0, 'market')).toBe(true)
    expect(isEncounterActionConsumeShort(withEnc(artisan, 0, { meal: 2 }), 0, 'market')).toBe(false)

    const bulk: BulkBuyEncounter = {
      kind: 'bulkBuy',
      id: 'b1',
      label: '成品收购',
      quality: 'green',
      wants: { roast: 1 },
      rewardGold: 12,
      completed: false,
    }
    expect(isEncounterActionConsumeShort(withEnc(bulk), 0, 'market')).toBe(true)
    expect(isEncounterActionConsumeShort(withEnc(bulk, 0, { roast: 1 }), 0, 'market')).toBe(false)
  })
})
