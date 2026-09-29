import { describe, expect, it } from 'vitest'
import { assignWorker } from './assign'
import { createSave } from './createSave'
import {
  GUIDE_OLD_DONE_STEP,
  GUIDE_QUEST_GOLD,
  GUIDE_QUEST_REV,
  claimGuideQuest,
  guideQuestView,
  hydrateGuideQuestFields,
} from './guideQuest'
import { grantStationXp } from './stationProgress'
import { xpToNextLevel } from './tables'
import {
  hydrateModuleUnlocks,
  isModuleUnlocked,
  moduleLockedTip,
  queueModuleUnlocks,
  recallCrewFromLockedStations,
} from './moduleUnlock'
import { isStationUnlocked } from './stationUnlock'
import { spawnWorker } from './recruit'
import { DUNGEON_ATTEMPTS_PER_DAY, DUNGEON_JAILER_ID } from './dungeonTables'
import { hydrateLoadedSave } from '../ui/saveGame'

describe('module unlock by knight level', () => {
  it('opens modules on the knight table and keeps played ones', () => {
    const save = createSave()
    expect(isModuleUnlocked(save, 'tech')).toBe(false)
    expect(isModuleUnlocked(save, 'market')).toBe(false)
    expect(isModuleUnlocked(save, 'herb')).toBe(false)
    expect(moduleLockedTip('tech')).toBe('酋长 11 级开放科技')
    save.knightLevel = 8
    expect(isModuleUnlocked(save, 'tech')).toBe(false)
    expect(isModuleUnlocked(save, 'market')).toBe(true)
    expect(isModuleUnlocked(save, 'dungeon')).toBe(true)
    expect(isModuleUnlocked(save, 'herb')).toBe(false)
    save.knightLevel = 11
    expect(isModuleUnlocked(save, 'tech')).toBe(true)
    save.knightLevel = 1
    save.herbPvp.playerScore = 12
    hydrateModuleUnlocks(save)
    expect(save.openedModules).toContain('herb')
    expect(isModuleUnlocked(save, 'herb')).toBe(true)
    expect(isModuleUnlocked(save, 'beast')).toBe(false)
  })

  it('keeps a staffed station open and recalls a worker on a still-locked station', () => {
    const staffed = createSave()
    spawnWorker(staffed)
    staffed.workers[0].assignment = 'mining'
    hydrateModuleUnlocks(staffed)
    expect(isStationUnlocked(staffed, 'mining')).toBe(true)
    expect(staffed.workers[0].assignment).toBe('mining')

    const locked = createSave()
    spawnWorker(locked)
    locked.workers[0].assignment = 'mining'
    locked.openedModules = []
    expect(recallCrewFromLockedStations(locked)).toBe(1)
    expect(locked.workers[0].assignment).toBeNull()
    expect(assignWorker(locked, locked.workers[0].id, 'mining')).toEqual({
      ok: false,
      reason: '酋长 16 级开放采矿',
    })
  })

  it('queues a card when the chief crosses several gates at once', () => {
    const save = createSave()
    save.knightLevel = 1
    queueModuleUnlocks(save, 1, 8)
    expect(save.moduleUnlockQueue).toEqual(['hunting', 'market', 'cooking', 'restFood', 'dungeon'])
    const later = createSave()
    later.knightLevel = 10
    queueModuleUnlocks(later, 10, 11)
    expect(later.moduleUnlockQueue).toEqual(['tech'])
    grantStationXp(save, 'herbalism', xpToNextLevel(1) * 3)
    expect(save.knightLevel).toBeGreaterThan(1)
    expect(save.moduleUnlockQueue.length).toBeGreaterThan(0)
  })

  it('hydrates an old played save without locking what they already used', () => {
    const raw = createSave()
    raw.knightLevel = 3
    raw.techLevels = { pathOutpost: 1 }
    raw.dungeon.attemptsUsedById = { [DUNGEON_JAILER_ID]: DUNGEON_ATTEMPTS_PER_DAY }
    raw.beastPvp.lastRewardText = '兽骨'
    raw.workers = []
    const loaded = hydrateLoadedSave(raw)
    expect(isModuleUnlocked(loaded!, 'tech')).toBe(true)
    expect(isModuleUnlocked(loaded!, 'dungeon')).toBe(true)
    expect(isModuleUnlocked(loaded!, 'beast')).toBe(true)
    expect(isModuleUnlocked(loaded!, 'treasure')).toBe(false)
    expect(loaded?.moduleUnlockQueue).toEqual([])
  })
})

describe('segmented guide rewards', () => {
  it('does not pay again for an already claimed old step or a step already done', () => {
    const done = createSave()
    const gold = done.gold
    done.guideQuestStep = GUIDE_OLD_DONE_STEP
    done.guideQuestRev = 5
    done.techLevels = { pathOutpost: 1 }
    hydrateGuideQuestFields(done, done)
    expect(done.guideQuestRev).toBe(GUIDE_QUEST_REV)
    expect(done.gold).toBe(gold)
    expect(guideQuestView(done)?.goal).not.toBe('抽取苦工 2 次')
    expect(guideQuestView(done)?.goal).not.toBe('点亮一项科技')
    expect(claimGuideQuest(done).ok).toBe(false)
    expect(done.gold).toBe(gold)

    const fresh = createSave()
    fresh.guideQuestRev = GUIDE_QUEST_REV
    fresh.stations.alchemy.completed = 1
    fresh.guideQuestStep = 4
    const before = fresh.gold
    expect(claimGuideQuest(fresh)).toEqual({ ok: true, message: `金币 +${GUIDE_QUEST_GOLD}` })
    expect(fresh.gold).toBe(before + GUIDE_QUEST_GOLD)
    expect(claimGuideQuest(fresh).ok).toBe(false)
    expect(fresh.gold).toBe(before + GUIDE_QUEST_GOLD)
  })
})
