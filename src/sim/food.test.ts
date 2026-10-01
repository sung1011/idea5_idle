import { describe, expect, it } from 'vitest'
import { keepStationsOpen } from './stationUnlock'
import { assignWorker, withdrawWorker } from './assign'
import { bankQty } from './bank'
import { createSave } from './createSave'
import { foodHealAmount, offerRestFood, selectRestFood, takeRestEatNotices } from './food'
import { currentSpeed } from './query'
import { recruitWorker } from './recruit'
import { completeCycle } from './stations'
import { selectStationCategory } from './stationProgress'
import {
  BONE_SOUP_DURATION_S,
  BONE_SOUP_SPEED_MUL,
  EFFECT_ID,
  FOOD_BUFF_DEF,
  HUNTER_SKEWER_GUARD_S,
  MEAL_CYCLE_CUT,
  STEW_RESIST_S,
} from './tables'
import { ticks } from './tick'
import { workerEffectValue } from './tools'
import type { Save } from './types'
import { applyWorkerFatigue } from './workshopHp'
import sheetSource from '../ui/campSheet.vue?raw'
import workersPanelSource from '../ui/workersPanelV2.vue?raw'

function eatNoticesFor(workerId: string) {
  return takeRestEatNotices().filter((notice) => notice.workerId === workerId)
}

function roster(n: number): Save {
  const save = keepStationsOpen(createSave())
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
    const save = keepStationsOpen(createSave())
    expect(save.restFoodId).toBeNull()
    expect(selectRestFood(save, 'roast')).toEqual({ ok: false, reason: '没有这份伙食' })
    save.bank.roast = 1
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
    expect(worker.foodCycleCut).toBe(true)
    expect(worker.foodExtraOutput).toBe(false)
    expect(offerRestFood(save, worker.id, now + 1)).toBeNull()
    expect(bankQty(save, 'meal')).toBe(1)
    expect(eatNoticesFor(worker.id)).toEqual([{ workerId: worker.id, message: '吃了熟食 +25' }])
  })

  it('marks a successful rest meal and skips when nothing is eaten', () => {
    const save = roster(1)
    const worker = save.workers[0]
    assignWorker(save, worker.id, 'herbalism')
    worker.hpMax = 100
    worker.hp = 20
    save.bank.meal = 1
    expect(offerRestFood(save, worker.id)).toBeNull()
    expect(eatNoticesFor(worker.id)).toEqual([])

    expect(withdrawWorker(save, 'herbalism')).toEqual({ ok: true })
    expect(eatNoticesFor(worker.id)).toEqual([])

    worker.hp = worker.hpMax
    worker.fatigueDebt = 0
    expect(assignWorker(save, worker.id, 'herbalism').ok).toBe(true)
    save.restFoodId = 'meal'
    worker.hp = 20
    expect(withdrawWorker(save, 'herbalism')).toEqual({ ok: true })
    expect(eatNoticesFor(worker.id)).toEqual([{ workerId: worker.id, message: '吃了熟食 +25' }])
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
    expect(sheetSource).toContain("return '未选'")
    expect(sheetSource).toContain('选择伙食')
    expect(sheetSource).toContain('onPickFood(null)')
    expect(sheetSource).toContain('营地伙食')
    expect(sheetSource).toContain('game.selectRestFood')
    expect(workersPanelSource).not.toContain('rest-food-btn')
    expect(sheetSource).not.toContain('卸下食物')
    expect(sheetSource).not.toContain('换食')
    expect(workersPanelSource).not.toContain('game.loadFood')
    expect(workersPanelSource).not.toContain('game.unloadFood')
  })
})

function eatOnReturn(itemId: Save['restFoodId'], hp = 20): {
  save: Save
  worker: Save['workers'][0]
  healed: number
} {
  const save = roster(1)
  const worker = save.workers[0]
  assignWorker(save, worker.id, 'herbalism')
  worker.hpMax = 100
  worker.hp = hp
  worker.fatigueDebt = 0
  save.restFoodId = itemId
  if (itemId) save.bank[itemId] = 2
  save.lastTick = 2_000_000
  save.elapsedS = 10
  const healed = itemId ? foodHealAmount(itemId, worker.hpMax, hp) : 0
  expect(withdrawWorker(save, 'herbalism')).toEqual({ ok: true })
  return { save, worker, healed }
}

describe('unique rest food rules', () => {
  it('meal heals about 25% and shortens only the next dispatch', () => {
    const { save, worker, healed } = eatOnReturn('meal')
    expect(healed).toBe(25)
    expect(worker.hp).toBe(20 + healed)
    expect(worker.foodCycleCut).toBe(true)
    expect(eatNoticesFor(worker.id)[0]?.message).toBe(`吃了熟食 +${healed}`)

    worker.hp = worker.hpMax
    worker.fatigueDebt = 0
    expect(assignWorker(save, worker.id, 'herbalism').ok).toBe(true)
    const sped = currentSpeed(save, 'herbalism', save.lastTick)
    expect(completeCycle(save, 'herbalism', save.lastTick)).toBe(true)
    expect(worker.foodCycleCut).toBe(false)
    const bare = currentSpeed(save, 'herbalism', save.lastTick)
    expect(sped).toBeCloseTo(bare / (1 - MEAL_CYCLE_CUT))
    expect(sped).toBeGreaterThan(bare)
  })

  it('roast heals about 40% and adds 1 to the next successful lot', () => {
    const { save, worker, healed } = eatOnReturn('roast')
    expect(healed).toBe(40)
    expect(worker.hp).toBe(20 + healed)
    expect(worker.foodExtraOutput).toBe(true)
    expect(eatNoticesFor(worker.id)[0]?.message).toBe(`吃了烤肉 +${healed}`)

    worker.hp = worker.hpMax
    worker.fatigueDebt = 0
    expect(assignWorker(save, worker.id, 'herbalism').ok).toBe(true)
    const before = bankQty(save, 'herb') + bankQty(save, 'spice')
    expect(completeCycle(save, 'herbalism', save.lastTick)).toBe(true)
    expect(worker.foodExtraOutput).toBe(false)
    expect(bankQty(save, 'herb') + bankQty(save, 'spice')).toBe(before + 2)

    const afterFirst = bankQty(save, 'herb') + bankQty(save, 'spice')
    expect(completeCycle(save, 'herbalism', save.lastTick)).toBe(true)
    expect(bankQty(save, 'herb') + bankQty(save, 'spice')).toBe(afterFirst + 1)
  })

  it('stew heals about 55% and halves workshop drain for about 2 minutes', () => {
    const { save, worker, healed } = eatOnReturn('stew')
    expect(healed).toBeGreaterThanOrEqual(55)
    expect(healed).toBeLessThanOrEqual(56)
    expect(worker.hp).toBe(20 + healed)
    expect(worker.workshopResistUntil).toBe(10 + STEW_RESIST_S)
    expect(eatNoticesFor(worker.id)[0]?.message).toBe(`吃了香料炖 +${healed}`)

    worker.hp = 80
    worker.fatigueDebt = 0
    worker.assignment = 'mining'
    applyWorkerFatigue(save, 'mining', worker, 1, save.lastTick)
    expect(worker.hp).toBe(80)
    expect(worker.fatigueDebt).toBeCloseTo(0.5)

    save.elapsedS = worker.workshopResistUntil!
    applyWorkerFatigue(save, 'mining', worker, 1, save.lastTick)
    expect(worker.hp).toBe(79)
    expect(worker.fatigueDebt).toBeCloseTo(0.5)
  })

  it('boneSoup heals about 70% and lifts efficiency for about 8 minutes', () => {
    const { save, worker, healed } = eatOnReturn('boneSoup')
    const now = save.lastTick
    expect(healed).toBe(70)
    expect(worker.hp).toBe(20 + healed)
    expect(worker.foodBuff?.itemId).toBe('boneSoup')
    expect(worker.foodBuff?.expiresAt).toBe(now + BONE_SOUP_DURATION_S * 1000)
    expect(FOOD_BUFF_DEF.boneSoup.durationS).toBe(480)
    expect(workerEffectValue(save, worker, 'herbalism', EFFECT_ID.prodSpeed, now)).toBeCloseTo(BONE_SOUP_SPEED_MUL)
    expect(workerEffectValue(save, worker, 'herbalism', EFFECT_ID.prodSpeed, worker.foodBuff!.expiresAt)).toBe(0)
    expect(eatNoticesFor(worker.id)[0]?.message).toBe(`吃了骨汤 +${healed}`)
  })

  it('hunterSkewer tops off HP and blocks duty drain for a while', () => {
    const { save, worker } = eatOnReturn('hunterSkewer', 12)
    expect(worker.hp).toBe(100)
    expect(worker.dutyGuardUntil).toBe(10 + HUNTER_SKEWER_GUARD_S)
    expect(eatNoticesFor(worker.id)[0]?.message).toBe('吃了猎人肉串 +88')

    worker.assignment = 'mining'
    worker.fatigueDebt = 0.4
    applyWorkerFatigue(save, 'mining', worker, 3, save.lastTick)
    expect(worker.hp).toBe(100)
    expect(worker.fatigueDebt).toBe(0.4)

    save.elapsedS = worker.dutyGuardUntil!
    applyWorkerFatigue(save, 'mining', worker, 1, save.lastTick)
    expect(worker.hp).toBe(99)
  })
})

