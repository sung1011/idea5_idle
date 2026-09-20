import { describe, expect, it } from 'vitest'
import { assignWorker } from './assign'
import { bankQty } from './bank'
import { createSave } from './createSave'
import { eatFood, loadFood, unloadFood } from './food'
import { currentSpeed } from './query'
import { recruitWorker } from './recruit'
import { selectStationCategory } from './stationProgress'
import { EFFECT_ID, FOOD_BUFF_DEF } from './tables'
import { applyTick, ticks } from './tick'
import { matchingToolEffectMax, selectStationTool, stationToolSpeedMul, workerEffectValue, workerToolSpeedMul } from './tools'
import type { Save } from './types'

function roster(n: number): Save {
  const save = createSave()
  save.gold = 15 * n
  for (let i = 0; i < n; i++) expect(recruitWorker(save).ok).toBe(true)
  return save
}

describe('cooking recipes', () => {
  it('cooks fish into meal and meat into roast', () => {
    const fish = roster(1)
    fish.bank.fish = 1
    assignWorker(fish, fish.workers[0].id, 'cooking')
    const cookedFish = ticks(fish, 28)
    expect(bankQty(cookedFish, 'fish')).toBe(0)
    expect(bankQty(cookedFish, 'meal')).toBe(1)

    const meat = roster(1)
    expect(selectStationCategory(meat, 'cooking', 'iron').ok).toBe(true)
    meat.bank.meat = 1
    assignWorker(meat, meat.workers[0].id, 'cooking')
    const cookedMeat = ticks(meat, 28)
    expect(bankQty(cookedMeat, 'meat')).toBe(0)
    expect(bankQty(cookedMeat, 'roast')).toBe(1)
    expect(bankQty(cookedMeat, 'meal')).toBe(0)
  })

  it('cooks stew from meat and spice, or fish and spice', () => {
    const save = roster(1)
    save.stations.cooking.stationLevel = 5
    save.stations.cooking.unlockedCategories = ['copper', 'iron', 'mithril']
    expect(selectStationCategory(save, 'cooking', 'mithril').ok).toBe(true)
    save.bank.meat = 1
    save.bank.spice = 1
    assignWorker(save, save.workers[0].id, 'cooking')
    const next = ticks(save, 32)
    expect(bankQty(next, 'meat')).toBe(0)
    expect(bankQty(next, 'spice')).toBe(0)
    expect(bankQty(next, 'stew')).toBe(1)

    const alt = roster(1)
    alt.stations.cooking.stationLevel = 5
    alt.stations.cooking.unlockedCategories = ['copper', 'iron', 'mithril']
    expect(selectStationCategory(alt, 'cooking', 'mithril').ok).toBe(true)
    alt.bank.fish = 1
    alt.bank.spice = 1
    assignWorker(alt, alt.workers[0].id, 'cooking')
    const altNext = ticks(alt, 32)
    expect(bankQty(altNext, 'fish')).toBe(0)
    expect(bankQty(altNext, 'stew')).toBe(1)
  })
})

describe('food slot buff', () => {
  it('refreshes the same buff when leftover food remains', () => {
    const t0 = 1_000_000
    const save = roster(1)
    save.bank.meal = 3
    const id = save.workers[0].id
    expect(loadFood(save, id, 'meal', 2, t0).ok).toBe(true)
    expect(bankQty(save, 'meal')).toBe(1)
    expect(save.workers[0].foodSlot?.qty).toBe(1)
    expect(save.workers[0].foodSlot?.buff.effectId).toBe(EFFECT_ID.prodSpeed)
    expect(save.workers[0].foodSlot?.expiresAt).toBe(t0 + FOOD_BUFF_DEF.meal.durationS * 1000)

    applyTick(save, { now: t0 + 180_000 })
    expect(save.workers[0].foodSlot?.itemId).toBe('meal')
    expect(save.workers[0].foodSlot?.qty).toBe(0)
    expect(save.workers[0].foodSlot?.expiresAt).toBe(t0 + 360_000)
    expect(save.workers[0].foodSlot?.buff.mul).toBe(FOOD_BUFF_DEF.meal.mul)
    expect(bankQty(save, 'meal')).toBe(1)
  })

  it('clears the buff when the slot runs out and still allows bare work', () => {
    const t0 = 2_000_000
    const save = roster(1)
    save.bank.meal = 1
    assignWorker(save, save.workers[0].id, 'mining')
    expect(loadFood(save, save.workers[0].id, 'meal', 1, t0).ok).toBe(true)
    expect(save.workers[0].foodSlot?.qty).toBe(0)
    const fed = currentSpeed(save, 'mining', t0)
    expect(fed).toBeCloseTo((1 / 20) * FOOD_BUFF_DEF.meal.mul)

    applyTick(save, { now: t0 + 180_000 })
    expect(save.workers[0].foodSlot).toBeNull()
    expect(currentSpeed(save, 'mining', t0 + 180_000)).toBeCloseTo(1 / 20)
    expect(fed).toBeGreaterThan(currentSpeed(save, 'mining', t0 + 180_000))

    const next = ticks(save, 20, { now: t0 + 180_000 })
    expect(bankQty(next, 'ore')).toBe(1)
    expect(next.stations.mining.completed).toBe(1)
    expect(next.workers[0].foodSlot).toBeNull()
  })

  it('overrides the current buff immediately when changing food', () => {
    const t0 = 3_000_000
    const save = roster(1)
    save.bank.meal = 2
    save.bank.roast = 1
    const id = save.workers[0].id
    expect(loadFood(save, id, 'meal', 2, t0).ok).toBe(true)
    expect(save.workers[0].foodSlot?.buff.effectId).toBe(EFFECT_ID.prodSpeed)
    expect(save.workers[0].foodSlot?.qty).toBe(1)

    expect(loadFood(save, id, 'roast', 1, t0 + 5_000).ok).toBe(true)
    expect(bankQty(save, 'meal')).toBe(1)
    expect(bankQty(save, 'roast')).toBe(0)
    expect(save.workers[0].foodSlot?.itemId).toBe('roast')
    expect(save.workers[0].foodSlot?.buff.effectId).toBe(EFFECT_ID.extraOutput)
    expect(save.workers[0].foodSlot?.buff.mul).toBe(0)
    expect(save.workers[0].foodSlot?.qty).toBe(0)
    expect(save.workers[0].foodSlot?.expiresAt).toBe(t0 + 5_000 + FOOD_BUFF_DEF.roast.durationS * 1000)
  })

  it('stacks station tool speed with the stronger food prodSpeed', () => {
    const t0 = 4_000_000
    const save = roster(1)
    save.stations.mining.stationLevel = 5
    save.bank.miningTool01 = 1
    save.bank.meal = 1
    save.bank.stew = 1
    assignWorker(save, save.workers[0].id, 'mining')
    expect(selectStationTool(save, 'mining', 'miningTool01').ok).toBe(true)
    expect(workerToolSpeedMul(save, save.workers[0], 'mining', t0)).toBe(1)
    expect(stationToolSpeedMul(save, 'mining')).toBeCloseTo(1.03)

    expect(loadFood(save, save.workers[0].id, 'meal', 1, t0).ok).toBe(true)
    expect(workerEffectValue(save, save.workers[0], 'mining', EFFECT_ID.prodSpeed, t0)).toBeCloseTo(1.02)
    expect(workerToolSpeedMul(save, save.workers[0], 'mining', t0)).toBeCloseTo(1.02)

    expect(unloadFood(save, save.workers[0].id).ok).toBe(true)
    expect(loadFood(save, save.workers[0].id, 'stew', 1, t0).ok).toBe(true)
    expect(workerEffectValue(save, save.workers[0], 'mining', EFFECT_ID.prodSpeed, t0)).toBeCloseTo(1.03)
    expect(workerToolSpeedMul(save, save.workers[0], 'mining', t0)).toBeCloseTo(1.03)
    expect(currentSpeed(save, 'mining', t0)).toBeCloseTo((1 / 20) * 1.03 * 1.03)
  })

  it('keeps food extraOutput while the station tool only multiplies speed', () => {
    const t0 = 5_000_000
    const save = roster(1)
    save.stations.mining.stationLevel = 5
    save.bank.miningTool01 = 4
    save.bank.roast = 1
    assignWorker(save, save.workers[0].id, 'mining')
    expect(selectStationTool(save, 'mining', 'miningTool01').ok).toBe(true)
    expect(loadFood(save, save.workers[0].id, 'roast', 1, t0).ok).toBe(true)

    expect(workerEffectValue(save, save.workers[0], 'mining', EFFECT_ID.prodSpeed, t0)).toBe(0)
    expect(workerEffectValue(save, save.workers[0], 'mining', EFFECT_ID.extraOutput, t0)).toBe(0)
    expect(matchingToolEffectMax(save, 'mining', EFFECT_ID.extraOutput, t0)).toBe(0)

    const next = ticks(save, 20, { now: t0 })
    expect(bankQty(next, 'ore')).toBe(1)
    expect(next.stations.mining.completed).toBe(1)
    expect(bankQty(next, 'miningTool01')).toBe(3)
  })
})

describe('eatFood', () => {
  it('manually eats one leftover and restarts the same buff from now', () => {
    const t0 = 6_000_000
    const save = roster(1)
    save.bank.meal = 3
    const id = save.workers[0].id
    const hp = save.workers[0].hp
    expect(loadFood(save, id, 'meal', 3, t0).ok).toBe(true)
    expect(save.workers[0].foodSlot?.qty).toBe(2)
    expect(save.workers[0].foodSlot?.expiresAt).toBe(t0 + FOOD_BUFF_DEF.meal.durationS * 1000)

    const later = t0 + 60_000
    expect(eatFood(save, id, later)).toEqual({ ok: true, message: '吃了1份熟食' })
    expect(save.workers[0].foodSlot?.itemId).toBe('meal')
    expect(save.workers[0].foodSlot?.qty).toBe(1)
    expect(save.workers[0].foodSlot?.expiresAt).toBe(later + FOOD_BUFF_DEF.meal.durationS * 1000)
    expect(save.workers[0].foodSlot?.buff.effectId).toBe(EFFECT_ID.prodSpeed)
    expect(save.workers[0].foodSlot?.buff.mul).toBe(FOOD_BUFF_DEF.meal.mul)
    expect(save.workers[0].hp).toBe(hp)
    expect(bankQty(save, 'meal')).toBe(0)
  })

  it('fails when leftover is gone and does not change the slot', () => {
    const t0 = 7_000_000
    const save = roster(1)
    save.bank.meal = 1
    const id = save.workers[0].id
    expect(loadFood(save, id, 'meal', 1, t0).ok).toBe(true)
    expect(save.workers[0].foodSlot?.qty).toBe(0)
    const expiresAt = save.workers[0].foodSlot?.expiresAt
    expect(eatFood(save, id, t0 + 1_000)).toEqual({ ok: false, reason: '没有余粮' })
    expect(save.workers[0].foodSlot?.qty).toBe(0)
    expect(save.workers[0].foodSlot?.expiresAt).toBe(expiresAt)
  })

  it('fails without a slot', () => {
    const save = roster(1)
    expect(eatFood(save, save.workers[0].id)).toEqual({ ok: false, reason: '没有装食物' })
    expect(save.workers[0].foodSlot).toBeNull()
  })

  it('still auto-eats leftover after a manual eat', () => {
    const t0 = 8_000_000
    const save = roster(1)
    save.bank.meal = 3
    const id = save.workers[0].id
    expect(loadFood(save, id, 'meal', 3, t0).ok).toBe(true)
    expect(eatFood(save, id, t0 + 10_000).ok).toBe(true)
    expect(save.workers[0].foodSlot?.qty).toBe(1)
    expect(save.workers[0].foodSlot?.expiresAt).toBe(t0 + 10_000 + FOOD_BUFF_DEF.meal.durationS * 1000)

    applyTick(save, { now: t0 + 10_000 + FOOD_BUFF_DEF.meal.durationS * 1000 })
    expect(save.workers[0].foodSlot?.itemId).toBe('meal')
    expect(save.workers[0].foodSlot?.qty).toBe(0)
    expect(save.workers[0].foodSlot?.expiresAt).toBe(t0 + 10_000 + FOOD_BUFF_DEF.meal.durationS * 2000)
    expect(save.workers[0].foodSlot?.buff.mul).toBe(FOOD_BUFF_DEF.meal.mul)
  })

  it('heals about 25% hpMax when eating at low HP, at least above 1', () => {
    const t0 = 9_000_000
    const save = roster(1)
    save.bank.meal = 2
    const worker = save.workers[0]
    worker.hp = 1
    expect(loadFood(save, worker.id, 'meal', 2, t0).ok).toBe(true)
    expect(eatFood(save, worker.id, t0 + 1_000).ok).toBe(true)
    expect(worker.hp).toBe(1 + Math.ceil(worker.hpMax * 0.25))
    expect(worker.hp).toBeGreaterThan(1)
  })
})
