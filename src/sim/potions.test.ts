import { afterEach, describe, expect, it } from 'vitest'
import { keepStationsOpen } from './stationUnlock'
import { assignWorker, withdrawWorker } from './assign'
import { bankQty } from './bank'
import { applyRestHeal, beginEnemyCombat, REST_HEAL_EVERY_S, workerLiveStats } from './combat'
import { createAssistWorker } from './combatAssist'
import { createSave } from './createSave'
import { mainlineStepOf } from './mainlineQuest'
import {
  ALCHEMY_POTION_UNLOCK,
  BRINK_HEAL_RATIO,
  BRINK_LOW_TARGET_RATIO,
  CLEAR_MIND_PRIMARY_RATIO,
  CLEAR_MIND_SECONDARY_RATIO,
  POTION_BATCH_RANGE,
  POTION_ITEM_IDS,
  unlockedPotionIds,
  RENEW_DURATION_S,
  RENEW_HEAL_RATIO,
  RENEW_TICK_S,
  RUSH_CYCLE_CUT,
  SALVE_HEAL_RATIO,
  BEAST_OIL_SPEED_MUL,
  STIM_DURATION_S,
  STIM_SPEED_MUL,
} from './tables'
import {
  applyPotionTicks,
  hydratePotionState,
  installPotionSlot,
  alchemyStationLevel,
  pickMainNeedPotion,
  rollAlchemyPotionBatch,
  unequipPotionSlot,
  workerWorkSpeedMul,
  POTION_FULL_HP_TIP,
  POTION_NO_DUTY_TIP,
  usePotionSlot,
} from './potions'
import { currentSpeed } from './query'
import { recruitWorker } from './recruit'
import { setRollOverride } from './rng'
import { completeCycle } from './stations'
import { researchTech } from './tech'
import { ticks } from './tick'
import { hpBarTone } from '../ui/hpBar'
import { isFullWorkshopHp, workerWearHp } from './workshopHp'
import type { EnemyEncounter, Save } from './types'
import { hydrateLoadedSave } from '../ui/saveGame'

function roster(n = 1): Save {
  const save = keepStationsOpen(createSave())
  save.diamonds = 15 * n
  for (let i = 0; i < n; i++) expect(recruitWorker(save).ok).toBe(true)
  return save
}

function testEnemy(): EnemyEncounter {
  return {
    kind: 'enemy',
    id: 'potion-enemy',
    label: '试敌',
    quality: 'green',
    needs: { meal: 1 },
    lootGold: 8,
    departed: false,
    combat: null,
    lootClaimed: false,
    enemyRank: 'minion',
    weaknesses: ['fire'],
    revealedWeaknesses: [],
  }
}

afterEach(() => {
  setRollOverride(null)
})

describe('alchemy batch roll', () => {
  it('covers the seven potion ids and their batch ranges', () => {
    expect(POTION_ITEM_IDS).toEqual([
      'stim',
      'salve',
      'renewSoup',
      'brinkSalve',
      'rushPowder',
      'doubleMist',
      'clearMind',
    ])
    for (const id of POTION_ITEM_IDS) {
      const range = POTION_BATCH_RANGE[id]
      expect(range.max).toBeGreaterThanOrEqual(range.min)
      expect(range.min).toBeGreaterThan(0)
    }
    setRollOverride(() => 0)
    const save = keepStationsOpen(createSave())
    expect(alchemyStationLevel(save)).toBe(1)
    expect(rollAlchemyPotionBatch(save)).toEqual({
      itemId: 'brinkSalve',
      qty: POTION_BATCH_RANGE.brinkSalve.min,
    })
  })

  it('unlocks potions by alchemy station level and treats a missing level as 1', () => {
    expect(ALCHEMY_POTION_UNLOCK).toEqual([
      { level: 1, id: 'brinkSalve' },
      { level: 2, id: 'stim' },
      { level: 3, id: 'clearMind' },
      { level: 4, id: 'salve' },
      { level: 5, id: 'renewSoup' },
      { level: 6, id: 'rushPowder' },
      { level: 7, id: 'doubleMist' },
    ])
    expect(unlockedPotionIds(1)).toEqual(['brinkSalve'])
    expect(unlockedPotionIds(2)).toEqual(['brinkSalve', 'stim'])
    expect(unlockedPotionIds(3)).toEqual(['brinkSalve', 'stim', 'clearMind'])
    expect(unlockedPotionIds(4)).toEqual(['brinkSalve', 'stim', 'clearMind', 'salve'])
    expect(unlockedPotionIds(5)).toEqual(['brinkSalve', 'stim', 'clearMind', 'salve', 'renewSoup'])
    expect(unlockedPotionIds(6)).toEqual([
      'brinkSalve',
      'stim',
      'clearMind',
      'salve',
      'renewSoup',
      'rushPowder',
    ])
    expect(unlockedPotionIds(7)).toEqual([
      'brinkSalve',
      'stim',
      'clearMind',
      'salve',
      'renewSoup',
      'rushPowder',
      'doubleMist',
    ])
    expect(unlockedPotionIds(10)).toEqual(unlockedPotionIds(7))
    expect(unlockedPotionIds(undefined)).toEqual(['brinkSalve'])
    expect(unlockedPotionIds(Number.NaN)).toEqual(['brinkSalve'])

    const missing = keepStationsOpen(createSave())
    delete (missing.stations.alchemy as { stationLevel?: number }).stationLevel
    expect(alchemyStationLevel(missing)).toBe(1)
    expect(alchemyStationLevel(null)).toBe(1)
    setRollOverride(() => 0.99)
    expect(rollAlchemyPotionBatch(missing).itemId).toBe('brinkSalve')
    expect(pickMainNeedPotion(0.99)).toBe('brinkSalve')
    expect(pickMainNeedPotion(0.99, 1)).toBe('brinkSalve')
    expect(pickMainNeedPotion(0, 2)).toBe('brinkSalve')
    expect(pickMainNeedPotion(0.99, 2)).toBe('stim')
  })

  it('rolls only brinkSalve at level 1 and evenly inside a wider pool', () => {
    const save = keepStationsOpen(createSave())
    save.stations.alchemy.stationLevel = 1
    for (const roll of [0, 0.5, 0.99]) {
      setRollOverride(() => roll)
      const rolled = rollAlchemyPotionBatch(save)
      expect(rolled.itemId).toBe('brinkSalve')
      const span = POTION_BATCH_RANGE.brinkSalve.max - POTION_BATCH_RANGE.brinkSalve.min + 1
      expect(rolled.qty).toBe(POTION_BATCH_RANGE.brinkSalve.min + Math.floor(roll * span))
    }

    save.stations.alchemy.stationLevel = 3
    const picks = [0, 0.34, 0.67]
    const expected = ['brinkSalve', 'stim', 'clearMind']
    let n = 0
    setRollOverride(() => {
      const turn = Math.floor(n / 2)
      const which = n % 2
      n += 1
      return which === 0 ? picks[turn]! : 0
    })
    const seen: string[] = []
    for (const id of expected) {
      const rolled = rollAlchemyPotionBatch(save)
      seen.push(rolled.itemId)
      expect(rolled.itemId).toBe(id)
      expect(rolled.qty).toBe(POTION_BATCH_RANGE[rolled.itemId].min)
      expect(unlockedPotionIds(3)).toContain(rolled.itemId)
    }
    expect(new Set(seen).size).toBe(3)
    expect(seen).not.toContain('salve')
    expect(seen).not.toContain('doubleMist')
  })
})

describe('potion slots', () => {
  it('only applies after install and keeps the assignment at 0 stock', () => {
    const save = roster(1)
    save.bank.salve = 1
    expect(usePotionSlot(save, 0)).toEqual({ ok: false, reason: '空槽' })
    expect(installPotionSlot(save, 0, 'salve').ok).toBe(true)
    expect(save.potionSlots[0]).toBe('salve')
    save.workers[0].hp = 1
    expect(usePotionSlot(save, 0).ok).toBe(true)
    expect(bankQty(save, 'salve')).toBe(0)
    expect(save.potionSlots[0]).toBe('salve')
    expect(usePotionSlot(save, 0)).toEqual({ ok: false, reason: '巫毒回春剂见底' })
    expect(unequipPotionSlot(save, 0).ok).toBe(true)
    expect(save.potionSlots[0]).toBeNull()
  })

  it('rejects a second slot of the same potion', () => {
    const save = roster()
    save.bank.stim = 2
    expect(installPotionSlot(save, 0, 'stim').ok).toBe(true)
    expect(installPotionSlot(save, 1, 'stim')).toEqual({ ok: false, reason: '这种药剂已经装上了' })
  })
})

describe('seven potion effects', () => {
  it('stim speeds the drinkers for 3 minutes and stacks with beast oil', () => {
    const save = roster(1)
    save.guideQuestStep = mainlineStepOf('huntStart')
    const worker = save.workers[0]
    save.stations.herbalism.auto = true
    save.bank.stim = 1
    save.bank.beastOil = 1
    expect(installPotionSlot(save, 0, 'stim').ok).toBe(true)
    expect(installPotionSlot(save, 1, 'beastOil').ok).toBe(true)
    expect(usePotionSlot(save, 0).ok).toBe(true)
    expect(usePotionSlot(save, 1).ok).toBe(true)
    expect(workerWorkSpeedMul(worker, save.elapsedS)).toBeCloseTo(STIM_SPEED_MUL * BEAST_OIL_SPEED_MUL)
    expect(assignWorker(save, worker.id, 'herbalism').ok).toBe(true)
    const sped = currentSpeed(save, 'herbalism')
    worker.potion = undefined
    const bare = currentSpeed(save, 'herbalism')
    worker.potion = { stimUntil: save.elapsedS + STIM_DURATION_S, beastOilUntil: save.elapsedS + STIM_DURATION_S }
    expect(sped).toBeCloseTo(bare * STIM_SPEED_MUL * BEAST_OIL_SPEED_MUL)
    const later = ticks(save, STIM_DURATION_S)
    expect(workerWorkSpeedMul(later.workers[0], later.elapsedS)).toBe(1)
    const person = later.workers[0]
    if (person && person.assignment !== 'herbalism') {
      person.fatigueDebt = 0
      person.hp = person.hpMax
      expect(assignWorker(later, person.id, 'herbalism').ok).toBe(true)
    }
    expect(currentSpeed(later, 'herbalism')).toBeCloseTo(bare)
  })

  it('salve heals every camp worker by 10% hpMax', () => {
    const save = roster(2)
    save.workers[0].hp = 1
    save.workers[1].hp = 1
    save.bank.salve = 1
    expect(installPotionSlot(save, 0, 'salve').ok).toBe(true)
    expect(usePotionSlot(save, 0).ok).toBe(true)
    expect(save.workers[0].hp).toBe(1 + Math.ceil(save.workers[0].hpMax * SALVE_HEAL_RATIO))
    expect(save.workers[1].hp).toBe(1 + Math.ceil(save.workers[1].hpMax * SALVE_HEAL_RATIO))
  })

  it('on the potion-use guide, salve fills camp hp instead of 10%', () => {
    const save = roster(2)
    save.guideQuestStep = mainlineStepOf('potionUse')
    save.workers[0].hp = 1
    save.workers[1].hp = 1
    save.bank.salve = 1
    expect(installPotionSlot(save, 0, 'salve').ok).toBe(true)
    expect(usePotionSlot(save, 0).ok).toBe(true)
    expect(save.workers[0].hp).toBe(save.workers[0].hpMax)
    expect(save.workers[1].hp).toBe(save.workers[1].hpMax)
    expect(save.workers[0].fatigueDebt).toBe(0)
    expect(save.workers[1].fatigueDebt).toBe(0)
  })

  it('renewSoup keeps ticking after the drinker is sent to a station', () => {
    const save = roster(1)
    const worker = save.workers[0]
    worker.hp = 1
    save.bank.renewSoup = 1
    expect(installPotionSlot(save, 0, 'renewSoup').ok).toBe(true)
    expect(usePotionSlot(save, 0).ok).toBe(true)
    worker.hp = worker.hpMax
    worker.fatigueDebt = 0
    expect(assignWorker(save, worker.id, 'mining').ok).toBe(true)
    worker.hp = 1
    const pip = Math.ceil(worker.hpMax * RENEW_HEAL_RATIO)
    const afterOne = ticks(save, RENEW_TICK_S)
    expect(afterOne.workers[0].hp).toBe(1 + pip)
    const done = ticks(afterOne, RENEW_DURATION_S)
    expect(done.workers[0].hp).toBeGreaterThan(1 + pip)
    expect(done.workers[0].potion?.renewUntil ?? null).toBeNull()
  })

  it('brinkSalve lifts workers at or under 30% to 40% and heals the rest by 5%', () => {
    const save = roster(3)
    const low = save.workers[0]
    const mid = save.workers[1]
    const full = save.workers[2]
    low.hp = Math.floor(low.hpMax * 0.3)
    const midStart = Math.max(Math.floor(mid.hpMax * 0.3) + 1, Math.ceil(mid.hpMax * 0.5))
    mid.hp = midStart
    full.hp = full.hpMax
    save.bank.brinkSalve = 1
    expect(installPotionSlot(save, 0, 'brinkSalve').ok).toBe(true)
    expect(usePotionSlot(save, 0).ok).toBe(true)
    expect(low.hp).toBe(Math.ceil(low.hpMax * BRINK_LOW_TARGET_RATIO))
    expect(mid.hp).toBe(Math.min(mid.hpMax, midStart + Math.ceil(mid.hpMax * BRINK_HEAL_RATIO)))
    expect(full.hp).toBe(full.hpMax)
    expect(low.hp / low.hpMax).toBeGreaterThan(0.3)
  })

  it('doubleMist multiplies the camp head next output then clears', () => {
    setRollOverride(() => 0)
    const save = roster(1)
    const worker = save.workers[0]
    save.bank.doubleMist = 1
    expect(installPotionSlot(save, 0, 'doubleMist').ok).toBe(true)
    expect(usePotionSlot(save, 0).ok).toBe(true)
    expect(worker.potion?.doubleMist).toBe(2)
    expect(bankQty(save, 'doubleMist')).toBe(0)
    expect(assignWorker(save, worker.id, 'herbalism').ok).toBe(true)
    expect(completeCycle(save, 'herbalism')).toBe(true)
    expect(bankQty(save, 'herb') + bankQty(save, 'spice')).toBe(2)
    expect(worker.potion?.doubleMist ?? null).toBeNull()
    expect(completeCycle(save, 'herbalism')).toBe(true)
    expect(bankQty(save, 'herb') + bankQty(save, 'spice')).toBe(3)

    setRollOverride(() => 0.85)
    const triple = roster(1)
    triple.bank.doubleMist = 1
    expect(installPotionSlot(triple, 0, 'doubleMist').ok).toBe(true)
    expect(usePotionSlot(triple, 0).ok).toBe(true)
    expect(triple.workers[0].potion?.doubleMist).toBe(3)
    expect(assignWorker(triple, triple.workers[0].id, 'herbalism').ok).toBe(true)
    expect(completeCycle(triple, 'herbalism')).toBe(true)
    expect(bankQty(triple, 'herb') + bankQty(triple, 'spice')).toBe(3)
    expect(triple.workers[0].potion?.doubleMist ?? null).toBeNull()
  })

  it('rushPowder shortens the next cycle of the first three camp workers by 40%', () => {
    const save = roster(4)
    save.bank.rushPowder = 1
    expect(installPotionSlot(save, 0, 'rushPowder').ok).toBe(true)
    expect(usePotionSlot(save, 0).ok).toBe(true)
    expect(save.workers.slice(0, 3).every((worker) => worker.potion?.rush === true)).toBe(true)
    expect(save.workers[3].potion?.rush).toBeFalsy()
    expect(bankQty(save, 'rushPowder')).toBe(0)
    expect(assignWorker(save, save.workers[0].id, 'herbalism').ok).toBe(true)
    const rushed = currentSpeed(save, 'herbalism')
    save.workers[0].potion = { ...(save.workers[0].potion ?? {}), rush: false }
    const bare = currentSpeed(save, 'herbalism')
    expect(rushed).toBeCloseTo(bare / (1 - RUSH_CYCLE_CUT))
    save.workers[0].potion = { rush: true }
    expect(completeCycle(save, 'herbalism')).toBe(true)
    expect(save.workers[0].potion?.rush).toBe(false)
    expect(currentSpeed(save, 'herbalism')).toBeCloseTo(bare)
  })

  it('clearMind heals the two most wounded on duty at 30% then 20% even above half HP', () => {
    const save = roster(4)
    expect(save.stations.alchemy.stationLevel).toBe(1)
    const worst = save.workers[0]
    const second = save.workers[1]
    const lighter = save.workers[2]
    const full = save.workers[3]
    worst.fatigueDebt = 2.4
    worst.hp = 1
    second.hp = Math.max(1, Math.floor(second.hpMax * 0.8))
    lighter.hp = Math.max(second.hp + 1, Math.floor(lighter.hpMax * 0.9))
    if (lighter.hp >= lighter.hpMax) lighter.hp = lighter.hpMax - 1
    const lighterBefore = lighter.hp
    const secondBefore = second.hp
    expect(second.hp / second.hpMax).toBeGreaterThan(0.5)
    full.hp = full.hpMax
    save.bank.clearMind = 2
    expect(installPotionSlot(save, 0, 'clearMind').ok).toBe(true)
    expect(usePotionSlot(save, 0).ok).toBe(true)
    const primary = Math.ceil(worst.hpMax * CLEAR_MIND_PRIMARY_RATIO)
    expect(worst.fatigueDebt).toBe(0)
    expect(worst.hp).toBeCloseTo(1 + primary - 2.4)
    expect(CLEAR_MIND_PRIMARY_RATIO).toBe(0.3)
    expect(second.hp).toBe(Math.min(second.hpMax, secondBefore + Math.ceil(second.hpMax * CLEAR_MIND_SECONDARY_RATIO)))
    expect(lighter.hp).toBe(lighterBefore)
    expect(full.hp).toBe(full.hpMax)
    expect(bankQty(save, 'clearMind')).toBe(1)

    full.hp = full.hpMax
    worst.hp = worst.hpMax
    second.hp = second.hpMax
    lighter.hp = lighter.hpMax
    expect(usePotionSlot(save, 0)).toEqual({ ok: false, reason: POTION_FULL_HP_TIP })
    expect(bankQty(save, 'clearMind')).toBe(1)
  })

  it('clearMind heals the only wounded worker by 30% and still works from a locked stock', () => {
    const save = roster(2)
    expect(unlockedPotionIds(save.stations.alchemy.stationLevel)).toEqual(['brinkSalve'])
    const wounded = save.workers[0]
    const healthy = save.workers[1]
    wounded.hp = 1
    healthy.hp = healthy.hpMax
    save.bank.clearMind = 1
    expect(installPotionSlot(save, 0, 'clearMind').ok).toBe(true)
    expect(usePotionSlot(save, 0).ok).toBe(true)
    expect(wounded.hp).toBe(1 + Math.ceil(wounded.hpMax * CLEAR_MIND_PRIMARY_RATIO))
    expect(healthy.hp).toBe(healthy.hpMax)
    expect(bankQty(save, 'clearMind')).toBe(0)
  })

  it('clears fatigue debt when a heal reaches hpMax so wear and detail bars match', () => {
    const save = roster(1)
    const worker = save.workers[0]
    worker.hp = worker.hpMax - 1
    worker.fatigueDebt = 0.6
    save.bank.salve = 1
    expect(installPotionSlot(save, 0, 'salve').ok).toBe(true)
    expect(usePotionSlot(save, 0).ok).toBe(true)
    expect(worker.hp).toBe(worker.hpMax)
    expect(worker.fatigueDebt).toBe(0)
    expect(workerWearHp(worker)).toBe(worker.hp)
    expect(hpBarTone(worker.hp, worker.hpMax)).toBe('full')
    expect(hpBarTone(workerWearHp(worker), worker.hpMax)).toBe('full')
  })

  it('does not consume salve or brinkSalve when every on-duty worker is already full', () => {
    const save = roster(2)
    const full = save.workers[0]
    const wounded = save.workers[1]
    full.hp = full.hpMax
    full.fatigueDebt = 0
    wounded.hp = wounded.hpMax
    wounded.fatigueDebt = 0
    save.bank.salve = 2
    save.bank.brinkSalve = 1
    expect(installPotionSlot(save, 0, 'salve').ok).toBe(true)
    expect(installPotionSlot(save, 1, 'brinkSalve').ok).toBe(true)
    expect(usePotionSlot(save, 0)).toEqual({ ok: false, reason: POTION_FULL_HP_TIP })
    expect(usePotionSlot(save, 1)).toEqual({ ok: false, reason: POTION_FULL_HP_TIP })
    expect(bankQty(save, 'salve')).toBe(2)
    expect(bankQty(save, 'brinkSalve')).toBe(1)
    expect(save.guideQuestPotionUsed).toBeFalsy()

    wounded.hp = Math.max(1, wounded.hpMax - 2)
    expect(usePotionSlot(save, 0).ok).toBe(true)
    expect(bankQty(save, 'salve')).toBe(1)
    expect(wounded.hp).toBeGreaterThan(wounded.hpMax - 2)
    expect(full.hp).toBe(full.hpMax)
  })

  it('after bracer tighten, rest, salve, and assign share one hpMax', () => {
    const save = roster(2)
    const full = save.workers[0]
    const half = save.workers[1]
    const fullBare = full.hpMax
    const halfBare = half.hpMax
    const halfHp = Math.round(halfBare / 2)
    half.hp = halfHp
    save.techPoints = 99
    expect(researchTech(save, 'bracerTighten').ok).toBe(true)

    expect(full.hpMax).toBe(workerLiveStats(full, save).hp)
    expect(full.hpMax).toBeGreaterThan(fullBare)
    expect(full.hp).toBe(full.hpMax)
    expect(full.hp).toBeLessThanOrEqual(full.hpMax)
    expect(isFullWorkshopHp(full)).toBe(true)
    expect(assignWorker(save, full.id, 'herbalism').ok).toBe(true)

    expect(half.hpMax).toBe(workerLiveStats(half, save).hp)
    expect(half.hp).toBe(Math.round((halfHp / halfBare) * half.hpMax))
    expect(half.hp).toBeLessThanOrEqual(half.hpMax)
    expect(isFullWorkshopHp(half)).toBe(false)
    expect(assignWorker(save, half.id, 'mining')).toEqual({ ok: false, reason: '满血才能上岗' })

    expect(withdrawWorker(save, 'herbalism').ok).toBe(true)
    full.hp = full.hpMax - 1
    full.fatigueDebt = 0.4
    save.bank.salve = 1
    expect(installPotionSlot(save, 0, 'salve').ok).toBe(true)
    expect(usePotionSlot(save, 0).ok).toBe(true)
    expect(full.hp).toBe(full.hpMax)
    expect(full.fatigueDebt).toBe(0)
    expect(full.hp).toBeLessThanOrEqual(full.hpMax)
    expect(workerWearHp(full)).toBe(full.hp)
    expect(hpBarTone(workerWearHp(full), full.hpMax)).toBe('full')

    full.hp = 1
    full.fatigueDebt = 0.5
    save.elapsedS = REST_HEAL_EVERY_S
    for (let i = 0; i < full.hpMax + 5; i++) {
      applyRestHeal(save)
      expect(full.hp).toBeLessThanOrEqual(full.hpMax)
      expect(full.hpMax).toBe(workerLiveStats(full, save).hp)
      save.elapsedS += REST_HEAL_EVERY_S
    }
    expect(full.hp).toBe(full.hpMax)
    expect(full.fatigueDebt).toBe(0)
    expect(isFullWorkshopHp(full)).toBe(true)
    expect(assignWorker(save, full.id, 'herbalism').ok).toBe(true)

    expect(withdrawWorker(save, 'herbalism').ok).toBe(true)
    const enc = testEnemy()
    save.encounters[0] = enc
    const combat = beginEnemyCombat(enc, [full], 1_000, 1, undefined, save)
    expect(combat.workers[0]?.hpMax).toBe(full.hpMax)
    expect(combat.workers[0]?.hpMax).toBe(workerLiveStats(full, save).hp)
    expect(combat.workers[0]?.hp).toBeLessThanOrEqual(combat.workers[0]!.hpMax)
    expect(full.hp).toBeLessThanOrEqual(full.hpMax)
    expect(combat.workers[0]?.hp).toBe(full.hp)
  })

  it('loads a pre-tech full worker onto the tech hp cap', () => {
    const save = roster(1)
    const worker = save.workers[0]
    const bare = worker.hpMax
    worker.hp = bare
    const loaded = hydrateLoadedSave({
      ...save,
      techLevels: { bracerTighten: 1 },
      unlockedTechIds: ['bracerTighten'],
    })
    expect(loaded).not.toBeNull()
    const next = loaded!.workers[0]!
    expect(next.hpMax).toBe(workerLiveStats(next, loaded!).hp)
    expect(next.hpMax).toBeGreaterThan(bare)
    expect(next.hp).toBe(next.hpMax)
    expect(next.hp).toBeLessThanOrEqual(next.hpMax)
    expect(isFullWorkshopHp(next)).toBe(true)
  })
})

describe('potion slot camp targeting', () => {
  it('does not consume when the camp is empty', () => {
    const save = roster(1)
    assignWorker(save, save.workers[0].id, 'herbalism')
    save.workers[0].hp = 1
    save.bank.salve = 1
    save.bank.stim = 1
    expect(installPotionSlot(save, 0, 'salve').ok).toBe(true)
    expect(usePotionSlot(save, 0)).toEqual({ ok: false, reason: POTION_NO_DUTY_TIP })
    expect(bankQty(save, 'salve')).toBe(1)
    expect(save.guideQuestPotionUsed).toBeFalsy()
    expect(installPotionSlot(save, 1, 'stim').ok).toBe(true)
    expect(usePotionSlot(save, 1)).toEqual({ ok: false, reason: POTION_NO_DUTY_TIP })
    expect(bankQty(save, 'stim')).toBe(1)
    expect(save.workers[0].potion?.stimUntil ?? null).toBeNull()
  })

  it('heals camp workers and skips stations, combat, and assist', () => {
    const save = roster(3)
    const duty = save.workers[0]
    const rest = save.workers[1]
    const fighter = save.workers[2]
    assignWorker(save, duty.id, 'herbalism')
    duty.hp = 1
    rest.hp = 1
    fighter.hp = fighter.hpMax
    const enc = testEnemy()
    save.encounters[0] = enc
    beginEnemyCombat(enc, [fighter], 2_000_000, 1, undefined, save)
    expect(enc.combat?.workers[0]?.id).toBe(fighter.id)
    enc.combat!.enemy.nextActAt = 9_000_000
    enc.combat!.workers[0].nextActAt = 9_000_000
    enc.combat!.workers[0].hp = 5
    fighter.hp = 5
    const assist = createAssistWorker(save)
    assist.assignment = 'mining'
    assist.hp = 1
    save.workers.push(assist)
    save.bank.salve = 1
    expect(installPotionSlot(save, 0, 'salve').ok).toBe(true)
    expect(usePotionSlot(save, 0).ok).toBe(true)
    expect(bankQty(save, 'salve')).toBe(0)
    expect(duty.hp).toBe(1)
    expect(rest.hp).toBe(1 + Math.ceil(rest.hpMax * SALVE_HEAL_RATIO))
    expect(fighter.hp).toBe(5)
    expect(enc.combat?.workers[0]?.hp).toBe(5)
    expect(assist.hp).toBe(1)
  })
})

describe('hydrate potions', () => {
  it('moves old generic potion stock and encounter needs to salve, and drops enrage fields', () => {
    const raw = {
      ...keepStationsOpen(createSave()),
      bank: { potion: 5, herb: 2 },
      encounters: [
        {
          kind: 'enemy',
          id: 'old-potion',
          label: '旧单',
          quality: 'green',
          needs: { potion: 3 },
          lootGold: 8,
          departed: false,
          combat: null,
          lootClaimed: false,
          enemyRank: 'minion',
          weaknesses: ['fire'],
          revealedWeaknesses: [],
        },
      ],
      stations: {
        ...keepStationsOpen(createSave()).stations,
        mining: {
          ...keepStationsOpen(createSave()).stations.mining,
          enrageUntil: 99,
          enrageReadyAt: 199,
        },
      },
    }
    const save = hydrateLoadedSave(raw)
    expect(save?.bank.potion).toBeUndefined()
    expect(save?.bank.salve).toBe(5)
    expect(save?.potionSlots).toEqual([null, null, null, null])
    const enc = save?.encounters.find((row) => row.id === 'old-potion')
    expect(enc?.kind === 'enemy' && enc.needs).toEqual({ salve: 3 })
    expect((save?.stations.mining as { enrageUntil?: unknown }).enrageUntil).toBeUndefined()
  })

  it('maps leftover potion consume on the market board to salve', () => {
    const save = hydrateLoadedSave({
      ...keepStationsOpen(createSave()),
      marketEncounters: [
        {
          kind: 'passerby',
          id: 'old-market-potion',
          label: '旧换货',
          quality: 'green',
          wants: { potion: 2 },
          offers: { meal: 1 },
          completed: false,
        },
      ],
    })
    const enc = save?.marketEncounters.find((row) => row.id === 'old-market-potion')
    expect(enc?.kind === 'passerby' && enc.wants).toEqual({ salve: 2 })
  })

  it('clears leftover warDrum slots and drops leftover warDrum stock', () => {
    const save = hydrateLoadedSave({
      ...keepStationsOpen(createSave()),
      bank: { salve: 2, warDrum: 3 },
      potionSlots: ['warDrum', 'salve', null, null],
    } as never)
    expect(save?.potionSlots).toEqual([null, 'salve', null, null])
    expect((save?.bank as { warDrum?: number }).warDrum).toBeUndefined()
    expect(save).not.toHaveProperty('potionBuffs')
  })

  it('drops account-level timed buffs', () => {
    const save = keepStationsOpen(createSave())
    save.elapsedS = 40
    hydratePotionState(save, {
      potionBuffs: { stimUntil: 80, wardUntil: 200, focusUntil: 200, focusConsumed: ['herbalism'] },
    })
    expect(save).not.toHaveProperty('potionBuffs')
    applyPotionTicks(save)
    expect(save.workers.every((worker) => !worker.potion?.stimUntil)).toBe(true)
  })

  it('maps focusDraft and wardElixir stock, slots, and orders onto the new potions', () => {
    const save = hydrateLoadedSave({
      ...keepStationsOpen(createSave()),
      bank: { focusDraft: 4, wardElixir: 2, doubleMist: 1, salve: 3 },
      potionSlots: ['focusDraft', 'wardElixir', null, null],
      encounters: [
        {
          kind: 'enemy',
          id: 'old-focus',
          label: '旧凝神单',
          quality: 'green',
          needs: { focusDraft: 2, wardElixir: 1 },
          lootGold: 8,
          departed: false,
          combat: null,
          lootClaimed: false,
          enemyRank: 'minion',
          weaknesses: ['fire'],
          revealedWeaknesses: [],
        },
      ],
      marketEncounters: [
        {
          kind: 'passerby',
          id: 'old-ward',
          label: '旧护命换货',
          quality: 'green',
          wants: { wardElixir: 1 },
          offers: { focusDraft: 2 },
          completed: false,
        },
      ],
    } as never)
    expect(save?.bank.doubleMist).toBe(5)
    expect(save?.bank.rushPowder).toBe(2)
    expect(save?.bank.salve).toBe(3)
    expect((save?.bank as { focusDraft?: number }).focusDraft).toBeUndefined()
    expect((save?.bank as { wardElixir?: number }).wardElixir).toBeUndefined()
    expect(save?.potionSlots).toEqual(['doubleMist', 'rushPowder', null, null])
    const enemy = save?.encounters.find((row) => row.id === 'old-focus')
    expect(enemy?.kind === 'enemy' && enemy.needs).toEqual({ doubleMist: 2, rushPowder: 1 })
    const market = save?.marketEncounters.find((row) => row.id === 'old-ward')
    expect(market?.kind === 'passerby' && market.wants).toEqual({ rushPowder: 1 })
    expect(market?.kind === 'passerby' && market.offers).toEqual({ doubleMist: 2 })
    expect(save).not.toHaveProperty('potionBuffs')
  })
})
