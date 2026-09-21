import { describe, expect, it } from 'vitest'
import { addToBank } from './bank'
import { createSave } from './createSave'
import {
  generateEncounterBoard,
  hydrateEncounterFields,
  makeStarterCopperPawn,
  pawnMerchant,
  pawnReward,
} from './encounters'
import {
  TIMED_ORDER_CHANCE,
  TIMED_ORDER_PROB,
  TIMED_ORDER_DURATION_S,
  TIMED_ORDER_EXPIRED_TIP,
  TIMED_ORDER_REWARD_MUL,
  attachTimedMarketOrder,
  expireTimedMarketOrders,
  isTimedOrderExpired,
  isTimedOrderLive,
  scaleNeedMap,
  shouldRollTimed,
  timedDurationS,
  timedOrderLine,
  timedRewardMul,
} from './marketTimed'
import { applyTick } from './tick'
import { MARKET_SLOT_MIN, marketSlotCount } from './tech'
import type { PawnEncounter } from './types'

function timedPawn(now: number, quality: PawnEncounter['quality'] = 'green'): PawnEncounter {
  return {
    kind: 'pawn',
    id: 'timed-pawn',
    label: '限时当',
    quality,
    pawnWants: { ore: 2 },
    rewardGold: 10,
    completed: false,
    timedUntil: now + TIMED_ORDER_DURATION_S.long * 1000,
  }
}

describe('market timed orders', () => {
  it('rolls 25–35% and picks 5/10/15 minute tiers by quality and chapter', () => {
    expect(TIMED_ORDER_CHANCE).toBeGreaterThanOrEqual(0.25)
    expect(TIMED_ORDER_CHANCE).toBeLessThanOrEqual(0.35)
    expect(TIMED_ORDER_PROB).toBe(TIMED_ORDER_CHANCE)
    expect(shouldRollTimed(0)).toBe(true)
    expect(shouldRollTimed(TIMED_ORDER_CHANCE)).toBe(false)
    expect(timedDurationS('green', 1)).toBe(TIMED_ORDER_DURATION_S.long)
    expect(timedDurationS('gray', 1)).toBe(TIMED_ORDER_DURATION_S.long)
    expect(timedDurationS('blue', 1)).toBe(TIMED_ORDER_DURATION_S.mid)
    expect(timedDurationS('purple', 1)).toBe(TIMED_ORDER_DURATION_S.short)
    expect(timedDurationS('orange', 1)).toBe(TIMED_ORDER_DURATION_S.short)
    expect(timedDurationS('green', 6)).toBe(TIMED_ORDER_DURATION_S.mid)
    expect(timedDurationS('blue', 6)).toBe(TIMED_ORDER_DURATION_S.short)
    expect(timedDurationS('purple', 6)).toBe(TIMED_ORDER_DURATION_S.short)
    const save = createSave()
    save.techLevels = { caravanPermit: 1, s04DraftC: 1 }
    save.unlockedTechIds = ['caravanPermit', 's04DraftC']
    expect(timedDurationS('green', 1, save)).toBe(Math.round(TIMED_ORDER_DURATION_S.long * 1.5))
    expect(shouldRollTimed(TIMED_ORDER_CHANCE, save)).toBe(true)
    expect(shouldRollTimed(TIMED_ORDER_CHANCE + 0.15, save)).toBe(false)
  })

  it('does not consume save.rngState when attaching a timed stamp', () => {
    const save = createSave()
    const rng = save.rngState
    const enc = timedPawn(1_000)
    delete enc.timedUntil
    attachTimedMarketOrder(enc, 1_000, 1, true)
    expect(enc.timedUntil).toBe(1_000 + timedDurationS('green', 1) * 1000)
    expect(save.rngState).toBe(rng)
    const a = { rngState: save.rngState }
    const b = { rngState: save.rngState }
    generateEncounterBoard(21, 4, { board: 'market', rng: a, now: 2_000, mainChapter: 1 })
    generateEncounterBoard(21, 4, { board: 'market', rng: b, now: 2_000, mainChapter: 1 })
    expect(a.rngState).toBe(b.rngState)
    expect(save.rngState).toBe(rng)
  })

  it('doubles gold and item gains when completed in time', () => {
    const save = createSave()
    const now = 8_000
    const enc = timedPawn(now)
    save.marketEncounters = [enc]
    addToBank(save, 'ore', 2)
    const gold = save.gold
    expect(timedRewardMul(enc, now)).toBe(TIMED_ORDER_REWARD_MUL)
    expect(pawnReward(enc, save, now)).toEqual({ gold: 20, diamonds: 0 })
    expect(pawnMerchant(save, 0, now)).toEqual({ ok: true, message: '以物换钱成交。金币 +20' })
    expect(save.gold).toBe(gold + 20)
    expect(enc.completed).toBe(true)
    expect(scaleNeedMap({ herb: 2, meal: 1 }, 2)).toEqual({ herb: 4, meal: 2 })
  })

  it('removes an expired timed order and leaves the slot empty', () => {
    const save = createSave()
    const now = 9_000
    const live = timedPawn(now)
    const dead: PawnEncounter = { ...timedPawn(now), id: 'dead-pawn', timedUntil: now - 1 }
    save.marketEncounters = [live, dead]
    expect(isTimedOrderLive(live, now)).toBe(true)
    expect(isTimedOrderExpired(dead, now)).toBe(true)
    expireTimedMarketOrders(save, now)
    expect(save.marketEncounters.map((enc) => enc.id)).toEqual(['timed-pawn'])
    const late = pawnMerchant(save, 0, now + TIMED_ORDER_DURATION_S.long * 1000)
    expect(late.ok).toBe(false)
    if (!late.ok) expect(late.reason).toBe(TIMED_ORDER_EXPIRED_TIP)
    expect(save.marketEncounters).toHaveLength(0)
  })

  it('expires on tick and never explore-protects a timed market order', () => {
    const save = createSave()
    const now = 11_000
    save.marketEncounters = [timedPawn(now - TIMED_ORDER_DURATION_S.long * 1000 - 1)]
    applyTick(save, { now })
    expect(save.marketEncounters).toHaveLength(0)
    const line = timedOrderLine(timedPawn(now), now)
    expect(line).toBe('限时 15:00 · 奖励×2')
  })

  it('hydrates an old 1-slot market up to the new floor of 2', () => {
    const save = createSave()
    save.unlockedTechIds = []
    save.techLevels = {}
    save.marketEncounters = [makeStarterCopperPawn(17, 0)]
    hydrateEncounterFields(save)
    expect(marketSlotCount(save)).toBe(MARKET_SLOT_MIN)
    expect(save.marketEncounters).toHaveLength(MARKET_SLOT_MIN)
    expect(save.marketEncounters[0]).toMatchObject(makeStarterCopperPawn(17, 0))
  })
})
