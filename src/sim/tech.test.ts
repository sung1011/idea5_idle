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
  IMPLEMENTED_TECH_MAX_LEVEL,
  PLACEHOLDER_TECH_MAX_LEVEL,
  STATION_CONFLICT_BASE_MUL,
  STATION_CONFLICT_CLEARED_MUL,
  STATION_CONFLICT_RULES_MUL,
  TECH_TAB_IDS,
  TECH_TAB_LABELS,
  TECH_TABS,
  TECH_TREE,
  applyTechEffects,
  encounterSlotCount,
  fuseStayAssigned,
  grantTechPoint,
  hasTech,
  hydrateTechFields,
  hydrateTechLevels,
  hydrateUnlockedTechIds,
  isRowOpen,
  isTechMaxed,
  nextTech,
  normalizeTechPoints,
  offlineCapHours,
  offlineCapS,
  recruitCost,
  researchNextTech,
  researchTech,
  resetAllTech,
  spentTechPoints,
  rowHasPurchase,
  stationConflictHint,
  stationConflictMul,
  stationTechSpeedMul,
  techActivateLabel,
  techEffectValue,
  techLevel,
  techProgressText,
  techReadyLabel,
  techRow,
  techTab,
} from './tech'
import { OFFLINE_CAP_S, RECRUIT_COST } from './tables'
import { ticks } from './tick'
import type { Save } from './types'

afterEach(() => {
  setRollOverride(null)
})

function buy(save: Save, id: string) {
  save.techPoints = 999
  return researchTech(save, id)
}

function maxAllTechs(save: Save) {
  save.techLevels = Object.fromEntries(TECH_TREE.map((node) => [node.id, node.maxLevel]))
  save.unlockedTechIds = TECH_TREE.map((node) => node.id)
}

describe('tech tab row table', () => {
  it('is three independent tabs with 2-3 same-cost options per row', () => {
    expect(TECH_TABS.map((tab) => tab.id)).toEqual([...TECH_TAB_IDS])
    expect(TECH_TAB_LABELS).toEqual({
      production: '生产',
      combat: '战斗',
      affairs: '事务',
    })
    expect(new Set(TECH_TREE.map((node) => node.id)).size).toBe(TECH_TREE.length)
    expect(
      TECH_TREE.every(
        (node) => node.cost > 0 && node.desc && node.effectId && node.row >= 1 && node.icon && node.maxLevel >= 1,
      ),
    ).toBe(true)

    for (const tab of TECH_TABS) {
      expect(tab.name).toBe(TECH_TAB_LABELS[tab.id])
      expect(tab.rows.length).toBeGreaterThanOrEqual(5)
      tab.rows.forEach((row, i) => {
        expect(row.tab).toBe(tab.id)
        expect(row.row).toBe(i + 1)
        expect(row.options.length).toBeGreaterThanOrEqual(2)
        expect(row.options.length).toBeLessThanOrEqual(3)
        expect(row.options.every((option) => option.cost === row.cost)).toBe(true)
        expect(row.options.every((option) => option.tab === tab.id && option.row === row.row)).toBe(true)
      })
    }

    expect(ENCOUNTER_SLOT_TECH_IDS).toEqual([
      'pathOutpost',
      'marketLicense',
      'scoutRelay',
      'farWatch',
      'caravanPermit',
    ])
    expect(techRow('affairs', 1)?.options.some((option) => option.id === 'pathOutpost')).toBe(true)
    expect(techRow('affairs', 2)?.options.some((option) => option.id === 'marketLicense')).toBe(true)
    expect(techRow('affairs', 3)?.options.some((option) => option.id === 'scoutRelay')).toBe(true)
    expect(techRow('affairs', 4)?.options.some((option) => option.id === 'farWatch')).toBe(true)
    expect(techRow('affairs', 5)?.options.some((option) => option.id === 'caravanPermit')).toBe(true)
    expect(TECH_TREE.filter((node) => node.effectId === ENCOUNTER_SLOT_EFFECT)).toHaveLength(5)

    const rules = TECH_TREE.find((node) => node.id === 'workshopRules')
    const archive = TECH_TREE.find((node) => node.id === 'artisanArchive')
    expect(rules).toMatchObject({
      tab: 'production',
      row: 2,
      implemented: true,
      maxLevel: IMPLEMENTED_TECH_MAX_LEVEL,
    })
    expect(archive).toMatchObject({
      tab: 'production',
      row: 3,
      implemented: true,
      maxLevel: IMPLEMENTED_TECH_MAX_LEVEL,
    })
    expect(techReadyLabel(rules!)).toBe('已实装')
    expect(techReadyLabel(archive!)).toBe('已实装')
    expect(ENCOUNTER_SLOT_TECH_IDS.every((id) => techNodeById(id).maxLevel === IMPLEMENTED_TECH_MAX_LEVEL)).toBe(true)
    expect(TECH_TREE.filter((node) => !node.implemented).every((node) => node.maxLevel === PLACEHOLDER_TECH_MAX_LEVEL)).toBe(
      true,
    )
    expect(techTab('combat').rows.every((row) => row.options.every((option) => !option.implemented))).toBe(true)
    expect(techReadyLabel(techRow('combat', 1)!.options[0])).toBe('未实装（效果尚未实现）')
  })
})

function techNodeById(id: string) {
  return TECH_TREE.find((node) => node.id === id)!
}

describe('hydrate tech fields', () => {
  it('keeps known old ids, drops junk, and does not require previous rows', () => {
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
    expect(hydrateUnlockedTechIds(['pathOutpost'])).toEqual(['pathOutpost'])
    expect(
      hydrateUnlockedTechIds(['workshopLog', 'apprenticeNotes', 'artisanManual', 'pathOutpost']),
    ).toEqual(['workshopLog', 'apprenticeNotes', 'artisanManual', 'pathOutpost'])
    expect(hydrateUnlockedTechIds(['workshopRules', 'artisanArchive', 'marketLicense'])).toEqual([
      'workshopRules',
      'artisanArchive',
      'marketLicense',
    ])

    const save = createSave()
    delete (save as { techPoints?: number }).techPoints
    delete (save as { unlockedTechIds?: Save['unlockedTechIds'] }).unlockedTechIds
    delete (save as { techLevels?: Save['techLevels'] }).techLevels
    hydrateTechFields(save as Save)
    expect(save.techPoints).toBe(0)
    expect(save.unlockedTechIds).toEqual([])
    expect(save.techLevels).toEqual({})
  })

  it('reads inspiration as a techPoints alias and keeps points when mapping old ids', () => {
    const save = createSave()
    delete (save as { techPoints?: number }).techPoints
    const aliased = save as Save & { inspiration: number }
    aliased.inspiration = 7.6
    aliased.unlockedTechIds = ['pathOutpost', 'workshopRules']
    hydrateTechFields(aliased)
    expect(aliased.techPoints).toBe(7)
    expect(aliased.unlockedTechIds).toEqual(['workshopRules', 'pathOutpost'])
    expect(aliased.techLevels).toEqual({ workshopRules: 1, pathOutpost: 1 })
    expect(techLevel(aliased, 'workshopRules')).toBe(1)
    expect(techLevel(aliased, 'pathOutpost')).toBe(1)
    expect(encounterSlotCount(aliased)).toBe(2)
    expect(hasTech(aliased, 'workshopRules')).toBe(true)
    expect(hasTech(aliased, 'pathOutpost')).toBe(true)
  })

  it('maps old unlockedTechIds to level=1 and clamps stored levels to maxLevel', () => {
    expect(hydrateTechLevels(undefined, ['workshopLog', 'notATech'])).toEqual({ workshopLog: 1 })
    expect(hydrateTechLevels({ workshopLog: 9, skipMe: 3 }, [])).toEqual({
      workshopLog: PLACEHOLDER_TECH_MAX_LEVEL,
    })
    expect(hydrateTechLevels({ workshopLog: 2, pathOutpost: 4 }, ['pathOutpost'])).toEqual({
      workshopLog: 2,
      pathOutpost: IMPLEMENTED_TECH_MAX_LEVEL,
    })
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
  it('lets a row light in any order and spends shared inspiration', () => {
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

  it('opens the next row after buying any one option and still allows leftover buys', () => {
    const save = createSave()
    expect(isRowOpen(save, 'production', 1)).toBe(true)
    expect(isRowOpen(save, 'production', 2)).toBe(false)
    expect(isRowOpen(save, 'affairs', 1)).toBe(true)
    expect(isRowOpen(save, 'affairs', 2)).toBe(false)

    expect(buy(save, 'workshopRules')).toEqual({ ok: false, reason: '未解锁' })
    expect(buy(save, 'workshopLog')).toEqual({ ok: true, message: '已点亮「工坊日志」' })
    expect(isRowOpen(save, 'production', 2)).toBe(true)
    expect(rowHasPurchase(save, 'production', 1)).toBe(true)
    expect(buy(save, 'workshopRules')).toEqual({ ok: true, message: '已点亮「工坊规章」' })
    expect(buy(save, 'pipelineChart')).toEqual({ ok: true, message: '已点亮「流水线图」' })
    expect(buy(save, 'apprenticeNotes')).toEqual({ ok: true, message: '已点亮「学徒笔记」' })
    expect(isRowOpen(save, 'production', 3)).toBe(true)
    expect(buy(save, 'artisanArchive')).toEqual({ ok: true, message: '已点亮「工匠密录」' })
  })

  it('keeps tabs independent and combat placeholders buyable', () => {
    const save = createSave()
    save.techPoints = 3
    expect(researchTech(save, 'combatPost')).toEqual({ ok: true, message: '已点亮「训练木桩」' })
    expect(isRowOpen(save, 'combat', 2)).toBe(true)
    expect(isRowOpen(save, 'production', 2)).toBe(false)
    expect(researchTech(save, 'workshopRules')).toEqual({ ok: false, reason: '未解锁' })
    expect(researchTech(save, 'combatManual')).toEqual({ ok: false, reason: '灵感不足' })
  })

  it('fails when inspiration is not enough', () => {
    const save = createSave()
    save.techPoints = 0
    expect(researchNextTech(save)).toEqual({ ok: false, reason: '灵感不足' })
    expect(save.unlockedTechIds).toEqual([])
    expect(save.techPoints).toBe(0)
  })

  it('rejects a later affairs row before the previous row has a purchase', () => {
    const save = createSave()
    save.techPoints = 99
    expect(researchTech(save, 'marketLicense')).toEqual({ ok: false, reason: '未解锁' })
    expect(save.unlockedTechIds).toEqual([])
    expect(encounterSlotCount(save)).toBe(ENCOUNTER_SLOT_MIN)
    expect(researchTech(save, 'pathOutpost').ok).toBe(true)
    expect(researchTech(save, 'marketLicense').ok).toBe(true)
    expect(encounterSlotCount(save)).toBe(3)
  })

  it('lets leftover options on a hydrated row be bought later', () => {
    const save = createSave()
    save.unlockedTechIds = ['workshopRules']
    save.techPoints = 20
    expect(isRowOpen(save, 'production', 2)).toBe(true)
    expect(researchTech(save, 'pipelineChart')).toEqual({ ok: true, message: '已点亮「流水线图」' })
    expect(save.techPoints).toBe(16)
    expect(save.unlockedTechIds).toEqual(['workshopRules', 'pipelineChart'])
    expect(save.techLevels).toEqual({ workshopRules: 1, pipelineChart: 1 })
  })

  it('fails when the tree is already full', () => {
    const save = createSave()
    save.techPoints = 999
    maxAllTechs(save)
    expect(researchNextTech(save)).toEqual({ ok: false, reason: '科技树已满' })
    expect(save.techPoints).toBe(999)
  })
})

describe('tech multi-level', () => {
  it('lets a placeholder be bought many times, each click spending the same row cost', () => {
    const save = createSave()
    save.techPoints = 20
    expect(techProgressText(save, 'workshopLog')).toBe('0/5')
    expect(techActivateLabel(save, 'workshopLog')).toBe('激活 · 2 灵感')
    expect(researchTech(save, 'workshopLog')).toEqual({ ok: true, message: '已点亮「工坊日志」' })
    expect(techLevel(save, 'workshopLog')).toBe(1)
    expect(techProgressText(save, 'workshopLog')).toBe('1/5')
    expect(techActivateLabel(save, 'workshopLog')).toBe('还可再点 · 2 灵感')
    expect(save.techPoints).toBe(18)
    expect(researchTech(save, 'workshopLog')).toEqual({ ok: true, message: '已点亮「工坊日志」' })
    expect(techLevel(save, 'workshopLog')).toBe(2)
    expect(save.techPoints).toBe(16)
    expect(save.techLevels.workshopLog).toBe(2)
    expect(save.unlockedTechIds).toEqual(['workshopLog'])
  })

  it('blocks a node after it reaches maxLevel', () => {
    const save = createSave()
    save.techPoints = 99
    for (let i = 0; i < PLACEHOLDER_TECH_MAX_LEVEL; i += 1) {
      expect(researchTech(save, 'workshopLog').ok).toBe(true)
    }
    expect(techLevel(save, 'workshopLog')).toBe(5)
    expect(techProgressText(save, 'workshopLog')).toBe('5/5')
    expect(isTechMaxed(save, 'workshopLog')).toBe(true)
    expect(techActivateLabel(save, 'workshopLog')).toBe('已激活')
    expect(researchTech(save, 'workshopLog')).toEqual({ ok: false, reason: '已经点满' })
    expect(save.techPoints).toBe(99 - 2 * PLACEHOLDER_TECH_MAX_LEVEL)
    expect(researchTech(save, 'pathOutpost').ok).toBe(true)
    expect(researchTech(save, 'pathOutpost')).toEqual({ ok: false, reason: '已经点满' })
    expect(techProgressText(save, 'pathOutpost')).toBe('1/1')
  })

  it('opens the next row after any node on the current row reaches level 1', () => {
    const save = createSave()
    expect(isRowOpen(save, 'production', 2)).toBe(false)
    expect(isRowOpen(save, 'combat', 2)).toBe(false)
    expect(buy(save, 'workshopLog')).toEqual({ ok: true, message: '已点亮「工坊日志」' })
    expect(isRowOpen(save, 'production', 2)).toBe(true)
    expect(isRowOpen(save, 'combat', 2)).toBe(false)
    expect(buy(save, 'workshopLog').ok).toBe(true)
    expect(techLevel(save, 'workshopLog')).toBe(2)
    expect(isRowOpen(save, 'production', 2)).toBe(true)
    expect(buy(save, 'workshopRules')).toEqual({ ok: true, message: '已点亮「工坊规章」' })
    expect(techProgressText(save, 'workshopRules')).toBe('1/1')
  })

  it('hydrates old unlockedTechIds as level=1 without exceeding maxLevel', () => {
    const save = createSave()
    save.unlockedTechIds = ['workshopLog', 'workshopRules', 'pathOutpost', 'skipMe']
    delete (save as { techLevels?: Save['techLevels'] }).techLevels
    hydrateTechFields(save)
    expect(save.unlockedTechIds).toEqual(['workshopLog', 'workshopRules', 'pathOutpost'])
    expect(save.techLevels).toEqual({
      workshopLog: 1,
      workshopRules: 1,
      pathOutpost: 1,
    })
    expect(techProgressText(save, 'workshopLog')).toBe('1/5')
    expect(techProgressText(save, 'workshopRules')).toBe('1/1')
    expect(isRowOpen(save, 'production', 2)).toBe(true)
    expect(isRowOpen(save, 'affairs', 2)).toBe(true)
  })
})

describe('encounterSlotCount', () => {
  it('starts at 1, grows after each slot tech, and caps at 6', () => {
    const save = createSave()
    expect(encounterSlotCount(save)).toBe(1)
    expect(save.encounters).toHaveLength(1)

    expect(buy(save, 'pathOutpost').ok).toBe(true)
    expect(encounterSlotCount(save)).toBe(2)
    expect(save.encounters).toHaveLength(2)

    expect(buy(save, 'marketLicense').ok).toBe(true)
    expect(encounterSlotCount(save)).toBe(3)
    expect(buy(save, 'scoutRelay').ok).toBe(true)
    expect(encounterSlotCount(save)).toBe(4)
    expect(buy(save, 'farWatch').ok).toBe(true)
    expect(encounterSlotCount(save)).toBe(5)
    expect(buy(save, 'caravanPermit').ok).toBe(true)
    expect(encounterSlotCount(save)).toBe(6)
    expect(save.encounters).toHaveLength(6)

    expect(buy(save, 'affairsRoadbook').ok).toBe(true)
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

describe('resetAllTech', () => {
  it('refunds every level × row cost, clears progress, and restores default slots/conflict', () => {
    const save = createSave()
    save.gold = 4321
    save.diamonds = 11
    save.bank.wood = 77
    save.knightLevel = 6
    const workerA = spawnWorker(save)
    const workerB = spawnWorker(save)
    assignWorker(save, workerA.id, 'mining')
    assignWorker(save, workerB.id, 'mining')
    const leftover = 17
    save.techPoints = leftover

    const buys: Array<{ id: string; times: number }> = [
      { id: 'workshopLog', times: 3 },
      { id: 'apprenticeNotes', times: 1 },
      { id: 'workshopRules', times: 1 },
      { id: 'artisanArchive', times: 1 },
      { id: 'pathOutpost', times: 1 },
      { id: 'marketLicense', times: 1 },
    ]
    let expectedSpent = 0
    for (const { id, times } of buys) {
      const cost = techNodeById(id).cost
      for (let i = 0; i < times; i += 1) {
        save.techPoints += cost
        expect(researchTech(save, id).ok).toBe(true)
        expectedSpent += cost
      }
    }

    expect(spentTechPoints(save)).toBe(expectedSpent)
    expect(save.techPoints).toBe(leftover)
    expect(techLevel(save, 'workshopLog')).toBe(3)
    expect(encounterSlotCount(save)).toBe(3)
    expect(save.encounters).toHaveLength(3)
    expect(stationConflictMul(save, 'mining')).toBe(STATION_CONFLICT_CLEARED_MUL)

    const gold = save.gold
    const diamonds = save.diamonds
    const wood = save.bank.wood
    const knightLevel = save.knightLevel
    const workerCount = save.workers.length

    expect(resetAllTech(save)).toEqual({
      ok: true,
      message: `已重置科技，返还灵感 ${expectedSpent}`,
    })
    expect(save.techPoints).toBe(leftover + expectedSpent)
    expect(save.techLevels).toEqual({})
    expect(save.unlockedTechIds).toEqual([])
    expect(TECH_TREE.every((node) => techLevel(save, node.id) === 0)).toBe(true)
    expect(spentTechPoints(save)).toBe(0)
    expect(encounterSlotCount(save)).toBe(ENCOUNTER_SLOT_MIN)
    expect(save.encounters).toHaveLength(ENCOUNTER_SLOT_MIN)
    expect(stationConflictMul(save, 'mining')).toBe(STATION_CONFLICT_BASE_MUL)
    expect(stationConflictHint(save, 'mining')).toBe('冲突：效率 −50%')
    expect(save.gold).toBe(gold)
    expect(save.diamonds).toBe(diamonds)
    expect(save.bank.wood).toBe(wood)
    expect(save.knightLevel).toBe(knightLevel)
    expect(save.workers).toHaveLength(workerCount)
  })

  it('is a no-spend no-op on an empty tree besides succeeding', () => {
    const save = createSave()
    save.techPoints = 9
    expect(resetAllTech(save)).toEqual({ ok: true, message: '已重置科技' })
    expect(save.techPoints).toBe(9)
    expect(save.techLevels).toEqual({})
    expect(save.unlockedTechIds).toEqual([])
    expect(encounterSlotCount(save)).toBe(ENCOUNTER_SLOT_MIN)
  })
})
