import { afterEach, describe, expect, it } from 'vitest'
import { assignWorker } from './assign'
import { createAssistWorker } from './combatAssist'
import { ensureEnemyIntel, initialRevealedWeaknessCount, weaknessDamageMul } from './combatAttrs'
import { workerCombatStats } from './combat'
import { createSave } from './createSave'
import {
  combatSupplyNeeds,
  enemyLootPayout,
  exploreCost,
  pawnRewardGold,
} from './encounters'
import { fuseWorkers } from './fuse'
import { currentSpeed, slagCopperCostSet, stationCycleS } from './query'
import { recruitWorker, spawnWorker, spawnWorkerWith } from './recruit'
import { setRollOverride } from './rng'
import { grantStationXp } from './stationProgress'
import { completeCycle } from './stations'
import {
  ATK_INTERVAL_EFFECT,
  BATTLEFIELD_SLOT_EFFECT,
  BATTLEFIELD_SLOT_MAX,
  BATTLEFIELD_SLOT_MIN,
  BATTLEFIELD_SLOT_TECH_IDS,
  ENCOUNTER_SLOT_TECH_IDS,
  MARKET_SLOT_EFFECT,
  MARKET_SLOT_MAX,
  MARKET_SLOT_MIN,
  MARKET_SLOT_TECH_IDS,
  EXPLORE_COST_EFFECT,
  FORGE_CYCLE_EFFECT,
  IMPLEMENTED_TECH_MAX_LEVEL,
  LOOT_GOLD_EFFECT,
  MINING_OUTPUT_EFFECT,
  PLACEHOLDER_TECH_MAX_LEVEL,
  SLAG_COPPER_EFFECT,
  STATION_CONFLICT_BASE_MUL,
  STATION_CONFLICT_CLEARED_MUL,
  STATION_CONFLICT_RULES_MUL,
  STATION_XP_EFFECT,
  TECH_TAB_IDS,
  TECH_TAB_LABELS,
  TECH_TABS,
  TECH_TREE,
  TOOL_UPKEEP_EFFECT,
  TRADE_GOLD_EFFECT,
  WEAKNESS_CRIT_EFFECT,
  WORKER_ATK_EFFECT,
  WORKER_HP_EFFECT,
  applyTechEffects,
  assistQualityFloor,
  attackIntervalMul,
  battlefieldSlotCount,
  encounterSlotCount,
  marketSlotCount,
  exploreCostMul,
  forgeCycleMul,
  fuseStayAssigned,
  hasTech,
  hydrateTechFields,
  hydrateTechLevels,
  hydrateUnlockedTechIds,
  isRowOpen,
  isTechMaxed,
  lootGoldMul,
  miningOutputMul,
  nextTech,
  normalizeTechPoints,
  offlineCapHours,
  offlineCapS,
  recruitCost,
  rematchSupplyCut,
  researchNextTech,
  researchTech,
  resetAllTech,
  revealExtraCount,
  spentTechPoints,
  rowHasPurchase,
  scaleQtyByMul,
  slagCopperValue,
  stationConflictHint,
  stationConflictMul,
  stationTechSpeedMul,
  stationXpMul,
  techActivateLabel,
  techEffectValue,
  techLevel,
  techProgressText,
  techReadyLabel,
  techRow,
  techTab,
  toolUpkeepBonus,
  tradeGoldMul,
  weaknessCritBonus,
  workerAtkMul,
  workerHpMul,
} from './tech'
import { stationToolSpeedMul } from './tools'
import type { EnemyEncounter, PawnEncounter } from './types'
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
    expect(BATTLEFIELD_SLOT_TECH_IDS).toEqual(['pathOutpost', 'scoutRelay'])
    expect(MARKET_SLOT_TECH_IDS).toEqual(['marketLicense', 'farWatch', 'caravanPermit'])
    expect(TECH_TREE.filter((node) => node.effectId === BATTLEFIELD_SLOT_EFFECT)).toHaveLength(2)
    expect(TECH_TREE.filter((node) => node.effectId === MARKET_SLOT_EFFECT)).toHaveLength(3)

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
    expect(techRow('production', 1)?.options.map((option) => option.id)).toEqual([
      'slagRecycle',
      'recipeImprint',
      'veinSelect',
    ])
    expect(techRow('production', 4)?.options.map((option) => option.id)).toEqual([
      'nightLamp',
      'workshopCrest',
      'knightCrest',
    ])
    expect(techRow('combat', 1)?.options.map((option) => option.id)).toEqual(['dummyDrill', 'bracerTighten'])
    expect(techRow('affairs', 1)?.options.map((option) => option.id)).toEqual(['pathOutpost', 'bargainBell'])
    expect(techReadyLabel(techRow('combat', 1)!.options[0])).toBe('已实装')
    expect(techReadyLabel(techRow('production', 4)!.options[0])).toBe('已实装')
    expect(techRow('combat', 4)!.options.every((option) => !option.implemented)).toBe(true)
    expect(techReadyLabel(techRow('combat', 4)!.options[0])).toBe('未实装')
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
    expect(hydrateUnlockedTechIds(['workshopLog', 'notATech', 'artisanManual'])).toEqual([])
    expect(hydrateUnlockedTechIds(['apprenticeNotes', 'pipelineChart', 'combatPost'])).toEqual([])
    expect(hydrateUnlockedTechIds(['pathOutpost'])).toEqual(['pathOutpost'])
    expect(hydrateUnlockedTechIds(['workshopLog', 'apprenticeNotes', 'artisanManual', 'pathOutpost'])).toEqual([
      'pathOutpost',
    ])
    expect(hydrateUnlockedTechIds(['workshopRules', 'artisanArchive', 'marketLicense'])).toEqual([
      'workshopRules',
      'artisanArchive',
      'marketLicense',
    ])
    expect(hydrateUnlockedTechIds(['slagRecycle', 'dummyDrill', 'bargainBell'])).toEqual([
      'slagRecycle',
      'dummyDrill',
      'bargainBell',
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
    expect(battlefieldSlotCount(aliased)).toBe(3)
    expect(marketSlotCount(aliased)).toBe(MARKET_SLOT_MIN)
    expect(encounterSlotCount(aliased)).toBe(3 + MARKET_SLOT_MIN)
    expect(hasTech(aliased, 'workshopRules')).toBe(true)
    expect(hasTech(aliased, 'pathOutpost')).toBe(true)
  })

  it('maps old unlockedTechIds to level=1 and clamps stored levels to maxLevel', () => {
    expect(hydrateTechLevels(undefined, ['workshopLog', 'notATech', 'workshopCrest'])).toEqual({ workshopCrest: 1 })
    expect(hydrateTechLevels({ workshopCrest: 9, skipMe: 3 }, [])).toEqual({
      workshopCrest: PLACEHOLDER_TECH_MAX_LEVEL,
    })
    expect(hydrateTechLevels({ workshopCrest: 2, pathOutpost: 4 }, ['pathOutpost'])).toEqual({
      workshopCrest: 2,
      pathOutpost: IMPLEMENTED_TECH_MAX_LEVEL,
    })
  })
})

describe('inspiration grant', () => {
  it('does not add inspiration when any station finishes a cycle', () => {
    const mine = createSave()
    spawnWorker(mine)
    assignWorker(mine, mine.workers[0].id, 'mining')
    const mined = ticks(mine, 20)
    expect(mined.stations.mining.completed).toBe(1)
    expect(mined.techPoints).toBe(20)

    setRollOverride(() => 0.99)
    const forge = createSave()
    spawnWorker(forge)
    assignWorker(forge, forge.workers[0].id, 'inscription')
    forge.bank.wildCrystal = 2
    const forged = ticks(forge, 32)
    expect(forged.stations.inscription.completed).toBe(1)
    expect(forged.techPoints).toBe(20)
  })

  it('does not grant inspiration on an inscription soft-fail cycle', () => {
    setRollOverride(() => 0)
    const save = createSave()
    spawnWorker(save)
    assignWorker(save, save.workers[0].id, 'inscription')
    save.bank.wildCrystal = 2
    expect(completeCycle(save, 'inscription')).toBe(true)
    expect(save.stations.inscription.craftNotice).toContain('软失败')
    expect(save.techPoints).toBe(20)
  })
})

describe('research unlock', () => {
  it('lets a row light in any order and spends shared inspiration', () => {
    const save = createSave()
    expect(nextTech(save)?.id).toBe('slagRecycle')
    save.techPoints = 6
    expect(researchTech(save, 'veinSelect')).toEqual({ ok: true, message: '已点亮「矿脉精选」' })
    expect(researchTech(save, 'slagRecycle')).toEqual({ ok: true, message: '已点亮「渣滓回炉」' })
    expect(save.techPoints).toBe(2)
    expect(hasTech(save, 'slagRecycle')).toBe(true)
    expect(hasTech(save, 'veinSelect')).toBe(true)
    expect(researchTech(save, 'recipeImprint')).toEqual({ ok: true, message: '已点亮「配方拓印」' })
    expect(save.techPoints).toBe(0)
  })

  it('opens the next row after buying any one option and still allows leftover buys', () => {
    const save = createSave()
    expect(isRowOpen(save, 'production', 1)).toBe(true)
    expect(isRowOpen(save, 'production', 2)).toBe(false)
    expect(isRowOpen(save, 'affairs', 1)).toBe(true)
    expect(isRowOpen(save, 'affairs', 2)).toBe(false)

    expect(buy(save, 'workshopRules')).toEqual({ ok: false, reason: '未解锁' })
    expect(buy(save, 'slagRecycle')).toEqual({ ok: true, message: '已点亮「渣滓回炉」' })
    expect(isRowOpen(save, 'production', 2)).toBe(true)
    expect(rowHasPurchase(save, 'production', 1)).toBe(true)
    expect(buy(save, 'workshopRules')).toEqual({ ok: true, message: '已点亮「工坊规章」' })
    expect(buy(save, 'toolUpkeep')).toEqual({ ok: true, message: '已点亮「工具保养」' })
    expect(buy(save, 'recipeImprint')).toEqual({ ok: true, message: '已点亮「配方拓印」' })
    expect(isRowOpen(save, 'production', 3)).toBe(true)
    expect(buy(save, 'artisanArchive')).toEqual({ ok: true, message: '已点亮「工匠密录」' })
  })

  it('keeps tabs independent and combat placeholders buyable', () => {
    const save = createSave()
    save.techPoints = 3
    expect(researchTech(save, 'dummyDrill')).toEqual({ ok: true, message: '已点亮「木桩加训」' })
    expect(isRowOpen(save, 'combat', 2)).toBe(true)
    expect(isRowOpen(save, 'production', 2)).toBe(false)
    expect(researchTech(save, 'workshopRules')).toEqual({ ok: false, reason: '未解锁' })
    expect(researchTech(save, 'weaknessNotes')).toEqual({ ok: false, reason: '灵感不足' })
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
    expect(battlefieldSlotCount(save)).toBe(BATTLEFIELD_SLOT_MIN)
    expect(marketSlotCount(save)).toBe(MARKET_SLOT_MIN)
    expect(researchTech(save, 'pathOutpost').ok).toBe(true)
    expect(researchTech(save, 'marketLicense').ok).toBe(true)
    expect(battlefieldSlotCount(save)).toBe(3)
    expect(marketSlotCount(save)).toBe(3)
  })

  it('lets leftover options on a hydrated row be bought later', () => {
    const save = createSave()
    save.unlockedTechIds = ['workshopRules']
    save.techPoints = 20
    expect(isRowOpen(save, 'production', 2)).toBe(true)
    expect(researchTech(save, 'toolUpkeep')).toEqual({ ok: true, message: '已点亮「工具保养」' })
    expect(save.techPoints).toBe(16)
    expect(save.unlockedTechIds).toEqual(['workshopRules', 'toolUpkeep'])
    expect(save.techLevels).toEqual({ workshopRules: 1, toolUpkeep: 1 })
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
    save.unlockedTechIds = ['slagRecycle', 'workshopRules', 'artisanArchive']
    hydrateTechFields(save)
    save.techPoints = 20
    expect(techProgressText(save, 'workshopCrest')).toBe('0/5')
    expect(techActivateLabel(save, 'workshopCrest')).toBe('激活 · 8 灵感')
    expect(researchTech(save, 'workshopCrest')).toEqual({ ok: true, message: '已点亮「工坊纹章」' })
    expect(techLevel(save, 'workshopCrest')).toBe(1)
    expect(techProgressText(save, 'workshopCrest')).toBe('1/5')
    expect(techActivateLabel(save, 'workshopCrest')).toBe('还可再点 · 8 灵感')
    expect(save.techPoints).toBe(12)
    expect(researchTech(save, 'workshopCrest')).toEqual({ ok: true, message: '已点亮「工坊纹章」' })
    expect(techLevel(save, 'workshopCrest')).toBe(2)
    expect(save.techPoints).toBe(4)
    expect(save.techLevels.workshopCrest).toBe(2)
    expect(save.unlockedTechIds).toContain('workshopCrest')
  })

  it('blocks a node after it reaches maxLevel', () => {
    const save = createSave()
    save.unlockedTechIds = ['slagRecycle', 'workshopRules', 'artisanArchive']
    hydrateTechFields(save)
    save.techPoints = 99
    for (let i = 0; i < PLACEHOLDER_TECH_MAX_LEVEL; i += 1) {
      expect(researchTech(save, 'workshopCrest').ok).toBe(true)
    }
    expect(techLevel(save, 'workshopCrest')).toBe(5)
    expect(techProgressText(save, 'workshopCrest')).toBe('5/5')
    expect(isTechMaxed(save, 'workshopCrest')).toBe(true)
    expect(techActivateLabel(save, 'workshopCrest')).toBe('已激活')
    expect(researchTech(save, 'workshopCrest')).toEqual({ ok: false, reason: '已经点满' })
    expect(save.techPoints).toBe(99 - 8 * PLACEHOLDER_TECH_MAX_LEVEL)
    expect(researchTech(save, 'pathOutpost').ok).toBe(true)
    expect(researchTech(save, 'pathOutpost')).toEqual({ ok: false, reason: '已经点满' })
    expect(techProgressText(save, 'pathOutpost')).toBe('1/1')
  })

  it('opens the next row after any node on the current row reaches level 1', () => {
    const save = createSave()
    expect(isRowOpen(save, 'production', 2)).toBe(false)
    expect(isRowOpen(save, 'combat', 2)).toBe(false)
    expect(buy(save, 'slagRecycle')).toEqual({ ok: true, message: '已点亮「渣滓回炉」' })
    expect(isRowOpen(save, 'production', 2)).toBe(true)
    expect(isRowOpen(save, 'combat', 2)).toBe(false)
    expect(buy(save, 'slagRecycle')).toEqual({ ok: false, reason: '已经点满' })
    expect(techLevel(save, 'slagRecycle')).toBe(1)
    expect(isRowOpen(save, 'production', 2)).toBe(true)
    expect(buy(save, 'workshopRules')).toEqual({ ok: true, message: '已点亮「工坊规章」' })
    expect(techProgressText(save, 'workshopRules')).toBe('1/1')
  })

  it('hydrates old unlockedTechIds as level=1 without exceeding maxLevel', () => {
    const save = createSave()
    save.unlockedTechIds = ['workshopLog', 'workshopRules', 'pathOutpost', 'workshopCrest', 'skipMe']
    delete (save as { techLevels?: Save['techLevels'] }).techLevels
    hydrateTechFields(save)
    expect(save.unlockedTechIds).toEqual(['workshopRules', 'workshopCrest', 'pathOutpost'])
    expect(save.techLevels).toEqual({
      workshopRules: 1,
      workshopCrest: 1,
      pathOutpost: 1,
    })
    expect(techProgressText(save, 'workshopCrest')).toBe('1/5')
    expect(techProgressText(save, 'workshopRules')).toBe('1/1')
    expect(isRowOpen(save, 'production', 2)).toBe(true)
    expect(isRowOpen(save, 'affairs', 2)).toBe(true)
  })
})

describe('battlefieldSlotCount and marketSlotCount', () => {
  it('grows each board independently and caps at 4', () => {
    const save = createSave()
    expect(battlefieldSlotCount(save)).toBe(BATTLEFIELD_SLOT_MIN)
    expect(marketSlotCount(save)).toBe(MARKET_SLOT_MIN)
    expect(save.encounters).toHaveLength(BATTLEFIELD_SLOT_MIN)
    expect(save.marketEncounters).toHaveLength(MARKET_SLOT_MIN)
    expect(save.encounters.every((enc) => enc.kind === 'enemy')).toBe(true)
    expect(save.marketEncounters.every((enc) => enc.kind !== 'enemy')).toBe(true)

    expect(buy(save, 'pathOutpost').ok).toBe(true)
    expect(battlefieldSlotCount(save)).toBe(3)
    expect(marketSlotCount(save)).toBe(MARKET_SLOT_MIN)
    expect(save.encounters).toHaveLength(3)

    expect(buy(save, 'marketLicense').ok).toBe(true)
    expect(battlefieldSlotCount(save)).toBe(3)
    expect(marketSlotCount(save)).toBe(3)
    expect(save.marketEncounters).toHaveLength(3)

    expect(buy(save, 'scoutRelay').ok).toBe(true)
    expect(battlefieldSlotCount(save)).toBe(BATTLEFIELD_SLOT_MAX)
    expect(save.encounters).toHaveLength(BATTLEFIELD_SLOT_MAX)

    expect(buy(save, 'farWatch').ok).toBe(true)
    expect(marketSlotCount(save)).toBe(MARKET_SLOT_MAX)
    expect(buy(save, 'caravanPermit').ok).toBe(true)
    expect(marketSlotCount(save)).toBe(MARKET_SLOT_MAX)
    expect(save.marketEncounters).toHaveLength(MARKET_SLOT_MAX)
    expect(save.encounters).toHaveLength(BATTLEFIELD_SLOT_MAX)

    expect(buy(save, 'affairsRoadbook').ok).toBe(true)
    expect(battlefieldSlotCount(save)).toBe(BATTLEFIELD_SLOT_MAX)
    expect(marketSlotCount(save)).toBe(MARKET_SLOT_MAX)
  })
})

describe('tech effects stay no-op where intended', () => {
  it('does not change recruit / one-worker cooking speed / merge', () => {
    const save = createSave()
    maxAllTechs(save)
    applyTechEffects(save)
    expect(techEffectValue(save, 'noop')).toBe(0)
    expect(recruitCost(save)).toBe(RECRUIT_COST)
    expect(stationTechSpeedMul(save, 'cooking')).toBe(1)
    expect(fuseStayAssigned(save)).toBe(true)
    expect(offlineCapS(save)).toBe(OFFLINE_CAP_S + 2 * 3600)
    expect(offlineCapHours(save)).toBe(10)
    expect(exploreCost(save)).toBe(6)

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
    maxAllTechs(merge)
    expect(fuseWorkers(merge, a.id, b.id).ok).toBe(true)
    expect(merge.workers[0].assignment).toBe('mining')
  })
})

describe('station conflict', () => {
  it('cuts two-worker speed by 30% before conflict techs', () => {
    const two = createSave()
    spawnWorker(two)
    spawnWorker(two)
    assignWorker(two, two.workers[0].id, 'mining')
    assignWorker(two, two.workers[1].id, 'mining')
    const one = createSave()
    spawnWorker(one)
    assignWorker(one, one.workers[0].id, 'mining')
    const noConflictTwo = currentSpeed(one, 'mining') * 2

    expect(STATION_CONFLICT_BASE_MUL).toBe(0.7)
    expect(stationConflictMul(two, 'mining')).toBe(STATION_CONFLICT_BASE_MUL)
    expect(currentSpeed(two, 'mining')).toBeCloseTo(noConflictTwo * STATION_CONFLICT_BASE_MUL)
    expect(currentSpeed(two, 'mining')).toBeGreaterThan(currentSpeed(one, 'mining'))
    expect(stationConflictHint(two, 'mining')).toBe('冲突：效率 −30%')
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
    expect(STATION_CONFLICT_RULES_MUL).toBe(0.85)
    expect(stationConflictMul(two, 'mining')).toBe(STATION_CONFLICT_RULES_MUL)
    expect(currentSpeed(two, 'mining')).toBeCloseTo(stacked * STATION_CONFLICT_RULES_MUL)
    expect(stationConflictHint(two, 'mining')).toBe('冲突：效率 −15%')

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
      { id: 'slagRecycle', times: 1 },
      { id: 'recipeImprint', times: 1 },
      { id: 'workshopRules', times: 1 },
      { id: 'artisanArchive', times: 1 },
      { id: 'workshopCrest', times: 3 },
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
    expect(techLevel(save, 'workshopCrest')).toBe(3)
    expect(battlefieldSlotCount(save)).toBe(3)
    expect(marketSlotCount(save)).toBe(3)
    expect(save.encounters).toHaveLength(3)
    expect(save.marketEncounters).toHaveLength(3)
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
    expect(battlefieldSlotCount(save)).toBe(BATTLEFIELD_SLOT_MIN)
    expect(marketSlotCount(save)).toBe(MARKET_SLOT_MIN)
    expect(save.encounters).toHaveLength(BATTLEFIELD_SLOT_MIN)
    expect(save.marketEncounters).toHaveLength(MARKET_SLOT_MIN)
    expect(stationConflictMul(save, 'mining')).toBe(STATION_CONFLICT_BASE_MUL)
    expect(stationConflictHint(save, 'mining')).toBe('冲突：效率 −30%')
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
    expect(battlefieldSlotCount(save)).toBe(BATTLEFIELD_SLOT_MIN)
    expect(marketSlotCount(save)).toBe(MARKET_SLOT_MIN)
  })
})

function unlock(save: Save, id: string) {
  save.techLevels = { ...save.techLevels, [id]: 1 }
  if (!save.unlockedTechIds.includes(id)) save.unlockedTechIds = [...save.unlockedTechIds, id]
}

function testPawn(overrides: Partial<PawnEncounter> = {}): PawnEncounter {
  return {
    kind: 'pawn',
    id: 'tech-pawn',
    label: '试当',
    quality: 'green',
    pawnWants: { ore: 2 },
    rewardGold: 20,
    completed: false,
    ...overrides,
  }
}

function testEnemy(overrides: Partial<EnemyEncounter> = {}): EnemyEncounter {
  return {
    kind: 'enemy',
    id: 'tech-enemy',
    label: '试敌',
    quality: 'green',
    needs: { meal: 2 },
    lootGold: 20,
    departed: false,
    combat: null,
    lootClaimed: false,
    enemyRank: 'minion',
    weaknesses: ['fire', 'ice'],
    revealedWeaknesses: [],
    ...overrides,
  }
}

describe('tech effect multipliers', () => {
  it('reads planned production / combat / affairs bases after unlock', () => {
    const save = createSave()
    expect(techEffectValue(save, SLAG_COPPER_EFFECT)).toBe(0)
    expect(stationXpMul(save)).toBe(1)
    expect(miningOutputMul(save)).toBe(1)
    expect(toolUpkeepBonus(save)).toBe(0)
    expect(forgeCycleMul(save)).toBe(1)
    expect(offlineCapHours(save)).toBe(8)
    expect(workerAtkMul(save)).toBe(1)
    expect(workerHpMul(save)).toBe(1)
    expect(weaknessCritBonus(save)).toBe(0)
    expect(revealExtraCount(save)).toBe(0)
    expect(attackIntervalMul(save)).toBe(1)
    expect(rematchSupplyCut(save)).toBe(0)
    expect(assistQualityFloor(save, 6)).toBe(1)
    expect(tradeGoldMul(save)).toBe(1)
    expect(exploreCostMul(save)).toBe(1)
    expect(lootGoldMul(save)).toBe(1)
    expect(slagCopperValue(save)).toBe(0)

    unlock(save, 'slagRecycle')
    unlock(save, 'recipeImprint')
    unlock(save, 'veinSelect')
    unlock(save, 'toolUpkeep')
    unlock(save, 'forgeHeat')
    unlock(save, 'nightLamp')
    unlock(save, 'dummyDrill')
    unlock(save, 'bracerTighten')
    unlock(save, 'weaknessNotes')
    unlock(save, 'revealSight')
    unlock(save, 'rapidForm')
    unlock(save, 'rematchSupply')
    unlock(save, 'assistHorn')
    unlock(save, 'bargainBell')
    unlock(save, 'rushOrder')
    unlock(save, 'lootSort')

    expect(techEffectValue(save, SLAG_COPPER_EFFECT)).toBe(0.5)
    expect(techEffectValue(save, STATION_XP_EFFECT)).toBe(0.15)
    expect(techEffectValue(save, MINING_OUTPUT_EFFECT)).toBe(0.1)
    expect(techEffectValue(save, TOOL_UPKEEP_EFFECT)).toBe(0.05)
    expect(techEffectValue(save, FORGE_CYCLE_EFFECT)).toBe(0.1)
    expect(techEffectValue(save, WORKER_ATK_EFFECT)).toBe(0.1)
    expect(techEffectValue(save, WORKER_HP_EFFECT)).toBe(0.1)
    expect(techEffectValue(save, WEAKNESS_CRIT_EFFECT)).toBe(0.1)
    expect(techEffectValue(save, ATK_INTERVAL_EFFECT)).toBe(0.1)
    expect(techEffectValue(save, EXPLORE_COST_EFFECT)).toBe(0.2)
    expect(techEffectValue(save, TRADE_GOLD_EFFECT)).toBe(0.15)
    expect(techEffectValue(save, LOOT_GOLD_EFFECT)).toBe(0.15)
    expect(stationXpMul(save)).toBeCloseTo(1.15)
    expect(miningOutputMul(save)).toBeCloseTo(1.1)
    expect(toolUpkeepBonus(save)).toBeCloseTo(0.05)
    expect(forgeCycleMul(save)).toBeCloseTo(0.9)
    expect(offlineCapS(save)).toBe(OFFLINE_CAP_S + 7200)
    expect(offlineCapHours(save)).toBe(10)
    expect(workerAtkMul(save)).toBeCloseTo(1.1)
    expect(workerHpMul(save)).toBeCloseTo(1.1)
    expect(weaknessCritBonus(save)).toBeCloseTo(0.1)
    expect(revealExtraCount(save)).toBe(1)
    expect(attackIntervalMul(save)).toBeCloseTo(0.9)
    expect(rematchSupplyCut(save)).toBe(0)
    expect(assistQualityFloor(save, 6)).toBe(3)
    expect(assistQualityFloor(save, 5)).toBe(2)
    expect(assistQualityFloor(save, 1)).toBe(1)
    expect(tradeGoldMul(save)).toBeCloseTo(1.15)
    expect(exploreCostMul(save)).toBeCloseTo(0.8)
    expect(lootGoldMul(save)).toBeCloseTo(1.15)
    expect(slagCopperValue(save)).toBe(0.5)
    expect(scaleQtyByMul(save, 10, 1.1)).toBe(11)
  })

  it('wires slag / xp / mining / tool / forge into stations', () => {
    const save = createSave()
    unlock(save, 'slagRecycle')
    unlock(save, 'recipeImprint')
    unlock(save, 'veinSelect')
    unlock(save, 'toolUpkeep')
    unlock(save, 'forgeHeat')

    expect(slagCopperCostSet(save, [{ itemId: 'ore', qty: 1 }])).toEqual([{ itemId: 'slag', qty: 2 }])
    const bareForge = createSave()
    expect(stationCycleS(save, 'inscription')).toBeCloseTo(stationCycleS(bareForge, 'inscription') * 0.9)
    expect(stationCycleS(save, 'cooking')).toBe(stationCycleS(bareForge, 'cooking'))

    const xpBefore = save.stations.mining.stationXp
    grantStationXp(save, 'mining', 1)
    expect(save.stations.mining.stationXp - xpBefore).toBeCloseTo(1.15)

    save.stations.mining.stationLevel = 5
    const toolPick = spawnWorker(save)
    assignWorker(save, toolPick.id, 'mining')
    expect(stationToolSpeedMul(save, 'mining')).toBe(1)

    setRollOverride(() => 0)
    const mined = createSave()
    unlock(mined, 'veinSelect')
    spawnWorker(mined)
    assignWorker(mined, mined.workers[0].id, 'mining')
    expect(completeCycle(mined, 'mining')).toBe(true)
    expect(mined.bank.ore).toBe(2)
  })

  it('wires worker combat muls, weakness, reveal, leftover rematch-supply noop and assist floor', () => {
    const save = createSave()
    unlock(save, 'dummyDrill')
    unlock(save, 'bracerTighten')
    unlock(save, 'weaknessNotes')
    unlock(save, 'revealSight')
    unlock(save, 'rapidForm')
    unlock(save, 'rematchSupply')
    unlock(save, 'assistHorn')

    const base = workerCombatStats(1, 'laborer')
    const boosted = workerCombatStats(1, 'laborer', 1, save)
    expect(boosted.atk).toBe(Math.round(base.atk * 1.1))
    expect(boosted.hp).toBe(Math.round(base.hp * 1.1))
    expect(boosted.spd).toBeCloseTo(base.spd * 0.9)

    expect(weaknessDamageMul(0, save)).toBe(1)
    expect(weaknessDamageMul(1, save)).toBeCloseTo(1.3)
    expect(weaknessDamageMul(2, save)).toBeCloseTo(1.6)
    expect(initialRevealedWeaknessCount('minion', save)).toBe(3)
    expect(initialRevealedWeaknessCount('elite', save)).toBe(2)
    expect(initialRevealedWeaknessCount('boss', save)).toBe(0)

    const minion = ensureEnemyIntel(
      testEnemy({
        weaknesses: ['fire', 'ice'],
        revealedWeaknesses: [],
      }),
      0,
      0,
      save,
    )
    expect(minion.revealedWeaknesses).toEqual(['fire', 'ice'])

    const lost = testEnemy({
      needs: { meal: 2 },
      combat: {
        startedAt: 1,
        timeoutAt: 2,
        workerIds: [],
        workers: [],
        enemy: { id: 'enemy', label: '敌', hp: 4, hpMax: 10, atk: 1, spd: 8, nextActAt: 1 },
        logs: [],
        outcome: 'lose',
      },
    })
    expect(combatSupplyNeeds(save, lost)).toEqual({ meal: 2 })
    expect(combatSupplyNeeds(save, testEnemy({ needs: { meal: 1 } }))).toEqual({ meal: 1 })

    const high = spawnWorkerWith(save, 6, 'cook')
    high.level = 4
    const assist = createAssistWorker(save, () => 0)
    expect(assist.qualityTier).toBe(3)
  })

  it('wires pawn / loot gold and explore cost', () => {
    const save = createSave()
    const pawn = testPawn()
    const enemy = testEnemy({ lootGold: 20 })
    expect(pawnRewardGold(pawn)).toBe(20)
    expect(pawnRewardGold(pawn, save)).toBe(20)
    expect(enemyLootPayout(enemy)).toBe(20)
    expect(exploreCost(save)).toBe(8)

    unlock(save, 'bargainBell')
    unlock(save, 'rushOrder')
    unlock(save, 'lootSort')
    expect(pawnRewardGold(pawn, save)).toBe(23)
    expect(enemyLootPayout(enemy, save)).toBe(23)
    expect(exploreCost(save)).toBe(6)
  })
})
