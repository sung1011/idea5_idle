import { afterEach, describe, expect, it } from 'vitest'
import { bankQty } from './bank'
import { createSave, SAVE_VERSION } from './createSave'
import { gmSummonTravelingMerchant } from './gm'
import { setRollOverride } from './rng'
import { ticks } from './tick'
import {
  deliverTravelingMerchant,
  MERCHANT_APPEAR_CHANCE,
  MERCHANT_DEBUT_S,
  MERCHANT_DIAMOND_MIN,
  MERCHANT_QTY_MIN,
  MERCHANT_ROLL_EVERY_S,
  MERCHANT_STAY_S,
  merchantQtyScale,
  travelingMerchantActive,
  travelingMerchantGaps,
  travelingMerchantPool,
} from './travelingMerchant'

afterEach(() => setRollOverride(null))

describe('traveling merchant schedule', () => {
  it('starts waiting and appears exactly at 5 minutes on a new save', () => {
    const save = createSave()
    expect(save.saveVersion).toBe(SAVE_VERSION)
    expect(save.travelingMerchant.debutDone).toBe(false)
    expect(save.travelingMerchant.nextCheckAt).toBe(MERCHANT_DEBUT_S)
    expect(travelingMerchantActive(save)).toBe(false)

    setRollOverride(() => 0)
    const early = ticks(save, MERCHANT_DEBUT_S - 1)
    expect(travelingMerchantActive(early)).toBe(false)

    const arrived = ticks(save, MERCHANT_DEBUT_S)
    expect(travelingMerchantActive(arrived)).toBe(true)
    expect(arrived.travelingMerchant.debutDone).toBe(true)
    expect(arrived.travelingMerchant.unseen).toBe(true)
    expect(arrived.travelingMerchant.until).toBe(MERCHANT_DEBUT_S + MERCHANT_STAY_S)
    const lines = arrived.travelingMerchant.order?.lines ?? []
    expect(lines.length).toBe(2)
    expect(lines.every((line) => travelingMerchantPool(arrived).includes(line.itemId))).toBe(true)
    expect(lines.every((line) => line.qty === MERCHANT_QTY_MIN)).toBe(true)
    expect(arrived.travelingMerchant.order?.diamonds).toBe(MERCHANT_DIAMOND_MIN)
  })

  it('does not roll while the merchant is present, then waits 5 minutes after leaving', () => {
    setRollOverride(() => 0)
    const arrived = ticks(createSave(), MERCHANT_DEBUT_S)
    const until = arrived.travelingMerchant.until
    const order = arrived.travelingMerchant.order
    const still = ticks(arrived, MERCHANT_ROLL_EVERY_S)
    expect(still.travelingMerchant.until).toBe(until)
    expect(still.travelingMerchant.order).toEqual(order)

    const left = ticks(arrived, MERCHANT_STAY_S)
    expect(travelingMerchantActive(left)).toBe(false)
    expect(left.travelingMerchant.order).toBeNull()
    expect(left.travelingMerchant.nextCheckAt).toBe(MERCHANT_DEBUT_S + MERCHANT_STAY_S + MERCHANT_ROLL_EVERY_S)
  })

  it('appears on a later roll only when the dice is under 5%', () => {
    setRollOverride(() => 0)
    const left = ticks(createSave(), MERCHANT_DEBUT_S + MERCHANT_STAY_S)
    expect(travelingMerchantActive(left)).toBe(false)

    setRollOverride(() => MERCHANT_APPEAR_CHANCE)
    const missed = ticks(left, MERCHANT_ROLL_EVERY_S)
    expect(travelingMerchantActive(missed)).toBe(false)
    expect(missed.travelingMerchant.nextCheckAt).toBe(left.elapsedS + MERCHANT_ROLL_EVERY_S + MERCHANT_ROLL_EVERY_S)

    setRollOverride(() => MERCHANT_APPEAR_CHANCE - 0.01)
    const again = ticks(missed, MERCHANT_ROLL_EVERY_S)
    expect(travelingMerchantActive(again)).toBe(true)
    expect(again.travelingMerchant.until).toBe(again.elapsedS + MERCHANT_STAY_S)
  })

  it('scales line qty with knight level and pays diamonds from the total', () => {
    const save = createSave()
    save.knightLevel = 21
    expect(merchantQtyScale(save.knightLevel)).toBeCloseTo(2)
    setRollOverride(() => 0)
    const arrived = ticks(save, MERCHANT_DEBUT_S)
    const lines = arrived.travelingMerchant.order?.lines ?? []
    expect(lines.every((line) => line.qty === MERCHANT_QTY_MIN * 2)).toBe(true)
    expect(arrived.travelingMerchant.order?.diamonds).toBe(MERCHANT_DIAMOND_MIN)
  })

  it('delivers one order then goes back to the random wait', () => {
    setRollOverride(() => 0)
    const save = ticks(createSave(), MERCHANT_DEBUT_S)
    const order = save.travelingMerchant.order
    expect(order).toBeTruthy()
    expect(deliverTravelingMerchant(save).ok).toBe(false)
    expect(travelingMerchantActive(save)).toBe(true)
    expect(travelingMerchantGaps(save).length).toBe(order!.lines.length)

    for (const line of order!.lines) save.bank[line.itemId] = line.qty
    const diamonds = save.diamonds
    const result = deliverTravelingMerchant(save)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.message).toBe(`钻石 +${order!.diamonds}`)
    expect(save.diamonds).toBe(diamonds + order!.diamonds)
    for (const line of order!.lines) expect(bankQty(save, line.itemId)).toBe(0)
    expect(travelingMerchantActive(save)).toBe(false)
    expect(save.travelingMerchant.nextCheckAt).toBe(save.elapsedS + MERCHANT_ROLL_EVERY_S)
  })

  it('summons immediately from the GM button', () => {
    const save = createSave()
    expect(gmSummonTravelingMerchant(save)).toEqual({ ok: true, message: '商人已到' })
    expect(travelingMerchantActive(save)).toBe(true)
    expect(save.travelingMerchant.debutDone).toBe(true)
    expect(save.travelingMerchant.until).toBe(MERCHANT_STAY_S)
  })
})
