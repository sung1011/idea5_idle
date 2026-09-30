import { afterEach, describe, expect, it } from 'vitest'
import { keepStationsOpen } from './stationUnlock'
import { assignWorker } from './assign'
import { applyRestHeal, REST_HEAL_EVERY_S } from './combat'
import { createSave } from './createSave'
import { campBandageHealAmount } from './tech'
import { currentSpeed } from './query'
import { recruitWorker } from './recruit'
import { setRollOverride } from './rng'
import { pinStationWear } from './stationWear'
import { completeCycle, stepStation } from './stations'
import { ticks } from './tick'
import type { Save, Worker } from './types'
import { hpBarFill, hpBarTone } from '../ui/hpBar'
import {
  HP_EMPTY_RATIO,
  HP_WOUNDED_RATIO,
  restHealAmount,
  STATION_HP_EFFICIENCY_RESERVE,
  stationHpEfficiencyLabel,
  stationHpWorkMul,
  takeWorkshopHpEfficiencyTip,
  isFullWorkshopHp,
  workerWearHp,
  WORKSHOP_EMPTY_WORK_MUL,
  WORKSHOP_HP_EFFICIENCY_TIP,
  WORKSHOP_WOUNDED_WORK_MUL,
  workshopHpWorkMul,
} from './workshopHp'

afterEach(() => {
  setRollOverride(null)
})

function roster(n: number): Save {
  const save = keepStationsOpen(createSave())
  save.diamonds = 15 * n
  for (let i = 0; i < n; i++) expect(recruitWorker(save).ok).toBe(true)
  return save
}

function stubWorker(hp: number, hpMax: number): Worker {
  return {
    id: 'w-stub',
    qualityTier: 1,
    assignment: 'mining',
    foodSlot: null,
    fatigueDebt: 0,
    isNew: false,
    hp,
    hpMax,
    level: 1,
    xp: 0,
    combatAttrs: [],
  }
}

describe('workshop HP formulas', () => {
  it('scales work by empty / wounded / normal bands', () => {
    expect(HP_EMPTY_RATIO).toBe(0.1)
    expect(HP_WOUNDED_RATIO).toBe(0.3)
    expect(workshopHpWorkMul(stubWorker(5, 100))).toBe(WORKSHOP_EMPTY_WORK_MUL)
    expect(workshopHpWorkMul(stubWorker(10, 100))).toBe(WORKSHOP_EMPTY_WORK_MUL)
    expect(workshopHpWorkMul(stubWorker(11, 100))).toBe(WORKSHOP_WOUNDED_WORK_MUL)
    expect(workshopHpWorkMul(stubWorker(15, 100))).toBe(WORKSHOP_WOUNDED_WORK_MUL)
    expect(workshopHpWorkMul(stubWorker(30, 100))).toBe(WORKSHOP_WOUNDED_WORK_MUL)
    expect(workshopHpWorkMul(stubWorker(31, 100))).toBe(1)
    expect(workshopHpWorkMul(stubWorker(50, 100))).toBe(1)
    expect(workshopHpWorkMul(stubWorker(26, 26))).toBe(1)
    expect(stationHpEfficiencyLabel(1)).toBe('效率 100%')
    expect(stationHpEfficiencyLabel(WORKSHOP_WOUNDED_WORK_MUL)).toBe('效率 80%')
    expect(stationHpEfficiencyLabel(WORKSHOP_EMPTY_WORK_MUL)).toBe('效率 50%')
    expect(STATION_HP_EFFICIENCY_RESERVE).toBe('效率 999%')
    for (const label of ['效率 50%', '效率 80%', '效率 100%']) {
      expect(label.length).toBeLessThanOrEqual(STATION_HP_EFFICIENCY_RESERVE.length)
    }

    const save = roster(1)
    const worker = save.workers[0]
    assignWorker(save, worker.id, 'mining')
    pinStationWear(save, 'mining', ['dot'])
    const before = worker.hp
    expect(completeCycle(save, 'mining')).toBe(true)
    expect(worker.hp).toBe(before)
    expect(worker.fatigueDebt).toBeGreaterThan(0)
    expect(worker.fatigueDebt).toBeLessThan(1)
    expect(workerWearHp(worker)).toBeLessThan(worker.hp)
    expect(hpBarFill(workerWearHp(worker), worker.hpMax)).toBeLessThan(1)
    expect(hpBarTone(workerWearHp(worker), worker.hpMax)).toBe('mid')

    worker.hp = Math.ceil(worker.hpMax * 0.2)
    worker.fatigueDebt = 0
    expect(completeCycle(save, 'mining')).toBe(true)
    expect(worker.assignment).toBe('mining')
    expect(worker.hp).toBeGreaterThan(0)
  })

  it('does not add fatigue on stall, hazard, or soft fail unless a wear affix says so', () => {
    const idle = roster(1)
    assignWorker(idle, idle.workers[0].id, 'cooking')
    const idleHp = idle.workers[0].hp
    const stalled = ticks(idle, 28)
    expect(stalled.stations.cooking.completed).toBe(0)
    expect(stalled.workers[0].hp).toBe(idleHp)
    expect(stalled.workers[0].fatigueDebt).toBe(0)

    setRollOverride(() => 0)
    const hazard = roster(1)
    assignWorker(hazard, hazard.workers[0].id, 'hunting')
    pinStationWear(hazard, 'hunting', [])
    const hazardHp = hazard.workers[0].hp
    expect(completeCycle(hazard, 'hunting')).toBe(true)
    expect(hazard.stations.hunting.gatherNotice).toContain('遇险')
    expect(hazard.workers[0].hp).toBe(hazardHp)
    expect(hazard.workers[0].fatigueDebt).toBe(0)

    const fail = roster(1)
    fail.bank.wildCrystal = 2
    assignWorker(fail, fail.workers[0].id, 'inscription')
    pinStationWear(fail, 'inscription', [])
    const failHp = fail.workers[0].hp
    expect(completeCycle(fail, 'inscription')).toBe(true)
    expect(fail.stations.inscription.craftNotice).toContain('软失败')
    expect(fail.workers[0].hp).toBe(failHp)
    expect(fail.workers[0].fatigueDebt).toBe(0)
  })

  it('does not use food to cut workshop drain; empty/wounded bands slow the station', () => {
    const t0 = 8_000_000
    const slow = roster(1)
    assignWorker(slow, slow.workers[0].id, 'mining')
    const full = currentSpeed(slow, 'mining', t0)
    slow.workers[0].hpMax = 100
    slow.workers[0].hp = 20
    expect(currentSpeed(slow, 'mining', t0)).toBeCloseTo(full * WORKSHOP_WOUNDED_WORK_MUL)
    slow.workers[0].hp = 1
    expect(currentSpeed(slow, 'mining', t0)).toBeCloseTo(full * WORKSHOP_EMPTY_WORK_MUL)
  })

  it('adds fatigue to each assigned worker on that station only', () => {
    const save = roster(3)
    assignWorker(save, save.workers[0].id, 'mining')
    expect(assignWorker(save, save.workers[1].id, 'mining').ok).toBe(false)
    assignWorker(save, save.workers[2].id, 'herbalism')
    pinStationWear(save, 'mining', ['dot'])
    pinStationWear(save, 'herbalism', ['dot'])
    expect(completeCycle(save, 'mining')).toBe(true)
    expect(save.workers[0].fatigueDebt).toBeGreaterThan(0)
    expect(save.workers[1].fatigueDebt).toBe(0)
    expect(save.workers[2].fatigueDebt).toBe(0)
    expect(completeCycle(save, 'herbalism')).toBe(true)
    expect(save.workers[2].fatigueDebt).toBeGreaterThan(0)
  })

  it('uses the worse assigned HP mul on a station card', () => {
    expect(stationHpWorkMul(keepStationsOpen(createSave()), 'mining')).toBe(1)
    const save = roster(2)
    assignWorker(save, save.workers[0].id, 'mining')
    expect(assignWorker(save, save.workers[1].id, 'mining').ok).toBe(false)
    save.workers[0].hpMax = 100
    save.workers[0].hp = 20
    save.workers[1].hpMax = 100
    save.workers[1].hp = 1
    expect(stationHpWorkMul(save, 'mining')).toBe(WORKSHOP_WOUNDED_WORK_MUL)
    expect(stationHpEfficiencyLabel(stationHpWorkMul(save, 'mining'))).toBe('效率 80%')
    save.workers[0].hp = 1
    expect(stationHpWorkMul(save, 'mining')).toBe(WORKSHOP_EMPTY_WORK_MUL)
    expect(stationHpEfficiencyLabel(stationHpWorkMul(save, 'mining'))).toBe('效率 50%')
    expect(stationHpWorkMul(save, 'herbalism')).toBe(1)
  })

  it('shows the HP efficiency tip once when on-duty work first drops below 100%', () => {
    const save = roster(1)
    assignWorker(save, save.workers[0].id, 'mining')
    expect(save.workshopHpEfficiencyTipShown).toBe(false)
    expect(takeWorkshopHpEfficiencyTip(save)).toBeNull()
    save.workers[0].hpMax = 100
    save.workers[0].hp = 20
    expect(takeWorkshopHpEfficiencyTip(save)).toBe(WORKSHOP_HP_EFFICIENCY_TIP)
    expect(save.workshopHpEfficiencyTipShown).toBe(true)
    expect(takeWorkshopHpEfficiencyTip(save)).toBeNull()
    save.workers[0].hp = 1
    expect(takeWorkshopHpEfficiencyTip(save)).toBeNull()
  })

  it('marks weak at wounded HP and rest-heals max(1, floor(hpMax * 0.05))', () => {
    expect(restHealAmount(24)).toBe(1)
    expect(restHealAmount(100)).toBe(5)
    const save = roster(1)
    const worker = save.workers[0]
    assignWorker(save, worker.id, 'mining')
    worker.hpMax = 100
    worker.hp = 20
    expect(workshopHpWorkMul(worker)).toBe(WORKSHOP_WOUNDED_WORK_MUL)
    expect(stationHpWorkMul(save, 'mining')).toBe(WORKSHOP_WOUNDED_WORK_MUL)

    const rest = roster(1)
    rest.workers[0].hpMax = 100
    rest.workers[0].hp = 10
    rest.elapsedS = REST_HEAL_EVERY_S
    applyRestHeal(rest)
    expect(rest.workers[0].hp).toBe(15)
  })

  it('does not auto-eat from the bank while an assigned worker stays wounded', () => {
    const t0 = 9_000_000
    const save = roster(1)
    const worker = save.workers[0]
    assignWorker(save, worker.id, 'mining')
    save.bank.meal = 2
    save.restFoodId = 'meal'
    worker.hpMax = 100
    worker.hp = 20
    pinStationWear(save, 'mining', [])
    expect(completeCycle(save, 'mining', t0)).toBe(true)
    expect(worker.hp).toBe(20)
    expect(worker.assignment).toBe('mining')
    expect(save.bank.meal).toBe(2)
  })
})

describe('visible workshop drain', () => {
  it('returns after one auto round so camp rest can clear fractional fatigue', () => {
    for (const stationId of ['mining', 'herbalism'] as const) {
      const save = roster(1)
      const worker = save.workers[0]
      assignWorker(save, worker.id, stationId)
      save.stations[stationId].auto = true
      pinStationWear(save, stationId, ['dot'])
      const startHp = worker.hp
      expect(startHp).toBe(worker.hpMax)

      const afterOne = ticks(save, 20)
      expect(afterOne.stations[stationId].completed).toBeGreaterThanOrEqual(1)
      expect(afterOne.workers[0].hp).toBe(startHp)
      expect(afterOne.workers[0].fatigueDebt).toBe(0)
      expect(afterOne.workers[0].assignment).toBeNull()

      const again = ticks(afterOne, 20)
      expect(again.stations[stationId].completed).toBeGreaterThan(afterOne.stations[stationId].completed)
      expect(again.workers[0].hp).toBe(startHp)
    }
  })
})

describe('workshop full hp', () => {
  it('is full at or above hpMax only when fatigue debt is zero', () => {
    const save = roster(1)
    const worker = save.workers[0]
    worker.fatigueDebt = 0
    worker.hp = worker.hpMax
    expect(isFullWorkshopHp(worker)).toBe(true)
    worker.hp = worker.hpMax + 3
    expect(isFullWorkshopHp(worker)).toBe(true)
    worker.hp = worker.hpMax
    worker.fatigueDebt = 0.2
    expect(isFullWorkshopHp(worker)).toBe(false)
    worker.fatigueDebt = 0
    worker.hp = worker.hpMax - 1
    expect(isFullWorkshopHp(worker)).toBe(false)
  })
})

describe('workshop death', () => {
  it('returns a worker at 0 HP to rest with bandage and auto-eat, without a march', () => {
    const save = roster(1)
    const worker = save.workers[0]
    expect(assignWorker(save, worker.id, 'mining').ok).toBe(true)
    worker.hpMax = 20
    worker.hp = 1
    worker.fatigueDebt = 1
    save.techLevels = { rematchSupply: 1 }
    save.unlockedTechIds = ['rematchSupply']
    save.bank.meal = 2
    save.restFoodId = 'meal'
    save.stations.mining.progress = 5
    pinStationWear(save, 'mining', ['dot'])
    stepStation(save, 'mining', 1_000)
    expect(worker.assignment).toBeNull()
    const bandage = campBandageHealAmount(save, worker.hpMax)
    expect(bandage).toBeGreaterThan(0)
    expect(worker.hp).toBeGreaterThan(bandage)
    expect(worker.foodSlot).toBeNull()
    expect(save.bank.meal).toBe(1)
    expect(save.stations.mining.progress).toBe(0)
    expect(save.stations.mining.stallReason).toBeNull()
    const marching = save.encounters.some(
      (enc) => enc.kind === 'enemy' && enc.combat?.returning?.some((row) => row.id === worker.id),
    )
    expect(marching).toBe(false)
  })
})

