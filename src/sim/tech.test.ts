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
  ENCOUNTER_SLOT_EFFECT,
  ENCOUNTER_SLOT_MAX,
  ENCOUNTER_SLOT_MIN,
  ENCOUNTER_SLOT_TECH_IDS,
  TECH_STAGES,
  TECH_TREE,
  applyTechEffects,
  encounterSlotCount,
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
  STATION_CONFLICT_BASE_MUL,
  STATION_CONFLICT_CLEARED_MUL,
  STATION_CONFLICT_RULES_MUL,
  stationConflictHint,
  stationConflictMul,
  stationTechSpeedMul,
  techEffectValue,
  techStage,
} from './tech'
import { OFFLINE_CAP_S, RECRUIT_COST } from './tables'
import { ticks } from './tick'
import type { Save } from './types'

afterEach(() => {
  setRollOverride(null)
})

function lightStage(save: Save, stage: number) {
  const def = techStage(stage)
  expect(def).toBeTruthy()
  if (!def) return
  save.techPoints = 999
  for (const minor of def.minors) {
    expect(researchTech(save, minor.id).ok).toBe(true)
  }
  expect(researchTech(save, def.major.id)).toEqual({ ok: true, message: `已点亮「${def.major.name}」` })
}

describe('tech stage table', () => {
  it('is a stage tree with many placeholder nodes and five slot majors', () => {
    expect(TECH_STAGES.length).toBeGreaterThanOrEqual(16)
    expect(TECH_TREE.length).toBe(TECH_STAGES.length * 4)
    expect(TECH_STAGES.every((stage) => stage.minors.length === 3 && stage.major.kind === 'major')).toBe(true)
    expect(new Set(TECH_TREE.map((node) => node.id)).size).toBe(TECH_TREE.length)
    expect(TECH_TREE.every((node) => node.cost > 0 && node.desc && node.effectId && node.stage >= 1)).toBe(true)
    expect(ENCOUNTER_SLOT_TECH_IDS).toEqual([
      'pathOutpost',
      'marketLicense',
      'scoutRelay',
      'farWatch',
      'caravanPermit',
    ])
    expect(TECH_STAGES[0].major.name).toBe('探路哨岗')
    expect(TECH_STAGES[1].major.name).toBe('市集执照')
    expect(TECH_STAGES[2].major.name).toBe('斥候驿站')
    expect(TECH_STAGES[3].major.name).toBe('远望烽台')
    expect(TECH_STAGES[4].major.name).toBe('商队路引')
    expect(TECH_TREE.filter((node) => node.effectId === ENCOUNTER_SLOT_EFFECT)).toHaveLength(5)
  })
})

describe('hydrate tech fields', () => {
  it('keeps known old ids, drops junk, and does not require left-to-right minors', () => {
    expect(normalizeTechPoints(undefined)).toBe(0)
    expect(normalizeTechPoints(-4)).toBe(0)
    expect(normalizeTechPoints(3.8)).toBe(3)
    expect(hydrateUnlockedTechIds(undefined)).toEqual([])
    expect(hydrateUnlockedTechIds(['workshopLog', 'notATech', 'artisanManual'])).toEqual([
      'workshopLog',
      'artisanManual',
    ])
    expect(hydrateUnlockedTechIds(['apprenticeNotes'])).toEqual(['apprenticeNotes'])
    expect(hydrateUnlockedTechIds(['workshopLog', 'apprenticeNotes'])).toEqual([
      'workshopLog',
      'apprenticeNotes',
    ])
    expect(hydrateUnlockedTechIds(['pathOutpost'])).toEqual([])
    expect(
      hydrateUnlockedTechIds(['workshopLog', 'apprenticeNotes', 'artisanManual', 'pathOutpost']),
    ).toEqual(['workshopLog', 'apprenticeNotes', 'artisanManual', 'pathOutpost'])

    const save = createSave()
    delete (save as { techPoints?: number }).techPoints
    delete (save as { unlockedTechIds?: Save['unlockedTechIds'] }).unlockedTechIds
    hydrateTechFields(save as Save)
    expect(save.techPoints).toBe(0)
    expect(save.unlockedTechIds).toEqual([])
  })

  it('reads inspiration as a techPoints alias and keeps points when clearing old linear progress', () => {
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
  it('lets stage minors light in any order and spends inspiration', () => {
    const save = createSave()
    expect(nextTech(save)?.id).toBe('workshopLog')
    save.techPoints = 6
    expect(researchTech(save, 'artisanManual')).toEqual({ ok: true, message: '已点亮「匠人手册」' })
    expect(researchTech(save, 'workshopLog')).toEqual({ ok: true, message: '已点亮「工坊日志」' })
    expect(save.techPoints).toBe(2)
    expect(hasTech(save, 'workshopLog')).toBe(true)
    expect(hasTech(save, 'artisanManual')).toBe(true)
    expect(researchTech(save, 'apprenticeNotes')).toEqual({ ok: true, message: '已点亮「学徒笔记」' })
    expect(save.techPoints).toBe(0)
  })

  it('fails when inspiration is not enough', () => {
    const save = createSave()
    save.techPoints = 0
    expect(researchNextTech(save)).toEqual({ ok: false, reason: '灵感不足' })
    expect(save.unlockedTechIds).toEqual([])
    expect(save.techPoints).toBe(0)
  })

  it('rejects a major before all minors in the stage are lit', () => {
    const save = createSave()
    save.techPoints = 99
    expect(researchTech(save, 'pathOutpost')).toEqual({ ok: false, reason: '需先点亮本阶段小点' })
    expect(save.unlockedTechIds).toEqual([])
    expect(encounterSlotCount(save)).toBe(ENCOUNTER_SLOT_MIN)
    expect(researchTech(save, 'workshopLog').ok).toBe(true)
    expect(researchTech(save, 'pathOutpost')).toEqual({ ok: false, reason: '需先点亮本阶段小点' })
  })

  it('rejects a later stage before the previous major', () => {
    const save = createSave()
    save.techPoints = 99
    expect(researchTech(save, 'workshopRules')).toEqual({ ok: false, reason: '需先点亮上一阶段大科技' })
  })

  it('fails when the tree is already full', () => {
    const save = createSave()
    save.techPoints = 999
    save.unlockedTechIds = TECH_TREE.map((node) => node.id)
    expect(researchNextTech(save)).toEqual({ ok: false, reason: '科技树已满' })
    expect(save.techPoints).toBe(999)
  })
})

describe('encounterSlotCount', () => {
  it('starts at 1, grows after a finished stage major, and caps at 6', () => {
    const save = createSave()
    expect(encounterSlotCount(save)).toBe(1)
    expect(save.encounters).toHaveLength(1)

    lightStage(save, 1)
    expect(encounterSlotCount(save)).toBe(2)
    expect(save.encounters).toHaveLength(2)

    lightStage(save, 2)
    expect(encounterSlotCount(save)).toBe(3)
    lightStage(save, 3)
    expect(encounterSlotCount(save)).toBe(4)
    lightStage(save, 4)
    expect(encounterSlotCount(save)).toBe(5)
    lightStage(save, 5)
    expect(encounterSlotCount(save)).toBe(6)
    expect(save.encounters).toHaveLength(6)

    lightStage(save, 6)
    expect(encounterSlotCount(save)).toBe(ENCOUNTER_SLOT_MAX)
    expect(save.encounters).toHaveLength(6)
  })
})

describe('tech effects stay no-op', () => {
  it('does not change recruit / offline / explore / one-worker speed / merge', () => {
    const save = createSave()
    save.unlockedTechIds = TECH_TREE.map((node) => node.id)
    applyTechEffects(save)
    expect(techEffectValue(save, 'workshopLog')).toBe(0)
    expect(recruitCost(save)).toBe(RECRUIT_COST)
    expect(offlineCapS(save)).toBe(OFFLINE_CAP_S)
    expect(offlineCapHours(save)).toBe(8)
    expect(exploreCost(save)).toBe(8)
    expect(stationTechSpeedMul(save, 'cooking')).toBe(1)
    expect(fuseStayAssigned(save)).toBe(true)

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
    expect(merge.workers[0].assignment).toBe('mining')
  })
})

describe('station conflict', () => {
  it('halves two-worker speed before conflict techs', () => {
    const two = createSave()
    spawnWorker(two)
    spawnWorker(two)
    assignWorker(two, two.workers[0].id, 'mining')
    assignWorker(two, two.workers[1].id, 'mining')
    const one = createSave()
    spawnWorker(one)
    assignWorker(one, one.workers[0].id, 'mining')
    const noConflictTwo = currentSpeed(one, 'mining') * 2

    expect(stationConflictMul(two, 'mining')).toBe(STATION_CONFLICT_BASE_MUL)
    expect(currentSpeed(two, 'mining')).toBeCloseTo(noConflictTwo * 0.5)
    expect(currentSpeed(two, 'mining')).toBeCloseTo(currentSpeed(one, 'mining'))
    expect(stationConflictHint(two, 'mining')).toBe('冲突：效率 −50%')
  })

  it('changes mul after researching workshopRules then artisanArchive', () => {
    const two = createSave()
    spawnWorker(two)
    spawnWorker(two)
    assignWorker(two, two.workers[0].id, 'mining')
    assignWorker(two, two.workers[1].id, 'mining')
    const one = createSave()
    spawnWorker(one)
    assignWorker(one, one.workers[0].id, 'mining')
    const stacked = currentSpeed(one, 'mining') * 2
    two.techPoints = 999

    expect(stationConflictMul(two, 'mining')).toBe(STATION_CONFLICT_BASE_MUL)
    while (!hasTech(two, 'workshopRules')) {
      expect(researchNextTech(two).ok).toBe(true)
    }
    expect(stationConflictMul(two, 'mining')).toBe(STATION_CONFLICT_RULES_MUL)
    expect(currentSpeed(two, 'mining')).toBeCloseTo(stacked * 0.75)
    expect(stationConflictHint(two, 'mining')).toBe('冲突：效率 −25%')

    while (!hasTech(two, 'artisanArchive')) {
      expect(researchNextTech(two).ok).toBe(true)
    }
    expect(stationConflictMul(two, 'mining')).toBe(STATION_CONFLICT_CLEARED_MUL)
    expect(currentSpeed(two, 'mining')).toBeCloseTo(stacked)
    expect(stationConflictHint(two, 'mining')).toBeNull()
  })

  it('does not apply when 0 or 1 worker is assigned', () => {
    const save = createSave()
    expect(stationConflictMul(save, 'mining')).toBe(1)
    expect(stationConflictHint(save, 'mining')).toBeNull()
    spawnWorker(save)
    assignWorker(save, save.workers[0].id, 'mining')
    expect(stationConflictMul(save, 'mining')).toBe(1)
    expect(stationConflictHint(save, 'mining')).toBeNull()
    expect(currentSpeed(save, 'mining')).toBeCloseTo(1 / 20)
  })
})
