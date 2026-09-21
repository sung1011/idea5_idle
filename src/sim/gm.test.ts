import { describe, expect, it } from 'vitest'
import { bankQty } from './bank'
import { createSave } from './createSave'
import {
  GM_BASIC_ITEMS,
  GM_BASIC_ITEM_QTY,
  GM_DIAMOND_GRANT,
  GM_GOLD_GRANT,
  GM_TECH_POINTS_GRANT,
  GM_WORKER_GRANT,
  gmAddDiamonds,
  gmAddGold,
  gmAddMaxQualityWorker,
  gmAddTechPoints,
  gmAddWorkers,
  gmFillBankBasics,
  gmMaxStations,
  gmResetSave,
  gmSkipGuide,
} from './gm'
import {
  GUIDE_QUEST_DONE_STEP,
  GUIDE_QUEST_PHASE2_START,
  GUIDE_QUEST_REV,
  guideQuestView,
  isGuideQuestVisible,
} from './guideQuest'
import { QUALITY_MAX, START_DIAMONDS, START_GOLD, classPoolForQuality } from './tables'

describe('gm debug grants', () => {
  it('resets to a fresh createSave', () => {
    const dirty = createSave()
    dirty.gold = 999
    dirty.diamonds = 40
    dirty.workers.push({
      id: 'w-x',
      assignment: 'mining',
      qualityTier: 1,
      foodSlot: null,
      fatigueDebt: 0,
      hp: 24,
      hpMax: 24,
      level: 1,
      xp: 0,
      combatAttrs: [],
    })
    dirty.stations.mining.stationLevel = 7
    const next = gmResetSave()
    expect(next).not.toBe(dirty)
    expect(next.gold).toBe(START_GOLD)
    expect(next.diamonds).toBe(START_DIAMONDS)
    expect(next.workers).toEqual([])
    expect(next.stations.mining.stationLevel).toBe(1)
    expect(next.stations.mining.unlockedCategories).toEqual(['copper'])
  })

  it('adds 10000 gold', () => {
    const save = createSave()
    const before = save.gold
    expect(gmAddGold(save).ok).toBe(true)
    expect(save.gold).toBe(before + GM_GOLD_GRANT)
    expect(save.gold).toBe(before + 10000)
  })

  it('adds 10000 diamonds and fills a missing field', () => {
    const save = createSave()
    expect(gmAddDiamonds(save).ok).toBe(true)
    expect(save.diamonds).toBe(START_DIAMONDS + GM_DIAMOND_GRANT)

    const legacy = createSave()
    delete (legacy as { diamonds?: number }).diamonds
    expect(gmAddDiamonds(legacy).ok).toBe(true)
    expect(legacy.diamonds).toBe(10000)
  })

  it('spawns 5 workers without spending gold', () => {
    const save = createSave()
    const gold = save.gold
    expect(gmAddWorkers(save).ok).toBe(true)
    expect(save.workers).toHaveLength(GM_WORKER_GRANT)
    expect(save.gold).toBe(gold)
    expect(save.workers.every((w) => w.assignment === null)).toBe(true)
  })

  it('grants one max-quality worker with two combat attrs', () => {
    const save = createSave()
    const gold = save.gold
    expect(gmAddMaxQualityWorker(save).ok).toBe(true)
    expect(save.workers).toHaveLength(1)
    const worker = save.workers[0]
    expect(worker.qualityTier).toBe(QUALITY_MAX)
    expect(worker.assignment).toBe(null)
    expect(worker.combatAttrs).toHaveLength(2)
    expect(new Set(worker.combatAttrs).size).toBe(2)
    expect(classPoolForQuality(QUALITY_MAX)).toContain(worker.classId)
    expect(save.gold).toBe(gold)
  })

  it('sets every station to Lv10 and unlocks all categories', () => {
    const save = createSave()
    expect(gmMaxStations(save).ok).toBe(true)
    expect(save.stations.mining.stationLevel).toBe(10)
    expect(save.stations.inscription.stationLevel).toBe(10)
    expect(save.stations.hunting.stationLevel).toBe(10)
    expect(save.stations.mining.unlockedCategories).toEqual(['copper', 'iron', 'mithril'])
    expect(save.stations.inscription.unlockedCategories).toEqual(['default'])
    expect(save.stations.hunting.unlockedCategories).toEqual(['copper', 'iron', 'mithril'])
  })

  it('grants a generous pile of basic supplies', () => {
    const save = createSave()
    expect(gmFillBankBasics(save).ok).toBe(true)
    for (const id of GM_BASIC_ITEMS) expect(bankQty(save, id)).toBe(GM_BASIC_ITEM_QTY)
    expect(bankQty(save, 'weapon')).toBe(0)
  })

  it('adds 10000 tech points', () => {
    const save = createSave()
    const before = save.techPoints
    expect(gmAddTechPoints(save)).toEqual({ ok: true, message: '灵感 +10000' })
    expect(save.techPoints).toBe(before + GM_TECH_POINTS_GRANT)
    expect(save.techPoints).toBe(before + 10000)
  })

  it('skips both guide phases without paying unclaimed step gold', () => {
    const save = createSave()
    const gold = save.gold
    const knight = save.knightLevel
    const tech = save.techPoints
    const workers = save.workers.length
    expect(isGuideQuestVisible(save)).toBe(true)
    expect(gmSkipGuide(save)).toEqual({ ok: true, message: '已跳过引导' })
    expect(save.guideQuestStep).toBe(GUIDE_QUEST_DONE_STEP)
    expect(save.guideQuestRev).toBe(GUIDE_QUEST_REV)
    expect(save.gold).toBe(gold)
    expect(save.knightLevel).toBe(knight)
    expect(save.techPoints).toBe(tech)
    expect(save.workers).toHaveLength(workers)
    expect(guideQuestView(save)).toBeNull()
    expect(isGuideQuestVisible(save)).toBe(false)

    save.guideQuestStep = GUIDE_QUEST_PHASE2_START
    save.knightLevel = 2
    const gold2 = save.gold
    expect(guideQuestView(save)?.title).toBe('进阶 · 1/3')
    expect(gmSkipGuide(save).ok).toBe(true)
    expect(save.guideQuestStep).toBe(GUIDE_QUEST_DONE_STEP)
    expect(save.gold).toBe(gold2)
    expect(save.knightLevel).toBe(2)
    expect(isGuideQuestVisible(save)).toBe(false)
  })
})
