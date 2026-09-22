import { afterEach, describe, expect, it } from 'vitest'
import { assignWorker } from './assign'
import { applyRestHeal, REST_HEAL_EVERY_S } from './combat'
import { createSave } from './createSave'
import { loadFood } from './food'
import { currentSpeed } from './query'
import { recruitWorker } from './recruit'
import { setRollOverride } from './rng'
import { completeCycle } from './stations'
import { ticks } from './tick'
import type { Save, Worker } from './types'
import { hpBarFill, hpBarTone } from '../ui/hpBar'
import {
  applyWorkshopCycleDrain,
  equivalentCyclesIn,
  FATIGUE_DEBT_RATIO,
  FATIGUE_NEAR_FULL_PIP,
  FATIGUE_SIX_HOUR_S,
  FATIGUE_STATION_MUL,
  HP_EMPTY_RATIO,
  HP_WOUNDED_RATIO,
  restHealAmount,
  stationHpEfficiencyLabel,
  stationHpWorkMul,
  takeWorkshopHpEfficiencyTip,
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
  const save = createSave()
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
  it('locks HP at 1 and scales work by empty / wounded / normal bands', () => {
    expect(HP_EMPTY_RATIO).toBe(0.01)
    expect(HP_WOUNDED_RATIO).toBe(0.3)
    expect(workshopHpWorkMul(stubWorker(1, 100))).toBe(WORKSHOP_EMPTY_WORK_MUL)
    expect(workshopHpWorkMul(stubWorker(2, 100))).toBe(WORKSHOP_WOUNDED_WORK_MUL)
    expect(workshopHpWorkMul(stubWorker(30, 100))).toBe(WORKSHOP_WOUNDED_WORK_MUL)
    expect(workshopHpWorkMul(stubWorker(31, 100))).toBe(1)
    expect(workshopHpWorkMul(stubWorker(26, 26))).toBe(1)
    expect(stationHpEfficiencyLabel(1)).toBe('效率 100%')
    expect(stationHpEfficiencyLabel(WORKSHOP_WOUNDED_WORK_MUL)).toBe('效率 80%')
    expect(stationHpEfficiencyLabel(WORKSHOP_EMPTY_WORK_MUL)).toBe('效率 50%')

    const save = roster(1)
    const worker = save.workers[0]
    assignWorker(save, worker.id, 'mining')
    const before = worker.hp
    expect(completeCycle(save, 'mining')).toBe(true)
    expect(worker.hp).toBe(before)
    expect(worker.fatigueDebt).toBeGreaterThan(0)
    expect(worker.fatigueDebt).toBeLessThan(1)
    expect(workerWearHp(worker)).toBeLessThan(worker.hp)
    expect(hpBarFill(workerWearHp(worker), worker.hpMax)).toBeLessThan(1)
    expect(hpBarTone(workerWearHp(worker), worker.hpMax)).toBe('mid')

    worker.hp = 1
    worker.fatigueDebt = 0
    expect(completeCycle(save, 'mining')).toBe(true)
    expect(worker.hp).toBe(1)
    expect(worker.assignment).toBe('mining')
  })

  it('does not add fatigue on stall; hazard and soft fail add light debt only', () => {
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
    const hazardHp = hazard.workers[0].hp
    expect(completeCycle(hazard, 'hunting')).toBe(true)
    expect(hazard.stations.hunting.gatherNotice).toContain('遇险')
    expect(hazard.workers[0].hp).toBe(hazardHp)
    expect(hazard.workers[0].fatigueDebt).toBeGreaterThan(0)
    expect(hazard.workers[0].fatigueDebt).toBeLessThan(1)

    const fail = roster(1)
    fail.bank.wildCrystal = 2
    assignWorker(fail, fail.workers[0].id, 'inscription')
    const failHp = fail.workers[0].hp
    expect(completeCycle(fail, 'inscription')).toBe(true)
    expect(fail.stations.inscription.craftNotice).toContain('软失败')
    expect(fail.workers[0].hp).toBe(failHp)
    expect(fail.workers[0].fatigueDebt).toBeGreaterThan(0)
    expect(fail.workers[0].fatigueDebt).toBeLessThan(1)
    expect(fail.stations.inscription.fatigueCombo.frustration).toBe(1)
  })

  it('does not use food to cut workshop drain; empty/wounded bands slow the station', () => {
    const t0 = 8_000_000
    const save = roster(1)
    save.bank.meal = 1
    expect(loadFood(save, save.workers[0].id, 'meal', 1, t0).ok).toBe(true)

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
    assignWorker(save, save.workers[1].id, 'mining')
    assignWorker(save, save.workers[2].id, 'herbalism')
    expect(completeCycle(save, 'mining')).toBe(true)
    expect(save.workers[0].fatigueDebt).toBeGreaterThan(0)
    expect(save.workers[1].fatigueDebt).toBeGreaterThan(0)
    expect(save.workers[2].fatigueDebt).toBe(0)
    expect(completeCycle(save, 'herbalism')).toBe(true)
    expect(save.workers[2].fatigueDebt).toBeGreaterThan(0)
  })

  it('uses the worse assigned HP mul on a station card', () => {
    expect(stationHpWorkMul(createSave(), 'mining')).toBe(1)
    const save = roster(2)
    assignWorker(save, save.workers[0].id, 'mining')
    assignWorker(save, save.workers[1].id, 'mining')
    save.workers[0].hpMax = 100
    save.workers[0].hp = 31
    save.workers[1].hpMax = 100
    save.workers[1].hp = 20
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
    expect(applyWorkshopCycleDrain(save, 'mining', 0)).toBe(true)

    const rest = roster(1)
    rest.workers[0].hpMax = 100
    rest.workers[0].hp = 10
    rest.elapsedS = REST_HEAL_EVERY_S
    applyRestHeal(rest)
    expect(rest.workers[0].hp).toBe(15)
  })

  it('auto-eats one leftover after a cycle when an assigned worker is wounded', () => {
    const t0 = 9_000_000
    const save = roster(1)
    const worker = save.workers[0]
    assignWorker(save, worker.id, 'mining')
    save.bank.meal = 2
    expect(loadFood(save, worker.id, 'meal', 2, t0).ok).toBe(true)
    worker.hpMax = 100
    worker.hp = 20
    expect(worker.foodSlot?.qty).toBe(1)
    expect(completeCycle(save, 'mining', t0)).toBe(true)
    expect(worker.hp).toBe(20 + Math.ceil(100 * 0.25))
    expect(worker.foodSlot?.qty).toBe(0)
  })
})

describe('station fatigue combos', () => {
  it('slowly stacks herbalism weariness on consecutive success', () => {
    const save = roster(1)
    assignWorker(save, save.workers[0].id, 'herbalism')
    expect(completeCycle(save, 'herbalism')).toBe(true)
    const first = save.workers[0].fatigueDebt
    expect(completeCycle(save, 'herbalism')).toBe(true)
    expect(save.stations.herbalism.fatigueCombo.streak).toBe(2)
    expect(save.workers[0].fatigueDebt).toBeGreaterThan(first * 1.5)
  })

  it('resets cooking combo when the dish changes and weights stew heavier', () => {
    const save = roster(1)
    save.stations.cooking.stationLevel = 5
    save.stations.cooking.unlockedCategories = ['copper', 'iron', 'mithril']
    save.stations.cooking.selectedCategory = 'copper'
    save.bank.fish = 2
    save.bank.meat = 1
    save.bank.spice = 1
    assignWorker(save, save.workers[0].id, 'cooking')
    expect(completeCycle(save, 'cooking')).toBe(true)
    expect(completeCycle(save, 'cooking')).toBe(true)
    expect(save.stations.cooking.fatigueCombo.streak).toBe(2)
    expect(save.stations.cooking.fatigueCombo.key).toBe('copper')

    save.stations.cooking.selectedCategory = 'mithril'
    const before = save.workers[0].fatigueDebt
    expect(completeCycle(save, 'cooking')).toBe(true)
    expect(save.stations.cooking.fatigueCombo.streak).toBe(1)
    expect(save.stations.cooking.fatigueCombo.key).toBe('mithril')
    const stewAdd = save.workers[0].fatigueDebt - before
    expect(stewAdd).toBeGreaterThan(save.workers[0].hpMax * FATIGUE_DEBT_RATIO * FATIGUE_STATION_MUL.cooking)
  })

  it('raises mining depth fatigue and adds an extra bite when the node empties', () => {
    const save = roster(1)
    assignWorker(save, save.workers[0].id, 'mining')
    const node = save.stations.mining.miningNode
    expect(node).toBeTruthy()
    node!.nodeHp = 1
    const before = save.workers[0].fatigueDebt
    expect(completeCycle(save, 'mining')).toBe(true)
    expect(save.stations.mining.miningNode?.nodeHp).toBe(0)
    expect(save.workers[0].fatigueDebt - before).toBeGreaterThan(
      save.workers[0].hpMax * FATIGUE_DEBT_RATIO * FATIGUE_STATION_MUL.mining,
    )
  })

  it('liquidates inscription frustration on the next success', () => {
    const save = roster(1)
    save.bank.wildCrystal = 4
    assignWorker(save, save.workers[0].id, 'inscription')
    save.stations.inscription.fatigueCombo.frustration = 3
    const before = save.workers[0].fatigueDebt
    setRollOverride(() => 0.99)
    expect(completeCycle(save, 'inscription')).toBe(true)
    expect(save.stations.inscription.craftNotice).toContain('铭成')
    expect(save.workers[0].fatigueDebt - before).toBeGreaterThan(
      save.workers[0].hpMax * FATIGUE_DEBT_RATIO * FATIGUE_STATION_MUL.inscription * 1.2,
    )
    expect(save.stations.inscription.fatigueCombo.frustration).toBe(0)
  })

  it('stacks alchemy fog on success and decays when the station is idle', () => {
    const save = roster(1)
    save.bank.herb = 2
    assignWorker(save, save.workers[0].id, 'alchemy')
    expect(completeCycle(save, 'alchemy')).toBe(true)
    expect(save.stations.alchemy.fatigueCombo.fog).toBe(1)
    const fogged = save.workers[0].fatigueDebt
    expect(completeCycle(save, 'alchemy')).toBe(true)
    expect(save.stations.alchemy.fatigueCombo.fog).toBe(2)
    expect(save.workers[0].fatigueDebt).toBeGreaterThan(fogged * 1.4)

    save.workers[0].assignment = null
    const fog = save.stations.alchemy.fatigueCombo.fog
    const idle = ticks(save, 8)
    expect(idle.stations.alchemy.fatigueCombo.fog).toBeLessThan(fog)
  })
})

describe('visible workshop drain', () => {
  it('accumulates debt then drops HP when mining or gathering herbs', () => {
    for (const stationId of ['mining', 'herbalism'] as const) {
      const save = roster(1)
      const worker = save.workers[0]
      assignWorker(save, worker.id, stationId)
      const startHp = worker.hp
      expect(startHp).toBe(worker.hpMax)

      const afterOne = ticks(save, 20)
      expect(afterOne.stations[stationId].completed).toBeGreaterThanOrEqual(1)
      expect(afterOne.workers[0].hp).toBe(startHp)
      expect(afterOne.workers[0].fatigueDebt).toBeGreaterThan(0)
      expect(workerWearHp(afterOne.workers[0])).toBeLessThan(startHp)
      expect(hpBarTone(workerWearHp(afterOne.workers[0]), afterOne.workers[0].hpMax)).toBe('mid')

      const worn = ticks(save, 20 * 18)
      expect(worn.stations[stationId].completed).toBeGreaterThanOrEqual(12)
      expect(worn.workers[0].hp).toBeLessThan(startHp)
      expect(worn.workers[0].hp).toBeGreaterThanOrEqual(startHp - 2)
    }
  })
})

describe('6h equivalent production', () => {
  it('keeps a naked solo worker at HP>=2 after 6h herbalism output', () => {
    const save = roster(1)
    const worker = save.workers[0]
    assignWorker(save, worker.id, 'herbalism')
    expect(save.potionBuffs.stimUntil).toBeNull()
    const cycles = equivalentCyclesIn(FATIGUE_SIX_HOUR_S, 20)
    expect(cycles).toBe(1080)
    for (let i = 0; i < cycles; i++) expect(completeCycle(save, 'herbalism')).toBe(true)
    expect(worker.hp).toBeGreaterThanOrEqual(2)
    expect(worker.hp).toBeLessThan(worker.hpMax)
    expect(FATIGUE_DEBT_RATIO).toBe(0.0015)
  })
})

