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
    expect(moduleLockedTip('tech')).toBe('完成主线「升到11级：今晚能点一项科技」后开启')
    expect(moduleLockedTip('hunting')).toBe('完成主线「升到6级：今晚能出门打猎」后开启')
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
    expect(save.openedModules).not.toContain('herb')
    expect(isModuleUnlocked(save, 'herb')).toBe(false)
    expect(isModuleUnlocked(save, 'beast')).toBe(false)
  })

  it('recalls a worker left on a station the mainline has not opened', () => {
    const staffed = createSave()
    spawnWorker(staffed)
    staffed.workers[0].assignment = 'mining'
    hydrateModuleUnlocks(staffed)
    expect(isStationUnlocked(staffed, 'mining')).toBe(false)
    expect(staffed.workers[0].assignment).toBeNull()

    const locked = createSave()
    spawnWorker(locked)
    locked.workers[0].assignment = 'mining'
    locked.openedModules = []
    expect(recallCrewFromLockedStations(locked)).toBe(1)
    expect(locked.workers[0].assignment).toBeNull()
    expect(assignWorker(locked, locked.workers[0].id, 'mining')).toEqual({
      ok: false,
      reason: '完成主线「升到16级：今晚能开矿」后开启',
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

  it('does not open modules from played traces or knight level alone', () => {
    const raw = createSave()
    raw.knightLevel = 3
    raw.techLevels = { pathOutpost: 1 }
    raw.dungeon.attemptsUsedById = { [DUNGEON_JAILER_ID]: DUNGEON_ATTEMPTS_PER_DAY }
    raw.beastPvp.lastRewardText = '兽骨'
    raw.workers = []
    raw.moduleUnlockQueue = ['treasure']
    const loaded = hydrateLoadedSave(raw)
    expect(isModuleUnlocked(loaded!, 'tech')).toBe(false)
    expect(isModuleUnlocked(loaded!, 'dungeon')).toBe(false)
    expect(isModuleUnlocked(loaded!, 'beast')).toBe(false)
    expect(loaded?.moduleUnlockQueue).toEqual([])

    const veteran = createSave()
    veteran.knightLevel = 16
    delete (veteran as { mainlineUnlockRev?: number }).mainlineUnlockRev
    veteran.moduleUnlockQueue = ['mining']
    const kept = hydrateLoadedSave(veteran)
    expect(isModuleUnlocked(kept!, 'mining')).toBe(false)
    expect(isModuleUnlocked(kept!, 'inscription')).toBe(false)
    expect(kept?.moduleUnlockQueue).toEqual([])
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
