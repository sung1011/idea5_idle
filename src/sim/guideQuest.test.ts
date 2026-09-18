import { describe, expect, it } from 'vitest'
import { createSave } from './createSave'
import {
  isStarterCopperPawn,
  makeStarterCopperPawn,
  pawnMerchant,
  STARTER_PAWN_ITEM_ID,
  STARTER_PAWN_QTY,
} from './encounters'
import {
  GUIDE_QUEST_DONE_STEP,
  GUIDE_QUEST_GOLD,
  GUIDE_QUEST_STEPS,
  claimGuideQuest,
  firstIncompleteGuideQuestStep,
  guideQuestFlashId,
  guideQuestProgressAt,
  guideQuestView,
  hydrateGuideQuestFields,
  isGuideQuestFlash,
  isGuideQuestVisible,
  normalizeGuideQuestStep,
} from './guideQuest'
import { recruitWorker, spawnWorker } from './recruit'
import { RECRUIT_COST } from './tables'
import { hydrateLoadedSave } from '../ui/saveGame'
import type { Save } from './types'

function pawnStep(save: Save) {
  save.guideQuestStep = 3
  save.bank[STARTER_PAWN_ITEM_ID] = STARTER_PAWN_QTY
  expect(pawnMerchant(save, 0).ok).toBe(true)
}

describe('guideQuest normalize and hydrate', () => {
  it('starts a new save on step 1 with the overlay visible', () => {
    const save = createSave()
    expect(save.guideQuestStep).toBe(1)
    expect(save.starterCopperPawnDone).toBe(false)
    expect(isGuideQuestVisible(save)).toBe(true)
    expect(guideQuestProgressAt(save, 1)).toBe(0)
    const view = guideQuestView(save)
    expect(view).toEqual({
      step: 1,
      title: '主线 · 1/5',
      goal: '在工人中抽取工人（≥1）',
      progress: 0,
      progressLabel: '进度 0/1',
      claimable: false,
      fillPct: 0,
    })
    expect(normalizeGuideQuestStep(undefined)).toBe(1)
    expect(normalizeGuideQuestStep(0)).toBe(1)
    expect(normalizeGuideQuestStep(2.8)).toBe(2)
    expect(normalizeGuideQuestStep(9)).toBe(GUIDE_QUEST_DONE_STEP)
  })

  it('hydrates a missing old save to the first incomplete step and hides when all five are done', () => {
    const mid = createSave()
    spawnWorker(mid)
    mid.stations.mining.completed = 2
    const { guideQuestStep: _step, starterCopperPawnDone: _pawn, ...omitted } = mid
    hydrateGuideQuestFields(omitted as Save, omitted)
    expect((omitted as Save).guideQuestStep).toBe(3)
    expect((omitted as Save).starterCopperPawnDone).toBe(false)

    const veteran = createSave()
    spawnWorker(veteran)
    veteran.stations.mining.completed = 1
    veteran.exploreCount = 2
    veteran.techLevels = { pathOutpost: 1 }
    veteran.unlockedTechIds = ['pathOutpost']
    const pawn = veteran.encounters[0]
    if (pawn.kind === 'pawn') pawn.completed = true
    const { guideQuestStep: _vs, starterCopperPawnDone: _vp, ...vetRaw } = veteran
    hydrateGuideQuestFields(vetRaw as Save, vetRaw)
    expect((vetRaw as Save).guideQuestStep).toBe(GUIDE_QUEST_DONE_STEP)
    expect((vetRaw as Save).starterCopperPawnDone).toBe(true)
    expect(isGuideQuestVisible(vetRaw as Save)).toBe(false)
    expect(guideQuestView(vetRaw as Save)).toBeNull()
  })

  it('infers starter copper pawn done when an old save already explored it away', () => {
    const save = createSave()
    save.exploreCount = 1
    save.encounters = [
      {
        kind: 'enemy',
        id: 'after-explore',
        label: '试敌',
        quality: 'green',
        needs: { meal: 1 },
        lootGold: 6,
        departed: false,
        combat: null,
        lootClaimed: false,
        enemyRank: 'minion',
        weaknesses: ['fire'],
        revealedWeaknesses: [],
      },
    ]
    const { starterCopperPawnDone: _done, ...raw } = save
    hydrateGuideQuestFields(raw as Save, raw)
    expect((raw as Save).starterCopperPawnDone).toBe(true)
  })

  it('does not infer pawn done on a new save that still has the opening pawn', () => {
    const save = createSave()
    const { starterCopperPawnDone: _done, ...raw } = save
    hydrateGuideQuestFields(raw as Save, raw)
    expect((raw as Save).starterCopperPawnDone).toBe(false)
  })

  it('marks pawn done when the opening copper pawn is already completed on the board', () => {
    const save = createSave()
    const pawn = save.encounters[0]
    expect(pawn.kind).toBe('pawn')
    if (pawn.kind === 'pawn') pawn.completed = true
    save.starterCopperPawnDone = false
    hydrateGuideQuestFields(save, save)
    expect(save.starterCopperPawnDone).toBe(true)
    expect(guideQuestProgressAt(save, 3)).toBe(1)
  })

  it('round-trips through hydrateLoadedSave when fields are missing', () => {
    const raw = {
      ...createSave(),
      guideQuestStep: undefined,
      starterCopperPawnDone: undefined,
    }
    const loaded = hydrateLoadedSave(raw as unknown)
    expect(loaded?.guideQuestStep).toBe(1)
    expect(loaded?.starterCopperPawnDone).toBe(false)

    const dirty = hydrateLoadedSave({
      ...createSave(),
      guideQuestStep: 0,
      starterCopperPawnDone: 'yes',
    } as unknown)
    expect(dirty?.guideQuestStep).toBe(1)
    expect(dirty?.starterCopperPawnDone).toBe(false)
  })
})

describe('guideQuest steps and claim', () => {
  it('walks the five steps, pays 20 gold each claim, then hides the overlay', () => {
    const save = createSave()
    const gold0 = save.gold
    expect(claimGuideQuest(save).ok).toBe(false)
    expect(save.guideQuestStep).toBe(1)

    expect(recruitWorker(save).ok).toBe(true)
    expect(guideQuestProgressAt(save, 1)).toBe(1)
    const v1 = guideQuestView(save)
    expect(v1?.claimable).toBe(true)
    expect(v1?.progressLabel).toBe('进度 1/1 · 可领')
    expect(v1?.fillPct).toBe(100)
    expect(claimGuideQuest(save)).toEqual({ ok: true, message: `金币 +${GUIDE_QUEST_GOLD}` })
    expect(save.guideQuestStep).toBe(2)
    expect(save.gold).toBe(gold0 - RECRUIT_COST + GUIDE_QUEST_GOLD)

    expect(guideQuestProgressAt(save, 2)).toBe(0)
    expect(claimGuideQuest(save).ok).toBe(false)
    save.stations.mining.completed = 1
    expect(guideQuestView(save)?.goal).toBe('在工坊中完成一次采矿产出')
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(save.guideQuestStep).toBe(3)
    expect(save.gold).toBe(gold0 - RECRUIT_COST + GUIDE_QUEST_GOLD * 2)

    pawnStep(save)
    expect(save.starterCopperPawnDone).toBe(true)
    expect(guideQuestView(save)?.goal).toBe('在主线中成交开局铜矿当铺单')
    const goldAfterPawn = save.gold
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(save.guideQuestStep).toBe(4)
    expect(save.gold).toBe(goldAfterPawn + GUIDE_QUEST_GOLD)

    save.encounters = [makeStarterCopperPawn(1, 0)]
    expect(save.starterCopperPawnDone).toBe(true)
    expect(guideQuestProgressAt(save, 3)).toBe(1)

    save.exploreCount = 1
    expect(guideQuestView(save)?.goal).toBe('在主线中成功探索一次')
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(save.guideQuestStep).toBe(5)

    save.techLevels = { pathOutpost: 1 }
    save.unlockedTechIds = ['pathOutpost']
    expect(guideQuestView(save)?.goal).toBe('在科技中点亮探路哨岗')
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(save.guideQuestStep).toBe(GUIDE_QUEST_DONE_STEP)
    expect(save.gold).toBe(goldAfterPawn + GUIDE_QUEST_GOLD * 3)
    expect(isGuideQuestVisible(save)).toBe(false)
    expect(guideQuestView(save)).toBeNull()
    expect(claimGuideQuest(save)).toEqual({ ok: false, reason: '新手任务已完成' })
  })

  it('does not treat a regular pawn as the opening copper pawn', () => {
    const save = createSave()
    save.guideQuestStep = 3
    save.encounters = [
      {
        kind: 'pawn',
        id: 'merchantPawn-other',
        label: '兵器当',
        quality: 'green',
        pawnWants: { weapon: 1 },
        completed: true,
      },
    ]
    expect(guideQuestProgressAt(save, 3)).toBe(0)
    expect(firstIncompleteGuideQuestStep(save)).toBe(1)
  })
})

describe('guideQuest flash target', () => {
  it('flashes only the current unfinished step and stops when claimable', () => {
    const save = createSave()
    expect(guideQuestFlashId(save)).toBe('recruit')
    expect(isGuideQuestFlash(save, 'recruit')).toBe(true)
    expect(isGuideQuestFlash(save, 'mining')).toBe(false)

    expect(recruitWorker(save).ok).toBe(true)
    expect(guideQuestFlashId(save)).toBeNull()
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(guideQuestFlashId(save)).toBe('mining')

    save.stations.mining.completed = 1
    expect(guideQuestFlashId(save)).toBeNull()
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(guideQuestFlashId(save)).toBe('starterPawn')
    expect(isStarterCopperPawn(save.encounters[0])).toBe(true)

    pawnStep(save)
    expect(guideQuestFlashId(save)).toBeNull()
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(guideQuestFlashId(save)).toBe('explore')

    save.exploreCount = 1
    expect(guideQuestFlashId(save)).toBeNull()
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(guideQuestFlashId(save)).toBe('pathOutpost')

    save.techLevels = { pathOutpost: 1 }
    save.unlockedTechIds = ['pathOutpost']
    expect(guideQuestFlashId(save)).toBeNull()
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(guideQuestFlashId(save)).toBeNull()
  })

  it('does not flash a regular pawn as the opening copper deal', () => {
    const save = createSave()
    save.guideQuestStep = 3
    save.encounters = [
      {
        kind: 'pawn',
        id: 'merchantPawn-other',
        label: '兵器当',
        quality: 'green',
        pawnWants: { weapon: 1 },
        completed: false,
      },
    ]
    expect(guideQuestFlashId(save)).toBe('starterPawn')
    expect(isStarterCopperPawn(save.encounters[0])).toBe(false)
  })
})
