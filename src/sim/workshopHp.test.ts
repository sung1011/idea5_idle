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
import {
  applyWorkshopCycleDrain,
  restHealAmount,
  workshopCycleDrainAmount,
  workshopHpWorkMul,
} from './workshopHp'

afterEach(() => {
  setRollOverride(null)
})

function roster(n: number): Save {
  const save = createSave()
  save.gold = 15 * n
  for (let i = 0; i < n; i++) expect(recruitWorker(save).ok).toBe(true)
  return save
}

function stubWorker(hp: number, hpMax: number): Worker {
  return {
    id: 'w-stub',
    qualityTier: 1,
    assignment: 'mining',
    foodSlot: null,
    hp,
    hpMax,
    level: 1,
    xp: 0,
    combatAttrs: [],
  }
}

describe('workshop HP formulas', () => {
  it('drains max(1, floor(hpMax * 0.02)) and locks at 1', () => {
    expect(workshopCycleDrainAmount(stubWorker(24, 24), 0)).toBe(1)
    expect(workshopCycleDrainAmount(stubWorker(100, 100), 0)).toBe(2)
    const save = roster(1)
    const worker = save.workers[0]
    assignWorker(save, worker.id, 'mining')
    const before = worker.hp
    expect(completeCycle(save, 'mining')).toBe(true)
    expect(worker.hp).toBe(before - 1)
    expect(worker.assignment).toBe('mining')

    worker.hp = 1
    expect(completeCycle(save, 'mining')).toBe(true)
    expect(worker.hp).toBe(1)
    expect(worker.assignment).toBe('mining')
  })

  it('does not drain on stall, empty rod, hazard or soft fail', () => {
    const idle = roster(1)
    assignWorker(idle, idle.workers[0].id, 'cooking')
    const idleHp = idle.workers[0].hp
    const stalled = ticks(idle, 28)
    expect(stalled.stations.cooking.completed).toBe(0)
    expect(stalled.workers[0].hp).toBe(idleHp)

    setRollOverride(() => 0)
    const empty = roster(1)
    assignWorker(empty, empty.workers[0].id, 'fishing')
    const emptyHp = empty.workers[0].hp
    expect(completeCycle(empty, 'fishing')).toBe(true)
    expect(empty.stations.fishing.gatherNotice).toBe('空杆')
    expect(empty.workers[0].hp).toBe(emptyHp)

    const hazard = roster(1)
    assignWorker(hazard, hazard.workers[0].id, 'hunting')
    const hazardHp = hazard.workers[0].hp
    expect(completeCycle(hazard, 'hunting')).toBe(true)
    expect(hazard.stations.hunting.gatherNotice).toContain('遇险')
    expect(hazard.workers[0].hp).toBe(hazardHp)

    const fail = roster(1)
    fail.stations.forging.selectedForgeToolId = 'miningTool01'
    fail.bank.ore = 1
    assignWorker(fail, fail.workers[0].id, 'forging')
    const failHp = fail.workers[0].hp
    expect(completeCycle(fail, 'forging')).toBe(true)
    expect(fail.stations.forging.craftNotice).toContain('软失败')
    expect(fail.workers[0].hp).toBe(failHp)
  })

  it('halves drain when food buff is active, and weights speed by HP', () => {
    const t0 = 8_000_000
    const fed = stubWorker(80, 100)
    const save = roster(1)
    save.bank.meal = 1
    expect(loadFood(save, save.workers[0].id, 'meal', 1, t0).ok).toBe(true)
    fed.foodSlot = save.workers[0].foodSlot
    expect(workshopCycleDrainAmount(fed, t0)).toBe(1)
    expect(workshopCycleDrainAmount(stubWorker(80, 100), t0)).toBe(2)

    expect(workshopHpWorkMul(stubWorker(31, 100))).toBe(1)
    expect(workshopHpWorkMul(stubWorker(30, 100))).toBe(0.7)
    expect(workshopHpWorkMul(stubWorker(11, 100))).toBe(0.7)
    expect(workshopHpWorkMul(stubWorker(10, 100))).toBe(0.4)

    const slow = roster(1)
    assignWorker(slow, slow.workers[0].id, 'mining')
    const full = currentSpeed(slow, 'mining', t0)
    slow.workers[0].hp = Math.floor(slow.workers[0].hpMax * 0.2)
    expect(currentSpeed(slow, 'mining', t0)).toBeCloseTo(full * 0.7)
    slow.workers[0].hp = Math.floor(slow.workers[0].hpMax * 0.05)
    expect(currentSpeed(slow, 'mining', t0)).toBeCloseTo(full * 0.4)
  })

  it('drains each assigned worker on that station only', () => {
    const save = roster(3)
    assignWorker(save, save.workers[0].id, 'mining')
    assignWorker(save, save.workers[1].id, 'mining')
    assignWorker(save, save.workers[2].id, 'herbalism')
    const [a, b, c] = save.workers.map((w) => w.hp)
    expect(completeCycle(save, 'mining')).toBe(true)
    expect(save.workers[0].hp).toBe(a - 1)
    expect(save.workers[1].hp).toBe(b - 1)
    expect(save.workers[2].hp).toBe(c)
    expect(completeCycle(save, 'herbalism')).toBe(true)
    expect(save.workers[2].hp).toBe(c - 1)
  })

  it('marks weak before drain and rest-heals max(1, floor(hpMax * 0.05))', () => {
    expect(restHealAmount(24)).toBe(1)
    expect(restHealAmount(100)).toBe(5)
    const save = roster(1)
    const worker = save.workers[0]
    assignWorker(save, worker.id, 'mining')
    worker.hp = Math.floor(worker.hpMax * 0.2)
    expect(applyWorkshopCycleDrain(save, 'mining', 0)).toBe(true)

    const rest = roster(1)
    rest.workers[0].hpMax = 100
    rest.workers[0].hp = 10
    rest.elapsedS = REST_HEAL_EVERY_S
    applyRestHeal(rest)
    expect(rest.workers[0].hp).toBe(15)
  })
})
