import { describe, expect, it } from 'vitest'
import { createSave } from './createSave'
import { claimGuideQuest, guideQuestProgressAt, guideQuestView, hydrateGuideQuestFields } from './guideQuest'
import { grantOpenedModules, isModuleUnlocked } from './moduleUnlock'
import { noteDungeonRun, noteMarketDeal, noteRuneFight, noteTreasureRaid } from './mainlineStats'
import {
  GUIDE_SKIP_CAP,
  MAINLINE_TASKS,
  blankSkipMask,
  mainlineStepOf,
  payMainlineReward,
  skipMaskHas,
  skipMaskSet,
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
  it('follows the confirmed list in order', () => {
    expect(ids()).toEqual([
      'recruit',
      'autoHerb',
      'herbQueue',
      'fuse',
      'combat',
      'level2',
      'autoLine',
      'alchemy',
      'potionInstall',
      'potionUse',
      'level3',
      'firstBlood',
      'explore',
      'level4',
      'alchemy3',
      'slotsFull',
      'level5',
      'blueWorker',
      'level6',
      'huntStart',
      'market',
      'huntHaul',
      'pawn',
      'timed',
      'level7',
      'herbSickle',
      'level8',
      'cookStart',
      'restFood',
      'dungeon',
      'stockFood',
      'chest',
      'dungeonBoth',
      'level9',
      'huntWolf',
      'marketHigh',
      'level10',
      'herbAssign',
      'herb',
      'herbCounter',
      'level11',
      'tech',
      'techTabs',
      'cookStew',
      'level12',
      'marketSlot',
      'chapter2',
      'level13',
      'beast',
      'beastManual',
      'boneSoup',
      'level14',
      'cyanWorker',
      'dungeonGold',
      'level15',
      'tech8',
      'chapter3',
      'huntDeer',
      'level16',
      'mining',
      'crystal',
      'miningIron',
      'level17',
      'herbPayout',
      'oreDeal',
      'veteran',
      'level18',
      'inscribe',
      'runeCraft',
      'rune',
      'runeWin',
      'stationsOpen',
      'level19',
      'miningMithril',
      'inscribe5',
      'level20',
      'treasure',
      'scout',
      'raid',
      'guard',
      'feast',
      'chapter5',
      'banner1',
      'level22',
      'purpleWorker',
      'banner3',
      'level25',
      'chapter8',
      'stations10',
      'level28',
      'banner5',
      'level30',
    ])
    const byId = new Map(MAINLINE_TASKS.map((row) => [row.id, row]))
    expect(byId.get('recruit')?.reward).toEqual({ gold: 20, xp: 20 })
    expect(byId.get('market')?.reward).toEqual({ gold: 20, xp: 20 })
    expect(byId.get('herb')?.goal).toBe('割到一株珍贵草药')
    expect(byId.get('herb')?.reward).toEqual({ probes: 1, xp: 20 })
    expect(byId.get('level6')?.reward).toEqual({ gold: 20 })
    expect(byId.get('level22')?.reward).toEqual({ diamonds: 24, xp: 10 })
    expect(byId.get('level30')?.title).toBe('升到酋长 30 级')
  })

  it('shows the next level task once the open steps are done, and inserts that level’s group after it', () => {
    const save = createSave()
    save.guideQuestStep = mainlineStepOf('level6')
    save.knightLevel = 1
    expect(guideQuestView(save)?.waiting).toBe(true)
    expect(guideQuestView(save)?.goal).toBe('升到酋长 6 级（开放狩猎、集市）')
    expect(guideQuestView(save)?.unlockNote).toBe('完成后开启：狩猎、集市')
    expect(claimGuideQuest(save).ok).toBe(false)
    expect(isModuleUnlocked(save, 'hunting')).toBe(false)

    save.knightLevel = 6
    expect(isModuleUnlocked(save, 'hunting')).toBe(false)
    expect(guideQuestView(save)?.claimable).toBe(true)
    expect(claimGuideQuest(save)).toEqual({ ok: true, message: '金币 +20' })
    expect(save.moduleUnlockQueue).toEqual([])
    expect(isModuleUnlocked(save, 'hunting')).toBe(true)
    expect(isModuleUnlocked(save, 'market')).toBe(true)
    expect(isModuleUnlocked(save, 'cooking')).toBe(false)
    expect(save.guideQuestStep).toBe(mainlineStepOf('huntStart'))
    expect(guideQuestView(save)?.taskId).toBe('huntStart')
    expect(save.knightXp).toBe(0)
  })
})

describe('mainline sticky completion and rewards', () => {
  it('keeps a cleared condition claimable after the worker leaves and the board refreshes', () => {
    const save = createSave()
    save.knightLevel = 6
    grantOpenedModules(save, ['hunting'])
    spawnWorker(save)
    expect(assignWorker(save, save.workers[0].id, 'hunting').ok).toBe(true)
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
    expect(claimGuideQuest(market)).toEqual({ ok: true, message: '金币 +20、酋长经验 +20' })
    expect(market.gold).toBe(gold + 20)
    expect(market.knightXp).toBe(20)
  })

  it('does not latch a task before it becomes the current one', () => {
    const save = createSave()
    save.knightLevel = 6
    grantOpenedModules(save, ['hunting'])
    spawnWorker(save)
    expect(assignWorker(save, save.workers[0].id, 'hunting').ok).toBe(true)
    save.guideQuestStep = 1
    syncGuideQuestMet(save)
    save.workers[0].assignment = null
    save.guideQuestStep = mainlineStepOf('huntStart')
    expect(guideQuestProgressAt(save, save.guideQuestStep)).toBe(0)
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
    long.guideQuestStep = mainlineStepOf('chapter3')
    long.mainChapter = 3
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

describe('mainline hydrate', () => {
  it('does not skip tasks a high-level save already satisfied', () => {
    const save = createSave()
    save.knightLevel = 20
    save.guideQuestRev = 6
    save.guideQuestStep = 1
    spawnWorker(save)
    spawnWorker(save)
    save.workers[0].assignment = 'herbalism'
    save.stations.alchemy.completed = 1
    save.departCount = 1
    const gold = save.gold
    hydrateGuideQuestFields(save, save)
    expect(save.guideQuestRev).toBe(9)
    expect(save.gold).toBe(gold)
    expect(save.guideQuestStep).toBe(1)
    expect(guideQuestView(save)?.taskId).toBe('recruit')
    expect(save.guideQuestSkipped).not.toContain('tech')
  })

  it('counts a market board deal, a treasure haul, a raid win, and a rune fight', () => {
    const market = createSave()
    market.guideQuestStep = mainlineStepOf('market')
    market.mainLootClaims = 3
    expect(guideQuestProgressAt(market, market.guideQuestStep)).toBe(0)
    noteMarketDeal(market, pawn())
    expect(guideQuestProgressAt(market, market.guideQuestStep)).toBe(1)

    const haul = createSave()
    haul.guideQuestStep = mainlineStepOf('treasure')
    expect(guideQuestProgressAt(haul, haul.guideQuestStep)).toBe(0)
    haul.treasureMines.haul = { wildCrystal: 1 }
    expect(guideQuestProgressAt(haul, haul.guideQuestStep)).toBe(1)

    const raid = createSave()
    raid.guideQuestStep = mainlineStepOf('raid')
    expect(guideQuestProgressAt(raid, raid.guideQuestStep)).toBe(0)
    noteTreasureRaid(raid)
    expect(guideQuestProgressAt(raid, raid.guideQuestStep)).toBe(1)

    const rune = createSave()
    rune.guideQuestStep = mainlineStepOf('runeWin')
    noteRuneFight(rune, { w1: 'runeSharp' })
    expect(guideQuestProgressAt(rune, rune.guideQuestStep)).toBe(1)

    const sickle = createSave()
    sickle.guideQuestStep = mainlineStepOf('herbSickle')
    sickle.stations.herbalism.stationLevel = 5
    expect(guideQuestProgressAt(sickle, sickle.guideQuestStep)).toBe(1)
  })

  it('stores a skip bit for step 90', () => {
    const mask = blankSkipMask()
    skipMaskSet(mask, GUIDE_SKIP_CAP)
    expect(skipMaskHas(mask, GUIDE_SKIP_CAP)).toBe(true)
    expect(skipMaskHas(mask, 31)).toBe(false)
    expect(mask[2]).toBeGreaterThan(0)
  })

  it('does not open the market or invent a deal from the old pawn flag', () => {
    const raw = createSave()
    raw.knightLevel = 6
    raw.starterCopperPawnDone = true
    raw.guideQuestRev = 6
    const loaded = hydrateLoadedSave(raw as unknown as Save)
    expect(loaded?.starterCopperPawnDone).toBe(true)
    expect(loaded?.guideQuestStats.marketDeals).toBe(0)
    expect(isModuleUnlocked(loaded!, 'market')).toBe(false)
  })

  it('drops a save whose version is missing', () => {
    const raw = createSave()
    delete (raw as { saveVersion?: number }).saveVersion
    expect(hydrateLoadedSave(raw)).toBeNull()
  })
})
