import { describe, expect, it } from 'vitest'
import { createSave } from './createSave'
import { claimGuideQuest, guideQuestProgressAt, guideQuestView, hydrateGuideQuestFields } from './guideQuest'
import { isModuleUnlocked } from './moduleUnlock'
import { noteMarketDeal, noteDungeonRun } from './mainlineStats'
import {
  MAINLINE_TASKS,
  mainlineStepOf,
  payMainlineReward,
  syncGuideQuestMet,
} from './mainlineQuest'
import { spawnWorker } from './recruit'
import { assignWorker } from './assign'
import { hydrateLoadedSave } from '../ui/saveGame'
import type { PawnEncounter, Save } from './types'

function ids(): string[] {
  return MAINLINE_TASKS.map((row) => row.id)
}

function pawn(): PawnEncounter {
  return {
    id: 'pawn-1',
    label: '地精当铺',
    kind: 'pawn',
    quality: 'green',
    pawnWants: { meal: 1 },
    rewardGold: 8,
    completed: true,
    timedUntil: 1,
  }
}

describe('mainline schedule', () => {
  it('alternates level gates with the feature groups and does not let tech block market', () => {
    const order = ids()
    expect(order.slice(0, 9)).toEqual([
      'recruit',
      'autoHerb',
      'fuse',
      'alchemy',
      'combat',
      'potionInstall',
      'potionUse',
      'firstBlood',
      'explore',
    ])
    expect(order.indexOf('market')).toBeLessThan(order.indexOf('tech'))
    expect(order.indexOf('restFood')).toBeLessThan(order.indexOf('tech'))
    expect(order.indexOf('herb')).toBeLessThan(order.indexOf('tech'))
    const level6 = order.indexOf('level6')
    expect(order.slice(level6, level6 + 6)).toEqual(['level6', 'huntStart', 'market', 'huntHaul', 'pawn', 'timed'])
    const level8 = order.indexOf('level8')
    expect(order.slice(level8, level8 + 7)).toEqual([
      'level8',
      'cookStart',
      'restFood',
      'dungeon',
      'stockFood',
      'chest',
      'dungeonBoth',
    ])
    const level18 = order.indexOf('level18')
    expect(order.slice(level18, level18 + 5)).toEqual(['level18', 'inscribe', 'rune', 'runeCraft', 'runeWin'])
    const banner = order.indexOf('banner1')
    expect(order.slice(banner)).toEqual([
      'banner1',
      'level22',
      'banner3',
      'purpleWorker',
      'level25',
      'chapter8',
      'stations10',
      'level28',
      'banner5',
    ])
    expect(order).toHaveLength(88)
  })

  it('shows the next level task once the open steps are done, and inserts that level’s group after it', () => {
    const save = createSave()
    save.guideQuestStep = mainlineStepOf('level6')
    save.knightLevel = 1
    expect(guideQuestView(save)?.waiting).toBe(true)
    expect(guideQuestView(save)?.goal).toBe('升到酋长 6 级（开放狩猎、集市）')
    expect(claimGuideQuest(save).ok).toBe(false)

    save.knightLevel = 6
    expect(guideQuestView(save)?.claimable).toBe(true)
    expect(claimGuideQuest(save)).toEqual({ ok: true, message: '金币 +12' })
    expect(save.guideQuestStep).toBe(mainlineStepOf('huntStart'))
    expect(guideQuestView(save)?.taskId).toBe('huntStart')
    expect(save.knightXp).toBe(0)
  })
})

describe('mainline sticky completion and rewards', () => {
  it('keeps a cleared condition claimable after the worker leaves and the board refreshes', () => {
    const save = createSave()
    save.knightLevel = 6
    spawnWorker(save)
    assignWorker(save, save.workers[0].id, 'hunting')
    save.guideQuestStep = mainlineStepOf('huntStart')
    syncGuideQuestMet(save)
    save.workers[0].assignment = null
    expect(guideQuestProgressAt(save, save.guideQuestStep)).toBe(1)

    const market = createSave()
    market.knightLevel = 6
    market.guideQuestStep = mainlineStepOf('market')
    noteMarketDeal(market, pawn())
    market.marketEncounters = []
    market.starterCopperPawnDone = false
    expect(guideQuestProgressAt(market, market.guideQuestStep)).toBe(1)
    const gold = market.gold
    expect(claimGuideQuest(market)).toEqual({ ok: true, message: '金币 +20' })
    expect(market.gold).toBe(gold + 20)
    expect(market.knightXp).toBe(0)
  })

  it('keeps a dungeon start after the daily attempt counter is cleared', () => {
    const save = createSave()
    save.knightLevel = 8
    save.guideQuestStep = mainlineStepOf('dungeon')
    noteDungeonRun(save, 'dungeonJailer')
    save.dungeon.attemptsUsedById = {}
    expect(guideQuestProgressAt(save, save.guideQuestStep)).toBe(1)
  })

  it('pays an advanced task in diamonds plus xp, and a long task with inspiration', () => {
    const save = createSave()
    save.guideQuestStep = mainlineStepOf('blueWorker')
    spawnWorker(save)
    save.workers[0].qualityTier = 3
    const diamonds = save.diamonds
    const points = save.techPoints
    expect(claimGuideQuest(save)).toEqual({ ok: true, message: '钻石 +12、酋长经验 +10' })
    expect(save.diamonds).toBe(diamonds + 12)
    expect(save.knightXp).toBe(10)
    expect(save.techPoints).toBe(points)

    const long = createSave()
    long.guideQuestStep = mainlineStepOf('chapter2')
    long.mainChapter = 2
    const before = long.techPoints
    const claimed = claimGuideQuest(long)
    expect(claimed.ok).toBe(true)
    if (claimed.ok) expect(claimed.message).toBe('钻石 +24、灵感 +1、酋长经验 +30')
    expect(long.techPoints).toBe(before + 1)
    expect(long.knightXp).toBe(30)
  })

  it('labels a material reward without chief xp', () => {
    const save = createSave()
    const label = payMainlineReward(save, { items: [{ id: 'salve', qty: 2, label: '巫毒回春剂' }] })
    expect(label).toBe('巫毒回春剂 ×2')
    expect(save.bank.salve).toBe(2)
    expect(save.knightXp).toBe(0)
  })
})

describe('mainline old saves and market flag', () => {
  it('skips tasks a high-level save already satisfied instead of sticking on recruit', () => {
    const save = createSave()
    save.knightLevel = 20
    save.guideQuestRev = 6
    save.guideQuestStep = 16
    spawnWorker(save)
    spawnWorker(save)
    save.workers[0].assignment = 'herbalism'
    save.workers[1].qualityTier = 2
    save.stations.alchemy.completed = 1
    save.departCount = 1
    save.potionSlots[0] = 'salve'
    save.guideQuestPotionUsed = true
    save.mainLootClaims = 1
    save.exploreCount = 1
    save.techLevels = { pathOutpost: 1 }
    const gold = save.gold
    hydrateGuideQuestFields(save, save)
    expect(save.guideQuestRev).toBe(7)
    expect(save.gold).toBe(gold)
    expect(guideQuestView(save)?.taskId).not.toBe('recruit')
    expect(guideQuestView(save)?.goal).not.toBe('抽取苦工 2 次')
    expect(save.guideQuestStep).toBeGreaterThan(mainlineStepOf('explore'))
  })

  it('does not open the market at knight 1 just because battlefield loot set the old flag', () => {
    const raw = createSave()
    raw.knightLevel = 1
    raw.starterCopperPawnDone = true
    raw.guideQuestRev = 6
    const loaded = hydrateLoadedSave(raw as unknown as Save)
    expect(loaded?.starterCopperPawnDone).toBe(false)
    expect(loaded?.guideQuestStats.marketDeals).toBe(0)
    expect(isModuleUnlocked(loaded!, 'market')).toBe(false)
  })

  it('keeps one market deal for an old level-6 flag so a refreshed board still counts', () => {
    const save = createSave()
    save.knightLevel = 6
    save.starterCopperPawnDone = true
    save.guideQuestRev = 6
    hydrateGuideQuestFields(save, save)
    expect(save.guideQuestStats.marketDeals).toBe(1)
    expect(save.starterCopperPawnDone).toBe(true)
  })
})
