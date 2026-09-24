import { describe, expect, it } from 'vitest'
import { assignWorker, withdrawWorker } from './assign'
import { bankQty } from './bank'
import { createSave } from './createSave'
import { offerRestFood, selectRestFood } from './food'
import { currentSpeed } from './query'
import { recruitWorker } from './recruit'
import { selectStationCategory } from './stationProgress'
import { EFFECT_ID, FOOD_BUFF_DEF } from './tables'
import { ticks } from './tick'
import { workerEffectValue } from './tools'
import type { Save } from './types'
import workersPanelSource from '../ui/workersPanelV2.vue?raw'

function roster(n: number): Save {
  const save = createSave()
  save.diamonds = 15 * n
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

describe('rest area shared food', () => {
  it('selects a cooked food and can clear it', () => {
    const save = createSave()
    expect(save.restFoodId).toBeNull()
    expect(selectRestFood(save, 'roast')).toEqual({ ok: true })
    expect(save.restFoodId).toBe('roast')
    expect(selectRestFood(save, null)).toEqual({ ok: true })
    expect(save.restFoodId).toBeNull()
    expect(selectRestFood(save, 'stim' as 'meal').ok).toBe(false)
  })

  it('feeds one portion when a wounded worker enters rest', () => {
    const save = roster(1)
    const worker = save.workers[0]
    assignWorker(save, worker.id, 'herbalism')
    worker.hpMax = 100
    worker.hp = 30
    save.bank.meal = 2
    save.restFoodId = 'meal'
    const now = 1_000_000
    save.lastTick = now
    expect(withdrawWorker(save, 'herbalism')).toEqual({ ok: true })
    expect(worker.assignment).toBeNull()
    expect(bankQty(save, 'meal')).toBe(1)
    expect(worker.hp).toBe(30 + Math.ceil(100 * 0.25))
    expect(worker.foodSlot).toBeNull()
    expect(worker.foodBuff?.itemId).toBe('meal')
    expect(worker.foodBuff?.expiresAt).toBe(now + FOOD_BUFF_DEF.meal.durationS * 1000)
    expect(workerEffectValue(save, worker, 'herbalism', EFFECT_ID.prodSpeed, now)).toBeCloseTo(1.02)
    expect(workerEffectValue(save, worker, 'herbalism', EFFECT_ID.prodSpeed, worker.foodBuff!.expiresAt)).toBe(0)
    expect(offerRestFood(save, worker.id, now + 1)).toBeNull()
    expect(bankQty(save, 'meal')).toBe(1)
  })

  it('does not eat when food is unselected, out of stock, or the worker is not wounded', () => {
    const save = roster(1)
    const worker = save.workers[0]
    assignWorker(save, worker.id, 'herbalism')
    worker.hpMax = 100
    worker.hp = 20
    save.bank.meal = 1
    expect(withdrawWorker(save, 'herbalism')).toEqual({ ok: true })
    expect(worker.hp).toBe(20)
    expect(bankQty(save, 'meal')).toBe(1)

    worker.hp = worker.hpMax
    worker.fatigueDebt = 0
    expect(assignWorker(save, worker.id, 'herbalism').ok).toBe(true)
    save.restFoodId = 'meal'
    save.bank.meal = 0
    worker.hp = 20
    expect(withdrawWorker(save, 'herbalism')).toEqual({ ok: true })
    expect(worker.hp).toBe(20)
    expect(bankQty(save, 'meal')).toBe(0)

    worker.hp = worker.hpMax
    worker.fatigueDebt = 0
    expect(assignWorker(save, worker.id, 'herbalism').ok).toBe(true)
    save.bank.meal = 3
    expect(withdrawWorker(save, 'herbalism')).toEqual({ ok: true })
    expect(worker.hp).toBe(worker.hpMax)
    expect(bankQty(save, 'meal')).toBe(3)
  })

  it('does not eat while the worker stays on duty', () => {
    const save = roster(1)
    const worker = save.workers[0]
    assignWorker(save, worker.id, 'mining')
    worker.hpMax = 100
    worker.hp = 20
    save.restFoodId = 'meal'
    save.bank.meal = 2
    save.lastTick = 4_000_000
    expect(offerRestFood(save, worker.id)).toBeNull()
    expect(worker.hp).toBe(20)
    expect(bankQty(save, 'meal')).toBe(2)
    expect(currentSpeed(save, 'mining', save.lastTick)).toBeGreaterThan(0)
  })

  it('does not show personal food loading in the worker sheet', () => {
    expect(workersPanelSource).toContain('未选伙食')
    expect(workersPanelSource).toContain('选择伙食')
    expect(workersPanelSource).toContain('onPickRestFood(null)')
    expect(workersPanelSource).toContain('休息区伙食')
    expect(workersPanelSource).toContain('game.selectRestFood')
    expect(workersPanelSource).not.toContain('rest-food-btn')
    expect(workersPanelSource).not.toContain('卸下食物')
    expect(workersPanelSource).not.toContain('换食')
    expect(workersPanelSource).not.toContain('game.loadFood')
    expect(workersPanelSource).not.toContain('game.unloadFood')
  })
})
