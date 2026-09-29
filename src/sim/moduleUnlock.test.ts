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
import { mainlineStepOf } from './mainlineQuest'
import {
  grantOpenedModules,
  hydrateModuleUnlocks,
  isModuleUnlocked,
  markModuleSeen,
  moduleLockedTip,
  moduleNoticeOn,
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
    expect(moduleLockedTip('tech')).toBe('完成主线「升到酋长 11 级（开放科技）」后开启')
    expect(moduleLockedTip('hunting')).toBe('完成主线「升到酋长 6 级（开放狩猎、集市）」后开启')
    save.knightLevel = 8
    expect(isModuleUnlocked(save, 'market')).toBe(false)
    expect(isModuleUnlocked(save, 'dungeon')).toBe(false)
    save.guideQuestStep = mainlineStepOf('huntStart')
    expect(isModuleUnlocked(save, 'hunting')).toBe(true)
    expect(isModuleUnlocked(save, 'market')).toBe(true)
    expect(isModuleUnlocked(save, 'cooking')).toBe(false)
    save.guideQuestSkipped = ['level8']
    expect(isModuleUnlocked(save, 'cooking')).toBe(true)
    expect(isModuleUnlocked(save, 'dungeon')).toBe(true)
    expect(isModuleUnlocked(save, 'herb')).toBe(false)
    save.knightLevel = 11
    expect(isModuleUnlocked(save, 'tech')).toBe(false)
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
      reason: '完成主线「升到酋长 16 级（开放采矿）」后开启',
    })
  })

  it('drops a queued unlock card and shows a notice until the entry is opened', () => {
    const save = createSave()
    save.moduleUnlockQueue = ['hunting', 'market']
    save.guideQuestStep = mainlineStepOf('huntStart')
    expect(moduleNoticeOn(save, 'hunting')).toBe(true)
    expect(markModuleSeen(save, 'hunting')).toBe(true)
    expect(moduleNoticeOn(save, 'hunting')).toBe(false)
    expect(markModuleSeen(save, 'hunting')).toBe(false)
    grantOpenedModules(save, ['market'])
    expect(moduleNoticeOn(save, 'market')).toBe(true)
    hydrateModuleUnlocks(save)
    expect(save.moduleUnlockQueue).toEqual([])
    expect(moduleNoticeOn(save, 'market')).toBe(true)
    expect(isModuleUnlocked(save, 'tech')).toBe(false)
  })

  it('hydrates an old played save without locking what they already used', () => {
    const raw = createSave()
    raw.knightLevel = 3
    raw.techLevels = { pathOutpost: 1 }
    raw.dungeon.attemptsUsedById = { [DUNGEON_JAILER_ID]: DUNGEON_ATTEMPTS_PER_DAY }
    raw.beastPvp.lastRewardText = '兽骨'
    raw.workers = []
    raw.moduleUnlockQueue = ['treasure']
    const loaded = hydrateLoadedSave(raw)
    expect(isModuleUnlocked(loaded!, 'tech')).toBe(true)
    expect(isModuleUnlocked(loaded!, 'dungeon')).toBe(true)
    expect(isModuleUnlocked(loaded!, 'beast')).toBe(true)
    expect(isModuleUnlocked(loaded!, 'treasure')).toBe(false)
    expect(moduleNoticeOn(loaded!, 'tech')).toBe(false)
    expect(loaded?.moduleUnlockQueue).toEqual([])

    const veteran = createSave()
    veteran.knightLevel = 16
    delete (veteran as { mainlineUnlockRev?: number }).mainlineUnlockRev
    veteran.moduleUnlockQueue = ['mining']
    const kept = hydrateLoadedSave(veteran)
    expect(isModuleUnlocked(kept!, 'mining')).toBe(true)
    expect(isModuleUnlocked(kept!, 'inscription')).toBe(false)
    expect(moduleNoticeOn(kept!, 'mining')).toBe(false)
    expect(kept?.moduleUnlockQueue).toEqual([])
    expect(kept?.mainlineUnlockRev).toBe(1)
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
    fresh.guideQuestStep = mainlineStepOf('alchemy')
    const before = fresh.gold
    expect(claimGuideQuest(fresh)).toEqual({ ok: true, message: `金币 +${GUIDE_QUEST_GOLD}、酋长经验 +20` })
    expect(fresh.gold).toBe(before + GUIDE_QUEST_GOLD)
    expect(claimGuideQuest(fresh).ok).toBe(false)
    expect(fresh.gold).toBe(before + GUIDE_QUEST_GOLD)
  })
})
