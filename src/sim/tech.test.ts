import { afterEach, describe, expect, it } from 'vitest'
import { assignWorker } from './assign'
import { createSave } from './createSave'
import { exploreCost } from './encounters'
import { fuseWorkers } from './fuse'
import { currentSpeed } from './query'
import { recruitWorker, spawnWorker } from './recruit'
import { setRollOverride } from './rng'
import { completeCycle } from './stations'
import {
  CYCLE_TECH_POINTS,
  TECH_TREE,
  applyTechEffects,
  fuseStayAssigned,
  grantTechPoint,
  hasTech,
  hydrateTechFields,
  hydrateUnlockedTechIds,
  nextTech,
  normalizeTechPoints,
  offlineCapHours,
  offlineCapS,
  recruitCost,
  researchNextTech,
  researchTech,
  resonanceBonusEvery,
  resonanceSpeedMul,
  stationTechSpeedMul,
  techEffectValue,
} from './tech'
import { OFFLINE_CAP_S, RECRUIT_COST, RESONANCE_BONUS_EVERY, RESONANCE_SPEED_MUL } from './tables'
import { ticks } from './tick'
import type { Save } from './types'

afterEach(() => {
  setRollOverride(null)
})

describe('tech tree table', () => {
  it('is a linear 8–10 tier list with Chinese labels and costs', () => {
    expect(TECH_TREE.length).toBeGreaterThanOrEqual(8)
    expect(TECH_TREE.length).toBeLessThanOrEqual(10)
    expect(TECH_TREE[0].id).toBe('workshopLog')
    expect(TECH_TREE[0].name).toBe('工坊日志')
    expect(TECH_TREE.at(-1)?.id).toBe('knightCrest')
    expect(TECH_TREE.at(-1)?.name).toBe('骑士工坊纹章')
    const ids = TECH_TREE.map((node) => node.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(TECH_TREE.every((node) => node.cost > 0 && node.desc && node.effectId)).toBe(true)
  })
})

describe('hydrate tech fields', () => {
  it('fills missing or dirty points and drops skipped / unknown ids', () => {
    expect(normalizeTechPoints(undefined)).toBe(0)
    expect(normalizeTechPoints(-4)).toBe(0)
    expect(normalizeTechPoints(3.8)).toBe(3)
    expect(hydrateUnlockedTechIds(undefined)).toEqual([])
    expect(hydrateUnlockedTechIds(['workshopLog', 'notATech', 'artisanManual'])).toEqual(['workshopLog'])
    expect(hydrateUnlockedTechIds(['apprenticeNotes'])).toEqual([])
    expect(hydrateUnlockedTechIds(['workshopLog', 'apprenticeNotes'])).toEqual([
      'workshopLog',
      'apprenticeNotes',
    ])

    const save = createSave()
    delete (save as { techPoints?: number }).techPoints
    delete (save as { unlockedTechIds?: Save['unlockedTechIds'] }).unlockedTechIds
    hydrateTechFields(save as Save)
    expect(save.techPoints).toBe(0)
    expect(save.unlockedTechIds).toEqual([])
  })

  it('reads inspiration as a techPoints alias', () => {
    const save = createSave()
    delete (save as { techPoints?: number }).techPoints
    const aliased = save as Save & { inspiration: number }
    aliased.inspiration = 7.6
    hydrateTechFields(aliased)
    expect(aliased.techPoints).toBe(7)
  })
})

describe('inspiration grant', () => {
  it('adds a point from grantTechPoint', () => {
    const save = createSave()
    grantTechPoint(save, 'mining')
    grantTechPoint(save, 'forging')
    expect(save.techPoints).toBe(1 + 2 * CYCLE_TECH_POINTS)
  })

  it('gives +1 inspiration when any station finishes a cycle', () => {
    const mine = createSave()
    spawnWorker(mine)
    assignWorker(mine, mine.workers[0].id, 'mining')
    const mined = ticks(mine, 20)
    expect(mined.stations.mining.completed).toBe(1)
    expect(mined.techPoints).toBe(1 + CYCLE_TECH_POINTS)

    setRollOverride(() => 0.99)
    const forge = createSave()
    spawnWorker(forge)
    assignWorker(forge, forge.workers[0].id, 'forging')
    forge.bank.ore = 1
    const forged = ticks(forge, 32)
    expect(forged.stations.forging.completed).toBe(1)
    expect(forged.techPoints).toBe(1 + CYCLE_TECH_POINTS)
  })

  it('still grants a point on a forging soft-fail cycle', () => {
    setRollOverride(() => 0)
    const save = createSave()
    spawnWorker(save)
    assignWorker(save, save.workers[0].id, 'forging')
    save.bank.ore = 1
    expect(completeCycle(save, 'forging')).toBe(true)
    expect(save.stations.forging.craftNotice).toContain('软失败')
    expect(save.techPoints).toBe(1 + CYCLE_TECH_POINTS)
  })
})

describe('research unlock', () => {
  it('spends inspiration and unlocks the next tier in order', () => {
    const save = createSave()
    expect(nextTech(save)?.id).toBe('workshopLog')
    save.techPoints = 3
    expect(researchNextTech(save)).toEqual({ ok: true, message: '已点亮「工坊日志」' })
    expect(save.techPoints).toBe(2)
    expect(save.unlockedTechIds).toEqual(['workshopLog'])
    expect(hasTech(save, 'workshopLog')).toBe(true)

    expect(researchTech(save, 'apprenticeNotes')).toEqual({ ok: true, message: '已点亮「学徒笔记」' })
    expect(save.techPoints).toBe(0)
    expect(save.unlockedTechIds).toEqual(['workshopLog', 'apprenticeNotes'])
  })

  it('fails when inspiration is not enough', () => {
    const save = createSave()
    save.techPoints = 0
    expect(researchNextTech(save)).toEqual({ ok: false, reason: '灵感不足' })
    expect(save.unlockedTechIds).toEqual([])
    expect(save.techPoints).toBe(0)
  })

  it('rejects out-of-order research', () => {
    const save = createSave()
    save.techPoints = 99
    expect(researchTech(save, 'knightCrest')).toEqual({ ok: false, reason: '需按序研究' })
    expect(save.unlockedTechIds).toEqual([])
    expect(save.techPoints).toBe(99)
  })

  it('fails when the tree is already full', () => {
    const save = createSave()
    save.techPoints = 999
    save.unlockedTechIds = TECH_TREE.map((node) => node.id)
    expect(researchNextTech(save)).toEqual({ ok: false, reason: '科技树已满' })
    expect(save.techPoints).toBe(999)
  })
})

describe('tech effects stay no-op', () => {
  it('does not change recruit / offline / explore / speed / merge', () => {
    const save = createSave()
    save.unlockedTechIds = TECH_TREE.map((node) => node.id)
    applyTechEffects(save)
    expect(techEffectValue(save, 'workshopLog')).toBe(0)
    expect(recruitCost(save)).toBe(RECRUIT_COST)
    expect(offlineCapS(save)).toBe(OFFLINE_CAP_S)
    expect(offlineCapHours(save)).toBe(8)
    expect(exploreCost(save)).toBe(8)
    expect(resonanceSpeedMul(save)).toBe(RESONANCE_SPEED_MUL)
    expect(resonanceBonusEvery(save)).toBe(RESONANCE_BONUS_EVERY)
    expect(stationTechSpeedMul(save, 'cooking')).toBe(1)
    expect(fuseStayAssigned(save)).toBe(false)

    spawnWorker(save)
    assignWorker(save, save.workers[0].id, 'cooking')
    const withTech = currentSpeed(save, 'cooking')
    const bare = createSave()
    spawnWorker(bare)
    assignWorker(bare, bare.workers[0].id, 'cooking')
    expect(withTech).toBeCloseTo(currentSpeed(bare, 'cooking'))

    expect(recruitWorker(save).ok).toBe(true)

    const merge = createSave()
    const a = spawnWorker(merge)
    const b = spawnWorker(merge)
    assignWorker(merge, a.id, 'mining')
    assignWorker(merge, b.id, 'mining')
    merge.unlockedTechIds = TECH_TREE.map((node) => node.id)
    expect(fuseWorkers(merge, a.id, b.id).ok).toBe(true)
    expect(merge.workers[0].assignment).toBeNull()
  })
})
