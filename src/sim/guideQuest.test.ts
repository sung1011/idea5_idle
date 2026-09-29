import { describe, expect, it } from 'vitest'
import { assignRestingToFirstEmpty } from './assign'
import { fighterRecommendLabel } from './combatAttrs'
import { createSave } from './createSave'
import { fuseRestWorkers } from './fuse'
import {
  GUIDE_QUEST_DONE_STEP,
  GUIDE_QUEST_GOLD,
  GUIDE_QUEST_PHASE3_START,
  GUIDE_AUTO_HERB_CLOSED_GOAL,
  GUIDE_AUTO_HERB_OPEN_GOAL,
  GUIDE_FUSE_DRAG_GOAL,
  GUIDE_FUSE_EMPTY_GOAL,
  GUIDE_FUSE_OPEN_GOAL,
  GUIDE_RECRUIT_CLOSED_GOAL,
  GUIDE_RECRUIT_OPEN_GOAL,
  GUIDE_QUEST_REV,
  GUIDE_QUEST_STEPS,
  claimGuideQuest,
  firstIncompleteGuideQuestStep,
  guideAlchemyCardFlash,
  guideAlchemyProgressFlash,
  guideFuseCue,
  guideFuseFlashStations,
  guideQuestFlashId,
  guideQuestProgressAt,
  guideQuestView,
  hasStartedBattlefieldCombat,
  isGuideQuestPhase2Open,
  hydrateGuideQuestFields,
  isGuideQuestCombatFlash,
  isGuideQuestFlash,
  isGuideQuestRuneFlash,
  isGuideQuestVisible,
  markGuideQuestRuneOpened,
  normalizeGuideQuestStep,
} from './guideQuest'
import { selectRestFood } from './food'
import { mainlineStepOf } from './mainlineQuest'
import { installPotionSlot } from './potionSlots'
import { usePotionSlot } from './potions'
import { recruitWorker, spawnWorker } from './recruit'
import { RECRUIT_COST, START_DIAMONDS } from './tables'
import { hydrateLoadedSave } from '../ui/saveGame'
import type { EnemyEncounter, Save } from './types'

function markCombatStarted(save: Save) {
  const enc = save.encounters[0] as EnemyEncounter
  enc.departed = true
  enc.combat = {
    startedAt: 1,
    timeoutAt: 10,
    workerIds: [],
    workers: [],
    enemy: { id: 'e', label: '敌', hp: 20, hpMax: 20, atk: 1, spd: 10, nextActAt: 2 },
    logs: [],
    outcome: null,
  }
  enc.lootClaimed = false
}

describe('guideQuest normalize and hydrate', () => {
  it('starts a new save on step 1 with the overlay visible', () => {
    const save = createSave()
    expect(save.guideQuestStep).toBe(1)
    expect(save.guideQuestRev).toBe(GUIDE_QUEST_REV)
    expect(save.guideQuestPotionUsed).toBe(false)
    expect(save.guideQuestRuneOpened).toBe(false)
    expect(isGuideQuestVisible(save)).toBe(true)
    expect(guideQuestProgressAt(save, 1)).toBe(0)
    const view = guideQuestView(save)
    expect(view).toEqual({
      step: 1,
      phase: 1,
      phaseStep: 1,
      phaseTotal: 5,
      title: '招兵',
      taskId: 'recruit',
      goal: GUIDE_RECRUIT_CLOSED_GOAL,
      rewardLabel: '金币 +20、酋长经验 +20',
      progress: 0,
      progressLabel: '进度 0/2',
      claimable: false,
      fillPct: 0,
      waiting: false,
    })
    expect(normalizeGuideQuestStep(undefined)).toBe(1)
    expect(normalizeGuideQuestStep(0)).toBe(1)
    expect(normalizeGuideQuestStep(2.8)).toBe(2)
    expect(normalizeGuideQuestStep(9)).toBe(9)
    expect(normalizeGuideQuestStep(GUIDE_QUEST_STEPS)).toBe(GUIDE_QUEST_STEPS)
    expect(normalizeGuideQuestStep(GUIDE_QUEST_DONE_STEP)).toBe(GUIDE_QUEST_DONE_STEP)
  })

  it('shows phase 2 at knight 1 once the main steps are claimed', () => {
    const save = createSave()
    save.guideQuestStep = mainlineStepOf('potionInstall')
    expect(save.knightLevel).toBe(1)
    expect(isGuideQuestPhase2Open(save)).toBe(true)
    expect(isGuideQuestVisible(save)).toBe(true)
    const view = guideQuestView(save)
    expect(view?.title).toBe('装药')
    expect(view?.goal).toBe('任一药剂槽装了药')
    expect(guideQuestFlashId(save)).toBe('potionInstall')
  })

  it('migrates an old 5-step save onto the first incomplete new step', () => {
    const once = createSave()
    spawnWorker(once)
    once.stations.mining.completed = 2
    const { guideQuestStep: _onceStep, guideQuestRev: _onceRev, starterCopperPawnDone: _pawn, ...onceRaw } =
      once
    hydrateGuideQuestFields(onceRaw as Save, onceRaw)
    expect((onceRaw as Save).guideQuestStep).toBe(1)
    expect((onceRaw as Save).guideQuestRev).toBe(GUIDE_QUEST_REV)
    expect(guideQuestProgressAt(onceRaw as Save, 1)).toBe(0)

    const mid = createSave()
    spawnWorker(mid)
    spawnWorker(mid)
    mid.stations.mining.completed = 2
    const { guideQuestStep: _step, guideQuestRev: _rev, ...omitted } = mid
    hydrateGuideQuestFields(omitted as Save, omitted)
    expect((omitted as Save).guideQuestStep).toBe(2)
    expect((omitted as Save).guideQuestRev).toBe(GUIDE_QUEST_REV)

    const veteran = createSave()
    spawnWorker(veteran)
    veteran.workers[0].assignment = 'herbalism'
    spawnWorker(veteran)
    veteran.workers[1].qualityTier = 2
    markCombatStarted(veteran)
    veteran.stations.alchemy.completed = 1
    veteran.potionSlots[0] = 'salve'
    veteran.guideQuestPotionUsed = true
    veteran.techLevels = { pathOutpost: 1 }
    const { guideQuestStep: _vs, guideQuestRev: _vr, ...vetRaw } = veteran
    hydrateGuideQuestFields(vetRaw as Save, vetRaw)
    expect((vetRaw as Save).guideQuestStep).toBe(mainlineStepOf('level2'))
    expect(guideQuestView(vetRaw as Save)?.waiting).toBe(true)
    expect(guideQuestView(vetRaw as Save)?.goal).toBe('升到酋长 2 级')
    expect((vetRaw as Save).guideQuestRuneOpened).toBe(false)

    const fed = createSave()
    spawnWorker(fed)
    fed.workers[0].assignment = 'herbalism'
    spawnWorker(fed)
    fed.workers[1].qualityTier = 2
    fed.restFoodId = 'meal'
    markCombatStarted(fed)
    fed.stations.alchemy.completed = 1
    fed.potionSlots[0] = 'salve'
    fed.guideQuestPotionUsed = true
    fed.techLevels = { pathOutpost: 1 }
    const { guideQuestStep: _fs, guideQuestRev: _fr, ...fedRaw } = fed
    hydrateGuideQuestFields(fedRaw as Save, fedRaw)
    expect((fedRaw as Save).guideQuestStep).toBe(mainlineStepOf('level2'))
    expect(isGuideQuestVisible(fedRaw as Save)).toBe(true)
    expect(guideQuestView(fedRaw as Save)?.goal).toBe('升到酋长 2 级')
  })

  it('does not auto-complete recruit step when an old rev-2 save only recruited once', () => {
    const save = createSave()
    spawnWorker(save)
    save.guideQuestStep = 2
    save.guideQuestRev = 2
    hydrateGuideQuestFields(save, save)
    expect(save.guideQuestStep).toBe(1)
    expect(save.guideQuestRev).toBe(GUIDE_QUEST_REV)
    expect(guideQuestProgressAt(save, 1)).toBe(0)
    expect(guideQuestView(save)?.progressLabel).toBe('进度 1/2')
    expect(guideQuestView(save)?.claimable).toBe(false)
    expect(claimGuideQuest(save).ok).toBe(false)
  })

  it('replays a lower rev onto the first incomplete step of the nine-step table', () => {
    const save = createSave()
    spawnWorker(save)
    spawnWorker(save)
    save.workers[0].assignment = 'herbalism'
    save.workers[1].qualityTier = 2
    save.guideQuestStep = 4
    save.guideQuestRev = 4
    hydrateGuideQuestFields(save, save)
    expect(save.guideQuestRev).toBe(GUIDE_QUEST_REV)
    expect(save.guideQuestStep).toBe(4)
    expect(guideQuestView(save)?.goal).toBe('在 PVE 选人弹层点过开战')
    expect(guideQuestFlashId(save)).toBe('combat')

    const ahead = createSave()
    spawnWorker(ahead)
    spawnWorker(ahead)
    ahead.workers[0].assignment = 'herbalism'
    ahead.workers[1].qualityTier = 2
    ahead.restFoodId = 'meal'
    ahead.guideQuestStep = 8
    ahead.guideQuestRev = 4
    hydrateGuideQuestFields(ahead, ahead)
    expect(ahead.guideQuestStep).toBe(4)
    expect(guideQuestView(ahead)?.goal).toBe('在 PVE 选人弹层点过开战')
  })

  it('keeps a current-rev step number', () => {
    const save = createSave()
    save.guideQuestStep = 3
    save.guideQuestRev = GUIDE_QUEST_REV
    hydrateGuideQuestFields(save, save)
    expect(save.guideQuestStep).toBe(3)
  })

  it('round-trips through hydrateLoadedSave when fields are missing', () => {
    const raw = {
      ...createSave(),
      guideQuestStep: undefined,
      guideQuestRev: undefined,
      guideQuestPotionUsed: undefined,
      guideQuestRuneOpened: undefined,
      starterCopperPawnDone: undefined,
    }
    const loaded = hydrateLoadedSave(raw as unknown)
    expect(loaded?.guideQuestStep).toBe(1)
    expect(loaded?.guideQuestRev).toBe(GUIDE_QUEST_REV)
    expect(loaded?.guideQuestPotionUsed).toBe(false)
    expect(loaded?.guideQuestRuneOpened).toBe(false)

    const dirty = hydrateLoadedSave({
      ...createSave(),
      guideQuestStep: 0,
      guideQuestRev: 'old',
      starterCopperPawnDone: 'yes',
    } as unknown)
    expect(dirty?.guideQuestStep).toBe(1)
  })
})

describe('guideQuest steps and claim', () => {
  it('walks nine steps across three phases and pays 20 gold each claim', () => {
    const save = createSave()
    const gold0 = save.gold
    expect(claimGuideQuest(save).ok).toBe(false)
    expect(save.guideQuestStep).toBe(1)
    expect(GUIDE_QUEST_STEPS).toBeGreaterThan(16)

    expect(recruitWorker(save).ok).toBe(true)
    expect(guideQuestProgressAt(save, 1)).toBe(0)
    expect(guideQuestView(save)?.progressLabel).toBe('进度 1/2')
    expect(claimGuideQuest(save).ok).toBe(false)
    expect(recruitWorker(save).ok).toBe(true)
    expect(guideQuestProgressAt(save, 1)).toBe(1)
    expect(guideQuestView(save)?.progressLabel).toBe('进度 2/2 · 可领')
    expect(claimGuideQuest(save)).toEqual({ ok: true, message: `金币 +${GUIDE_QUEST_GOLD}、酋长经验 +20` })
    expect(save.guideQuestStep).toBe(2)
    expect(save.gold).toBe(gold0 + GUIDE_QUEST_GOLD)
    expect(save.diamonds).toBe(START_DIAMONDS - RECRUIT_COST * 2)

    expect(guideQuestView(save)?.goal).toBe(GUIDE_AUTO_HERB_CLOSED_GOAL)
    expect(guideQuestView(save, true)?.goal).toBe(GUIDE_AUTO_HERB_OPEN_GOAL)
    expect(assignRestingToFirstEmpty(save).ok).toBe(true)
    expect(save.workers.some((worker) => worker.assignment === 'herbalism')).toBe(true)
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(save.guideQuestStep).toBe(3)

    spawnWorker(save)
    spawnWorker(save)
    expect(fuseRestWorkers(save, save.workers[1].id, save.workers[2].id).ok).toBe(true)
    expect(guideQuestView(save)?.goal).toBe('名册里有 2 档及以上苦工')
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(save.guideQuestStep).toBe(4)
    expect(guideQuestView(save)?.title).toBe('出征')
    expect(guideQuestView(save)?.goal).toBe('在 PVE 选人弹层点过开战')
    markCombatStarted(save)
    expect(hasStartedBattlefieldCombat(save)).toBe(true)
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(save.guideQuestStep).toBe(mainlineStepOf('level2'))
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(save.guideQuestStep).toBe(mainlineStepOf('alchemy'))
    expect(guideQuestView(save)?.title).toBe('熬药')
    expect(guideQuestView(save)?.goal).toBe('炼金站出过货，或手里、槽里有药')
    save.stations.alchemy.completed = 1
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(save.guideQuestStep).toBe(mainlineStepOf('potionInstall'))
    expect(guideQuestView(save)?.title).toBe('装药')

    save.bank.salve = 2
    expect(installPotionSlot(save, 0, 'salve').ok).toBe(true)
    expect(guideQuestView(save)?.goal).toBe('任一药剂槽装了药')
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(save.guideQuestStep).toBe(mainlineStepOf('potionUse'))

    const duty = save.workers.find((worker) => worker.assignment != null)
    if (duty) duty.hp = Math.max(1, duty.hpMax - 1)
    expect(usePotionSlot(save, 0).ok).toBe(true)
    expect(save.guideQuestPotionUsed).toBe(true)
    expect(guideQuestView(save)?.goal).toBe('点用过药剂槽')
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(save.guideQuestStep).toBe(mainlineStepOf('level3'))
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(save.guideQuestStep).toBe(mainlineStepOf('firstBlood'))
    expect(guideQuestView(save)?.waiting).toBe(false)
    expect(guideQuestView(save)?.taskId).toBe('firstBlood')
    expect(guideQuestView(save)?.goal).toBe('在悬赏打赢一个敌人并领到战利品')
    expect(save.gold).toBe(gold0 + GUIDE_QUEST_GOLD * 9)
  })

  it('completes step 2 when the queue head auto-fills herbalism or herbalism has produced', () => {
    const blocked = createSave()
    blocked.guideQuestStep = 2
    expect(guideQuestProgressAt(blocked, 2)).toBe(0)
    expect(recruitWorker(blocked).ok).toBe(true)
    expect(recruitWorker(blocked).ok).toBe(true)
    blocked.workers[0].hp = 1
    expect(assignRestingToFirstEmpty(blocked).ok).toBe(false)
    expect(guideQuestProgressAt(blocked, 2)).toBe(0)
    blocked.workers[0].hp = blocked.workers[0].hpMax
    expect(assignRestingToFirstEmpty(blocked).ok).toBe(true)
    expect(blocked.workers[0].assignment).toBe('herbalism')
    expect(guideQuestProgressAt(blocked, 2)).toBe(1)

    const produced = createSave()
    produced.guideQuestStep = 2
    produced.stations.herbalism.completed = 1
    expect(guideQuestProgressAt(produced, 2)).toBe(1)
  })

  it('completes camp food only after a rest food is selected at its step', () => {
    const save = createSave()
    const foodStep = mainlineStepOf('restFood')
    save.guideQuestStep = foodStep
    save.knightLevel = 8
    expect(guideQuestView(save)?.goal).toBe('选好营地伙食')
    expect(guideQuestProgressAt(save, foodStep)).toBe(0)
    expect(selectRestFood(save, null).ok).toBe(true)
    expect(guideQuestProgressAt(save, foodStep)).toBe(0)
    save.bank.roast = 1
    expect(selectRestFood(save, 'roast').ok).toBe(true)
    expect(guideQuestProgressAt(save, foodStep)).toBe(1)
  })

  it('completes step 5 only after the pick-sheet 开战 click starts combat', () => {
    const save = createSave()
    save.guideQuestStep = mainlineStepOf('combat')
    expect(guideQuestView(save)?.goal).toBe('在 PVE 选人弹层点过开战')
    expect(guideQuestProgressAt(save, save.guideQuestStep)).toBe(0)
    expect(hasStartedBattlefieldCombat(save)).toBe(false)

    const idle = save.encounters[0] as EnemyEncounter
    expect(idle.departed).toBe(false)
    expect(idle.combat).toBeNull()
    expect(guideQuestProgressAt(save, save.guideQuestStep)).toBe(0)

    save.departCount = 1
    expect(guideQuestProgressAt(save, save.guideQuestStep)).toBe(1)
    expect(hasStartedBattlefieldCombat(save)).toBe(true)

    const fighting = createSave()
    fighting.guideQuestStep = mainlineStepOf('combat')
    const enc = fighting.encounters[0] as EnemyEncounter
    enc.combat = {
      startedAt: 1,
      timeoutAt: 10,
      workerIds: [],
      workers: [],
      enemy: { id: 'e', label: '敌', hp: 8, hpMax: 20, atk: 1, spd: 10, nextActAt: 2 },
      logs: [],
      outcome: null,
    }
    expect(guideQuestProgressAt(fighting, fighting.guideQuestStep)).toBe(1)
  })

  it('shows the rune step only after inscription unlock and a battlefield fight button', () => {
    const save = createSave()
    save.guideQuestStep = GUIDE_QUEST_PHASE3_START
    expect(guideQuestView(save)?.waiting).toBe(true)
    expect(guideQuestView(save)?.goal).toBe('下一个目标：酋长 18 级开放符文槽')
    save.knightLevel = 18
    expect(guideQuestView(save)?.title).toBe('符文槽')
    for (const enc of save.encounters) {
      if (enc.kind === 'enemy') enc.lootClaimed = true
    }
    expect(guideQuestView(save)?.goal).toBe('在选人面板点开过符文槽')
    const first = save.encounters[0] as EnemyEncounter
    first.lootClaimed = false
    expect(guideQuestView(save)?.goal).toBe('在选人面板点开过符文槽')
    expect(guideQuestFlashId(save)).toBe('rune')
  })
})

describe('guideQuest flash target', () => {
  it('flashes only the current unfinished step and stops when claimable', () => {
    const save = createSave()
    expect(guideQuestFlashId(save)).toBe('recruit')
    expect(isGuideQuestFlash(save, 'recruit')).toBe(true)
    expect(isGuideQuestFlash(save, 'autoHerb')).toBe(false)

    expect(recruitWorker(save).ok).toBe(true)
    expect(guideQuestFlashId(save)).toBe('recruit')
    expect(recruitWorker(save).ok).toBe(true)
    expect(guideQuestFlashId(save)).toBeNull()
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(guideQuestFlashId(save)).toBe('autoHerb')

    expect(assignRestingToFirstEmpty(save).ok).toBe(true)
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(guideQuestFlashId(save)).toBe('fuse')

    spawnWorker(save)
    spawnWorker(save)
    fuseRestWorkers(save, save.workers[1].id, save.workers[2].id)
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(guideQuestFlashId(save)).toBe('combat')
    expect(isGuideQuestCombatFlash(save, save.encounters[0])).toBe(true)

    markCombatStarted(save)
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(guideQuestFlashId(save)).toBe('alchemy')

    save.stations.alchemy.completed = 1
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(guideQuestFlashId(save)).toBe('potionInstall')

    save.bank.salve = 1
    installPotionSlot(save, 0, 'salve')
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(guideQuestFlashId(save)).toBe('potionUse')

    const onDuty = save.workers.find((worker) => worker.assignment != null)
    if (onDuty) onDuty.hp = Math.max(1, onDuty.hpMax - 1)
    usePotionSlot(save, 0)
    expect(guideQuestFlashId(save)).toBeNull()
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(guideQuestFlashId(save)).toBe('firstBlood')
    save.knightLevel = 18
    save.guideQuestStep = mainlineStepOf('tech')
    expect(guideQuestFlashId(save)).toBe('tech')
    save.guideQuestStep = GUIDE_QUEST_PHASE3_START
    expect(guideQuestFlashId(save)).toBe('rune')
    markGuideQuestRuneOpened(save)
    expect(guideQuestFlashId(save)).toBeNull()
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(guideQuestFlashId(save)).toBe('runeWin')
  })

  it('infers first incomplete step for missing fields', () => {
    const once = createSave()
    spawnWorker(once)
    once.workers[0].assignment = 'herbalism'
    expect(firstIncompleteGuideQuestStep(once)).toBe(1)

    const save = createSave()
    spawnWorker(save)
    spawnWorker(save)
    save.workers[0].assignment = 'herbalism'
    expect(firstIncompleteGuideQuestStep(save)).toBe(3)
  })
})

describe('guide fuse and alchemy cues', () => {
  it('points recruit and auto-assign copy at the camp button and the open sheet', () => {
    const save = createSave()
    expect(guideQuestView(save, false)?.goal).toBe(GUIDE_RECRUIT_CLOSED_GOAL)
    expect(guideQuestView(save, true)?.goal).toBe(GUIDE_RECRUIT_OPEN_GOAL)
    expect(GUIDE_RECRUIT_CLOSED_GOAL).toContain('底部营地')
    expect(GUIDE_RECRUIT_OPEN_GOAL).toContain('营地弹框')
    expect(GUIDE_AUTO_HERB_CLOSED_GOAL).toContain('底部营地')
    expect(GUIDE_AUTO_HERB_OPEN_GOAL).toContain('队首')
    expect(GUIDE_FUSE_EMPTY_GOAL).toContain('底部营地')
    expect(GUIDE_FUSE_DRAG_GOAL).toContain('营地弹框')
  })

  it('flashes recruit while step 3 has an empty camp', () => {
    const save = createSave()
    save.guideQuestStep = 3
    spawnWorker(save)
    spawnWorker(save)
    save.workers[0].assignment = 'herbalism'
    save.workers[1].assignment = 'alchemy'
    expect(guideFuseCue(save, false)).toBe('recruit')
    expect(guideFuseCue(save, true)).toBe('recruit')
    expect(guideQuestView(save)?.goal).toBe(GUIDE_FUSE_EMPTY_GOAL)
    expect(guideFuseFlashStations(save, true)).toEqual([])
  })

  it('flashes the camp button until the list opens, then the list and matching stations', () => {
    const save = createSave()
    save.guideQuestStep = 3
    spawnWorker(save)
    spawnWorker(save)
    spawnWorker(save)
    save.workers[0].assignment = 'herbalism'
    save.workers[1].assignment = 'cooking'
    expect(guideFuseCue(save, false)).toBe('openCamp')
    expect(guideQuestView(save, false)?.goal).toBe(GUIDE_FUSE_OPEN_GOAL)
    expect(guideFuseFlashStations(save, false)).toEqual([])
    expect(guideFuseCue(save, true)).toBe('drag')
    expect(guideQuestView(save, true)?.goal).toBe(GUIDE_FUSE_DRAG_GOAL)
    expect(GUIDE_FUSE_DRAG_GOAL).toContain('任意方向')
    expect(guideFuseFlashStations(save, true)).toEqual(['herbalism', 'cooking'])
  })

  it('aligns the first fused worker with the starter enemy so the pick sheet marks 推荐', () => {
    const save = createSave()
    const enc = save.encounters[0]
    expect(enc.kind).toBe('enemy')
    if (enc.kind !== 'enemy') return
    spawnWorker(save)
    spawnWorker(save)
    expect(fuseRestWorkers(save, save.workers[0].id, save.workers[1].id).ok).toBe(true)
    const green = save.workers.find((worker) => worker.qualityTier >= 2)
    expect(green?.combatAttrs[0]).toBe('sword')
    expect(fighterRecommendLabel(green?.combatAttrs ?? [], enc)).toBe('推荐')
  })

  it('flashes the alchemy card until its detail opens, then the progress', () => {
    const save = createSave()
    save.guideQuestStep = mainlineStepOf('alchemy')
    expect(guideAlchemyCardFlash(save, 'alchemy', null)).toBe(true)
    expect(guideAlchemyCardFlash(save, 'herbalism', null)).toBe(false)
    expect(guideAlchemyProgressFlash(save, 'alchemy')).toBe(true)
    expect(guideAlchemyCardFlash(save, 'alchemy', 'alchemy')).toBe(false)
    expect(guideAlchemyProgressFlash(save, 'herbalism')).toBe(false)
    save.stations.alchemy.completed = 1
    expect(guideAlchemyCardFlash(save, 'alchemy', null)).toBe(false)
    expect(guideAlchemyProgressFlash(save, 'alchemy')).toBe(false)
  })

  it('does not repay a step that was already claimed', () => {
    const save = createSave()
    save.guideQuestStep = 6
    save.guideQuestRev = GUIDE_QUEST_REV
    save.gold = 40
    hydrateGuideQuestFields(save, save)
    expect(save.guideQuestStep).toBe(6)
    expect(save.gold).toBe(40)
    expect(claimGuideQuest(save).ok).toBe(false)
    expect(save.gold).toBe(40)
  })
})
