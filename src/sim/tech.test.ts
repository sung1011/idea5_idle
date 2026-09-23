import { afterEach, describe, expect, it } from 'vitest'
import { assignWorker } from './assign'
import { createAssistWorker } from './combatAssist'
import {
  ensureEnemyIntel,
  initialRevealedWeaknessCount,
  scaledAttackDamage,
  weaknessDamageMul,
} from './combatAttrs'
import {
  addCombatReinforcements,
  beginEnemyCombat,
  BREAK_VULN_MUL,
  stepEnemyCombat,
  workerCombatStats,
} from './combat'
import { createSave } from './createSave'
import {
  combatSupplyNeeds,
  enemyLootPayout,
  exploreCost,
  pawnRewardGold,
} from './encounters'
import { fuseWorkers } from './fuse'
import { currentSpeed, slagCopperCostSet, stationCycleS } from './query'
import { scaleArtisanStationXp } from './workerLevel'
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
  ALCHEMY_BATCH_EFFECT,
  BREAK_ECHO_EFFECT,
  CAMP_BANDAGE_EFFECT,
  DIAMOND_ORDER_EFFECT,
  EXPLORE_COST_EFFECT,
  EXPLORE_COST_FLOOR,
  EXPLORE_COST_STACK_EFFECT,
  FIRST_STRIKE_EFFECT,
  FORGE_CYCLE_EFFECT,
  HUNT_HAZARD_EFFECT,
  IMPLEMENTED_TECH_MAX_LEVEL,
  KNIGHT_CYCLE_CAP,
  KNIGHT_CYCLE_EFFECT,
  KNIGHT_CYCLE_STEP,
  LOOT_GOLD_EFFECT,
  MINING_OUTPUT_EFFECT,
  PLACEHOLDER_TECH_MAX_LEVEL,
  RECRUIT_COST_EFFECT,
  REINFORCE_FIRST_EFFECT,
  RUNE_ATK_EFFECT,
  RUNE_SCRAP_EFFECT,
  SLAG_COPPER_EFFECT,
  STATION_XP_EFFECT,
  TECH_TAB_IDS,
  TECH_TAB_LABELS,
  TECH_TABS,
  TECH_TREE,
  TIMED_ORDER_CHANCE_EFFECT,
  TIMED_ORDER_DURATION_EFFECT,
  TOOL_UPKEEP_EFFECT,
  TRADE_GOLD_EFFECT,
  WILD_CRYSTAL_DROP_EFFECT,
  WOUNDED_GUARD_EFFECT,
  WEAKNESS_CRIT_EFFECT,
  WORKER_ATK_EFFECT,
  WORKER_HP_EFFECT,
  alchemyBatchBonus,
  applyTechEffects,
  assistQualityFloor,
  attackIntervalMul,
  breakEchoMul,
  campBandageHeal,
  campBandageHealAmount,
  diamondOrderChanceBonus,
  battlefieldSlotCount,
  encounterSlotCount,
  exploreCostMul,
  marketDiamondChance,
  marketSlotCount,
  miningDualDropBonus,
  firstStrikeCutS,
  forgeCycleMul,
  fuseStayAssigned,
  hasTech,
  hydrateTechFields,
  knightCycleMul,
  hydrateTechLevels,
  groupBothStaffed,
  groupStaffSpeedMul,
  GROUP_STAFF_SPEED_MUL,
  SOLO_STAFF_MUL,
  soloStaffMul,
  workshopRulesCycleMul,
  WORKSHOP_RULES_CYCLE_CUT,
  hydrateUnlockedTechIds,
  huntingHazardMul,
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
  reinforceFirstMul,
  runeAtkMul,
  runeScrapChance,
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
  timedOrderChanceBonus,
  timedOrderDurationMul,
  toolUpkeepBonus,
  tradeGoldMul,
  woundedTakenMul,
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
    ])
    expect(techRow('affairs', 1)?.options.some((option) => option.id === 'pathOutpost')).toBe(true)
    expect(techRow('affairs', 2)?.options.some((option) => option.id === 'marketLicense')).toBe(true)
    expect(techRow('affairs', 3)?.options.some((option) => option.id === 'scoutRelay')).toBe(true)
    expect(techRow('affairs', 4)?.options.some((option) => option.id === 'farWatch')).toBe(true)
    expect(techRow('affairs', 5)?.options.some((option) => option.id === 'caravanPermit')).toBe(true)
    expect(BATTLEFIELD_SLOT_TECH_IDS).toEqual(['pathOutpost', 'scoutRelay'])
    expect(MARKET_SLOT_TECH_IDS).toEqual(['marketLicense', 'farWatch'])
    expect(TECH_TREE.filter((node) => node.effectId === BATTLEFIELD_SLOT_EFFECT)).toHaveLength(2)
    expect(TECH_TREE.filter((node) => node.effectId === MARKET_SLOT_EFFECT)).toHaveLength(2)
    expect(techNodeById('caravanPermit')).toMatchObject({
      implemented: true,
      maxLevel: IMPLEMENTED_TECH_MAX_LEVEL,
      name: '限时加急章',
    })
    expect(techNodeById('caravanPermit').effectId).not.toBe(MARKET_SLOT_EFFECT)

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
    expect(techRow('combat', 4)!.options.every((option) => option.implemented)).toBe(true)
    expect(techReadyLabel(techRow('combat', 4)!.options[0])).toBe('已实装')
    expect(techReadyLabel(techRow('production', 4)!.options[1])).toBe('已实装')
    expect(techNodeById('workshopCrest')).toMatchObject({
      name: '轮值章程',
      implemented: true,
      maxLevel: IMPLEMENTED_TECH_MAX_LEVEL,
    })
    expect(techNodeById('knightCrest')).toMatchObject({
      name: '匠师印章',
      implemented: true,
      maxLevel: IMPLEMENTED_TECH_MAX_LEVEL,
    })
    expect(techNodeById('s09DraftA')).toMatchObject({
      name: '符文边角料',
      implemented: true,
      maxLevel: IMPLEMENTED_TECH_MAX_LEVEL,
    })
    expect(techNodeById('rematchSupply')).toMatchObject({
      name: '回营绷带',
      implemented: true,
      maxLevel: IMPLEMENTED_TECH_MAX_LEVEL,
    })
    expect(techNodeById('combatCourt')).toMatchObject({
      name: '增援鼓点',
      implemented: true,
      maxLevel: IMPLEMENTED_TECH_MAX_LEVEL,
    })
    expect(TECH_TREE.every((node) => node.implemented && node.maxLevel === IMPLEMENTED_TECH_MAX_LEVEL)).toBe(true)
    expect(techNodeById('toolUpkeep').desc).toMatch(/符文/)
    expect(techNodeById('rematchSupply').desc).toMatch(/10%/)
    expect(techNodeById('rematchSupply').desc).not.toMatch(/再战/)
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
      workshopCrest: IMPLEMENTED_TECH_MAX_LEVEL,
    })
    expect(hydrateTechLevels({ workshopCrest: 2, pathOutpost: 4 }, ['pathOutpost'])).toEqual({
      workshopCrest: IMPLEMENTED_TECH_MAX_LEVEL,
      pathOutpost: IMPLEMENTED_TECH_MAX_LEVEL,
    })
    expect(hydrateTechLevels({ knightCrest: 9, rematchSupply: 4, combatCourt: 2, s09DraftA: 5 }, [])).toEqual({
      knightCrest: IMPLEMENTED_TECH_MAX_LEVEL,
      rematchSupply: IMPLEMENTED_TECH_MAX_LEVEL,
      combatCourt: IMPLEMENTED_TECH_MAX_LEVEL,
      s09DraftA: IMPLEMENTED_TECH_MAX_LEVEL,
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
  it('clamps implemented nodes to one level and spends the row cost once', () => {
    const save = createSave()
    save.unlockedTechIds = ['slagRecycle', 'workshopRules', 'artisanArchive']
    hydrateTechFields(save)
    save.techPoints = 20
    expect(techProgressText(save, 'knightCrest')).toBe('0/1')
    expect(techActivateLabel(save, 'knightCrest')).toBe('激活 · 8 灵感')
    expect(researchTech(save, 'knightCrest')).toEqual({ ok: true, message: '已点亮「匠师印章」' })
    expect(techLevel(save, 'knightCrest')).toBe(1)
    expect(techProgressText(save, 'knightCrest')).toBe('1/1')
    expect(techActivateLabel(save, 'knightCrest')).toBe('已激活')
    expect(save.techPoints).toBe(12)
    expect(researchTech(save, 'knightCrest')).toEqual({ ok: false, reason: '已经点满' })
    expect(techLevel(save, 'knightCrest')).toBe(1)
    expect(save.techPoints).toBe(12)
    expect(save.techLevels.knightCrest).toBe(1)
    expect(save.unlockedTechIds).toContain('knightCrest')
  })

  it('blocks a node after it reaches maxLevel', () => {
    const save = createSave()
    save.unlockedTechIds = ['slagRecycle', 'workshopRules', 'artisanArchive']
    hydrateTechFields(save)
    save.techPoints = 99
    expect(researchTech(save, 'knightCrest').ok).toBe(true)
    expect(techLevel(save, 'knightCrest')).toBe(1)
    expect(techProgressText(save, 'knightCrest')).toBe('1/1')
    expect(isTechMaxed(save, 'knightCrest')).toBe(true)
    expect(techActivateLabel(save, 'knightCrest')).toBe('已激活')
    expect(researchTech(save, 'knightCrest')).toEqual({ ok: false, reason: '已经点满' })
    expect(save.techPoints).toBe(99 - 8)
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
    expect(techProgressText(save, 'workshopCrest')).toBe('1/1')
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
    expect(MARKET_SLOT_TECH_IDS).not.toContain('caravanPermit')
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
    expect(recruitCost(save)).toBe(RECRUIT_COST - 5)
    expect(stationTechSpeedMul(save, 'cooking')).toBe(1)
    expect(fuseStayAssigned(save)).toBe(false)
    expect(offlineCapS(save)).toBe(OFFLINE_CAP_S + 4 * 3600)
    expect(offlineCapHours(save)).toBe(12)
    expect(exploreCost(save)).toBe(6)

    spawnWorker(save)
    assignWorker(save, save.workers[0].id, 'cooking')
    const withTech = currentSpeed(save, 'cooking')
    const bare = createSave()
    spawnWorker(bare)
    assignWorker(bare, bare.workers[0].id, 'cooking')
    expect(withTech).toBeGreaterThan(currentSpeed(bare, 'cooking'))
    expect(stationCycleS(save, 'cooking')).toBeLessThan(stationCycleS(bare, 'cooking'))

    expect(recruitWorker(save).ok).toBe(true)

    const merge = createSave()
    const a = spawnWorker(merge)
    const b = spawnWorker(merge)
    expect(fuseWorkers(merge, a.id, b.id)).toEqual({ ok: false, reason: '只能合并同一工坊的两人' })
    expect(merge.workers).toHaveLength(2)
  })
})

describe('solo staff and retired conflict', () => {
  it('multiplies a single on-duty worker by 1.5 and never applies conflict', () => {
    const save = createSave()
    expect(stationConflictMul(save, 'mining')).toBe(1)
    expect(stationConflictHint(save, 'mining')).toBeNull()
    expect(soloStaffMul(save, 'mining')).toBe(1)
    spawnWorker(save)
    assignWorker(save, save.workers[0].id, 'mining')
    expect(soloStaffMul(save, 'mining')).toBe(SOLO_STAFF_MUL)
    expect(stationConflictMul(save, 'mining')).toBe(1)
    expect(currentSpeed(save, 'mining')).toBeCloseTo((1 / 20) * SOLO_STAFF_MUL)
    expect(assignWorker(save, spawnWorker(save).id, 'mining')).toEqual({ ok: false, reason: '该站最多 1 人' })
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
      { id: 'knightCrest', times: 1 },
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
    expect(techLevel(save, 'knightCrest')).toBe(1)
    expect(battlefieldSlotCount(save)).toBe(3)
    expect(marketSlotCount(save)).toBe(3)
    expect(save.encounters).toHaveLength(3)
    expect(save.marketEncounters).toHaveLength(3)
    expect(stationConflictMul(save, 'mining')).toBe(1)

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
    expect(stationConflictMul(save, 'mining')).toBe(1)
    expect(stationConflictHint(save, 'mining')).toBeNull()
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

  it('wires worker combat muls, weakness, reveal, rematch-supply cut still 0 and assist floor', () => {
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

describe('wired placeholder techs', () => {
  it('speeds a staffed pair with 轮值章程 and shortens cycles with 工坊规章', () => {
    const save = createSave()
    spawnWorker(save)
    spawnWorker(save)
    assignWorker(save, save.workers[0].id, 'mining')
    expect(groupBothStaffed(save, 'mining')).toBe(false)
    expect(workshopRulesCycleMul(save)).toBe(1)
    expect(groupStaffSpeedMul(save, 'mining')).toBe(1)
    const bareCycle = stationCycleS(save, 'mining')
    const bareSpeed = currentSpeed(save, 'mining')
    unlock(save, 'workshopRules')
    expect(techNodeById('workshopRules').desc).toContain('周期 −5%')
    expect(workshopRulesCycleMul(save)).toBeCloseTo(1 - WORKSHOP_RULES_CYCLE_CUT)
    expect(stationCycleS(save, 'mining')).toBeCloseTo(bareCycle * (1 - WORKSHOP_RULES_CYCLE_CUT))
    unlock(save, 'workshopCrest')
    expect(techNodeById('workshopCrest').desc).toContain('×1.08')
    expect(groupStaffSpeedMul(save, 'mining')).toBe(1)
    assignWorker(save, save.workers[1].id, 'inscription')
    expect(groupBothStaffed(save, 'mining')).toBe(true)
    expect(groupStaffSpeedMul(save, 'mining')).toBeCloseTo(GROUP_STAFF_SPEED_MUL)
    expect(stationConflictMul(save, 'mining')).toBe(1)
    expect(currentSpeed(save, 'mining')).toBeCloseTo(
      (bareSpeed / (1 - WORKSHOP_RULES_CYCLE_CUT)) * GROUP_STAFF_SPEED_MUL,
    )
    expect(currentSpeed(save, 'mining')).toBeGreaterThan(bareSpeed)
    expect(techNodeById('artisanArchive').desc).toContain('×1.25')
    expect(scaleArtisanStationXp(1, 1)).toBe(1)
    expect(scaleArtisanStationXp(1, 1.25)).toBe(2)
    expect(scaleArtisanStationXp(4, 1.25)).toBe(5)
  })

  it('adds mining wild-crystal dual-drop, alchemy extra bottle, and hunting hazard cut', () => {
    const save = createSave()
    expect(miningDualDropBonus(save)).toBe(0)
    expect(alchemyBatchBonus(save)).toBe(0)
    expect(huntingHazardMul(save)).toBe(1)
    unlock(save, 's06DraftA')
    unlock(save, 's07DraftA')
    unlock(save, 's08DraftA')
    expect(techEffectValue(save, WILD_CRYSTAL_DROP_EFFECT)).toBe(0.1)
    expect(techEffectValue(save, ALCHEMY_BATCH_EFFECT)).toBe(1)
    expect(techEffectValue(save, HUNT_HAZARD_EFFECT)).toBe(0.2)
    expect(miningDualDropBonus(save)).toBeCloseTo(0.1)
    expect(alchemyBatchBonus(save)).toBe(1)
    expect(huntingHazardMul(save)).toBeCloseTo(0.8)

    setRollOverride(() => 0)
    spawnWorker(save)
    assignWorker(save, save.workers[0].id, 'mining')
    expect(completeCycle(save, 'mining')).toBe(true)
    expect(save.bank.ore).toBe(1)
    expect(save.bank.wildCrystal).toBe(2)
  })

  it('stacks night lamp then long-night lamp to 12h offline', () => {
    const save = createSave()
    expect(offlineCapHours(save)).toBe(8)
    unlock(save, 'nightLamp')
    expect(offlineCapHours(save)).toBe(10)
    unlock(save, 's10DraftA')
    expect(offlineCapHours(save)).toBe(12)
    expect(offlineCapS(save)).toBe(OFFLINE_CAP_S + 4 * 3600)
  })

  it('wires first-strike cut, rune ATK, wounded guard and break echo', () => {
    const save = createSave()
    expect(firstStrikeCutS(save)).toBe(0)
    expect(runeAtkMul(save)).toBe(1)
    expect(woundedTakenMul(save)).toBe(1)
    expect(breakEchoMul(save)).toBe(1)
    unlock(save, 'combatBanner')
    unlock(save, 'combatEdge')
    unlock(save, 'combatArmor')
    unlock(save, 'combatLegend')
    expect(techEffectValue(save, FIRST_STRIKE_EFFECT)).toBe(0.5)
    expect(techEffectValue(save, RUNE_ATK_EFFECT)).toBe(0.15)
    expect(techEffectValue(save, WOUNDED_GUARD_EFFECT)).toBe(0.2)
    expect(techEffectValue(save, BREAK_ECHO_EFFECT)).toBe(0.15)
    expect(firstStrikeCutS(save)).toBe(0.5)
    expect(runeAtkMul(save)).toBeCloseTo(1.15)
    expect(woundedTakenMul(save)).toBeCloseTo(0.8)
    expect(breakEchoMul(save)).toBeCloseTo(1.15)

    const worker = spawnWorkerWith(save, 1, 'laborer')
    const bare = workerCombatStats(1, 'laborer', 1, save)
    const edged = workerCombatStats(1, 'laborer', 1, save, 'runeSharp')
    expect(edged.atk).toBe(Math.round(bare.atk * 1.15))

    const now = 50_000
    const enc = testEnemy({ targetRuleId: 'lowestHp' })
    save.encounters = [enc]
    const combat = beginEnemyCombat(enc, [worker], now, 1, undefined, save)
    expect(combat.workers[0].nextActAt).toBe(now + combat.workers[0].spd * 1000 - 500)

    const wounded = createSave()
    unlock(wounded, 'combatArmor')
    const tank = spawnWorkerWith(wounded, 1, 'laborer')
    const liveHp = workerCombatStats(1, 'laborer', 1, wounded).hp
    tank.hpMax = liveHp
    tank.hp = Math.max(1, Math.floor(liveHp * 0.2))
    const hitEnc = testEnemy({ targetRuleId: 'lowestHp' })
    wounded.encounters = [hitEnc]
    const startHp = tank.hp
    const fight = beginEnemyCombat(hitEnc, [tank], 60_000, 1, undefined, wounded)
    const expected = Math.max(1, Math.round(fight.enemy.atk * 0.8))
    expect(fight.workers[0].hp).toBe(startHp - expected)

    const echo = createSave()
    unlock(echo, 'combatLegend')
    const striker = spawnWorkerWith(echo, 5, 'artisan', ['fire'])
    const echoEnc = testEnemy({
      weaknesses: ['fire'],
      revealedWeaknesses: ['fire'],
    })
    echo.encounters = [echoEnc]
    const echoFight = beginEnemyCombat(echoEnc, [striker], 70_000, 1, undefined, echo)
    echoFight.shieldMax = 1
    echoFight.shield = 1
    echoFight.stunnedUntil = null
    echoFight.workers[0].nextActAt = 71_000
    echoFight.enemy.nextActAt = 90_000
    const hp0 = echoFight.enemy.hp
    stepEnemyCombat(echo, echoEnc, 71_000)
    expect(echoFight.shield).toBe(0)
    expect(echoFight.stunnedUntil).toBeGreaterThan(71_000)
    echoFight.workers[0].nextActAt = 72_000
    const hp1 = echoFight.enemy.hp
    stepEnemyCombat(echo, echoEnc, 72_000)
    expect(echoFight.enemy.hp).toBe(hp1 - Math.round(echoFight.workers[0].atk * 1.2 * BREAK_VULN_MUL * 1.15))
    expect(hp1).toBeLessThan(hp0)
  })

  it('rewires caravan permit to timed duration and drops it from market slots', () => {
    const save = createSave()
    expect(MARKET_SLOT_TECH_IDS).toEqual(['marketLicense', 'farWatch'])
    expect(marketSlotCount(save)).toBe(MARKET_SLOT_MIN)
    unlock(save, 'caravanPermit')
    expect(marketSlotCount(save)).toBe(MARKET_SLOT_MIN)
    expect(techEffectValue(save, TIMED_ORDER_DURATION_EFFECT)).toBe(0.5)
    expect(timedOrderDurationMul(save)).toBeCloseTo(1.5)
    expect(techNodeById('caravanPermit').desc).toMatch(/不再加商场格/)
  })

  it('raises timed-order chance, stacks explore cut, trade gold, recruit cost and diamond orders', () => {
    const save = createSave()
    expect(timedOrderChanceBonus(save)).toBe(0)
    expect(exploreCostMul(save)).toBe(1)
    expect(tradeGoldMul(save)).toBe(1)
    expect(recruitCost(save)).toBe(RECRUIT_COST)
    expect(diamondOrderChanceBonus(save)).toBe(0)
    expect(marketDiamondChance(0.2, save)).toBeCloseTo(0.2)

    unlock(save, 's04DraftC')
    unlock(save, 's05DraftC')
    unlock(save, 'rushOrder')
    unlock(save, 'bargainBell')
    unlock(save, 'affairsRoadbook')
    unlock(save, 'affairsRoster')
    unlock(save, 'affairsSeal')

    expect(techEffectValue(save, TIMED_ORDER_CHANCE_EFFECT)).toBe(0.15)
    expect(timedOrderChanceBonus(save)).toBeCloseTo(0.15)
    expect(techEffectValue(save, EXPLORE_COST_STACK_EFFECT)).toBe(0.1)
    expect(exploreCostMul(save)).toBeCloseTo(0.72)
    expect(exploreCostMul(save)).toBeGreaterThanOrEqual(EXPLORE_COST_FLOOR)
    expect(exploreCost(save)).toBe(6)
    expect(techEffectValue(save, TRADE_GOLD_EFFECT)).toBeCloseTo(0.3)
    expect(tradeGoldMul(save)).toBeCloseTo(1.15 * 1.15)
    expect(pawnRewardGold(testPawn(), save)).toBe(26)
    expect(techEffectValue(save, RECRUIT_COST_EFFECT)).toBe(5)
    expect(recruitCost(save)).toBe(RECRUIT_COST - 5)
    expect(techEffectValue(save, DIAMOND_ORDER_EFFECT)).toBe(0.1)
    expect(marketDiamondChance(0.2, save)).toBeCloseTo(0.3)
    expect(marketDiamondChance(0.95, save)).toBe(1)
  })

  it('heals downed workers returning to rest with camp bandage', () => {
    const save = createSave()
    expect(campBandageHealAmount(save, 20)).toBe(0)
    expect(campBandageHeal(10)).toBe(1)
    expect(campBandageHeal(11)).toBe(2)
    unlock(save, 'rematchSupply')
    expect(techEffectValue(save, CAMP_BANDAGE_EFFECT)).toBe(0.1)
    expect(campBandageHealAmount(save, 20)).toBe(2)

    const front = spawnWorkerWith(save, 1, 'laborer')
    const now = 80_000
    const enc = testEnemy({ targetRuleId: 'lowestHp' })
    save.encounters = [enc]
    const combat = beginEnemyCombat(enc, [front], now, 1, undefined, save)
    combat.workers[0].hp = 1
    front.hp = 1
    combat.workers[0].nextActAt = now + 9_000
    combat.enemy.nextActAt = now + 1_000
    combat.enemy.atk = 3
    stepEnemyCombat(save, enc, now + 1_000)
    const heal = campBandageHeal(front.hpMax)
    expect(heal).toBeGreaterThanOrEqual(1)
    expect(front.hp).toBe(heal)
    expect(front.assignment).toBeNull()
    expect(combat.workers.find((w) => w.id === front.id)).toBeUndefined()
  })

  it('refunds one wild crystal on inscription soft-fail scrap roll', () => {
    const miss = createSave()
    expect(runeScrapChance(miss)).toBe(0)
    setRollOverride(() => 0)
    spawnWorker(miss)
    assignWorker(miss, miss.workers[0].id, 'inscription')
    miss.bank.wildCrystal = 2
    expect(completeCycle(miss, 'inscription')).toBe(true)
    expect(miss.bank.wildCrystal).toBe(1)
    expect(miss.stations.inscription.craftNotice).toBe('软失败，荒晶损耗')

    const refund = createSave()
    unlock(refund, 's09DraftA')
    expect(techEffectValue(refund, RUNE_SCRAP_EFFECT)).toBe(0.5)
    expect(runeScrapChance(refund)).toBeCloseTo(0.5)
    spawnWorker(refund)
    assignWorker(refund, refund.workers[0].id, 'inscription')
    refund.bank.wildCrystal = 2
    expect(completeCycle(refund, 'inscription')).toBe(true)
    expect(refund.bank.wildCrystal).toBe(2)
    expect(refund.stations.inscription.craftNotice).toBe('软失败，退回 1 荒晶')

    const keep = createSave()
    unlock(keep, 's09DraftA')
    spawnWorker(keep)
    assignWorker(keep, keep.workers[0].id, 'inscription')
    keep.bank.wildCrystal = 2
    let i = 0
    const rolls = [0, 0, 0.6]
    setRollOverride(() => rolls[i++] ?? 0.99)
    expect(completeCycle(keep, 'inscription')).toBe(true)
    expect(keep.bank.wildCrystal).toBe(1)
    expect(keep.stations.inscription.craftNotice).toBe('软失败，荒晶损耗')
  })

  it('boosts only the first hit of reinforced fighters', () => {
    const save = createSave()
    expect(reinforceFirstMul(save)).toBe(1)
    unlock(save, 'combatCourt')
    expect(techEffectValue(save, REINFORCE_FIRST_EFFECT)).toBe(0.2)
    expect(reinforceFirstMul(save)).toBeCloseTo(1.2)

    const opener = spawnWorkerWith(save, 1, 'laborer')
    const bench = spawnWorkerWith(save, 1, 'wanderer')
    opener.combatAttrs = []
    bench.combatAttrs = []
    const now = 50_000
    const enc = testEnemy({
      weaknesses: ['fire'],
      revealedWeaknesses: [],
      targetRuleId: 'lowestHp',
    })
    save.encounters = [enc]
    const combat = beginEnemyCombat(enc, [opener], now, 1, undefined, save)
    expect(combat.workers[0].reinforced).toBeFalsy()
    expect(combat.workers[0].reinforceHitPending).toBeFalsy()
    combat.shield = 0
    combat.shieldMax = 0
    combat.stunnedUntil = null
    combat.workers[0].nextActAt = now + 500
    combat.enemy.nextActAt = now + 90_000
    const openHp = combat.enemy.hp
    stepEnemyCombat(save, enc, now + 500)
    expect(combat.enemy.hp).toBe(openHp - scaledAttackDamage(combat.workers[0].atk, 1))

    addCombatReinforcements(enc, [bench], now + 600, undefined, save)
    const extra = combat.workers.find((w) => w.id === bench.id)
    expect(extra).toBeTruthy()
    if (!extra) return
    expect(extra.reinforced).toBe(true)
    expect(extra.reinforceHitPending).toBe(true)
    extra.nextActAt = now + 1_000
    combat.workers[0].nextActAt = now + 90_000
    combat.enemy.nextActAt = now + 90_000
    const hp0 = combat.enemy.hp
    stepEnemyCombat(save, enc, now + 1_000)
    expect(combat.enemy.hp).toBe(hp0 - scaledAttackDamage(extra.atk, 1.2))
    expect(extra.reinforceHitPending).toBe(false)

    extra.nextActAt = now + 2_000
    const hp1 = combat.enemy.hp
    stepEnemyCombat(save, enc, now + 2_000)
    expect(combat.enemy.hp).toBe(hp1 - scaledAttackDamage(extra.atk, 1))
  })

  it('shortens all-station cycle by knight level steps with a soft cap', () => {
    const save = createSave()
    expect(knightCycleMul(save)).toBe(1)
    unlock(save, 'knightCrest')
    expect(techEffectValue(save, KNIGHT_CYCLE_EFFECT)).toBe(0.01)
    save.knightLevel = 1
    expect(knightCycleMul(save)).toBe(1)
    save.knightLevel = KNIGHT_CYCLE_STEP - 1
    expect(knightCycleMul(save)).toBe(1)
    save.knightLevel = KNIGHT_CYCLE_STEP
    expect(knightCycleMul(save)).toBeCloseTo(0.99)
    save.knightLevel = KNIGHT_CYCLE_STEP * 2
    expect(knightCycleMul(save)).toBeCloseTo(0.98)
    save.knightLevel = KNIGHT_CYCLE_STEP * (KNIGHT_CYCLE_CAP / 0.01)
    expect(knightCycleMul(save)).toBeCloseTo(1 - KNIGHT_CYCLE_CAP)
    save.knightLevel = 100
    expect(knightCycleMul(save)).toBeCloseTo(1 - KNIGHT_CYCLE_CAP)

    const bare = createSave()
    save.knightLevel = 5
    expect(stationCycleS(save, 'cooking')).toBeCloseTo(stationCycleS(bare, 'cooking') * 0.99)
    expect(stationCycleS(save, 'mining')).toBeCloseTo(stationCycleS(bare, 'mining') * 0.99)
    expect(stationCycleS(save, 'inscription')).toBeCloseTo(stationCycleS(bare, 'inscription') * 0.99)
    unlock(save, 'forgeHeat')
    expect(stationCycleS(save, 'inscription')).toBeCloseTo(stationCycleS(bare, 'inscription') * 0.99 * 0.9)
    expect(stationCycleS(save, 'cooking')).toBeCloseTo(stationCycleS(bare, 'cooking') * 0.99)
    expect(stationTechSpeedMul(save, 'cooking')).toBe(1)
  })
})

