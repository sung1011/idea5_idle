import { describe, expect, it } from 'vitest'
import { bankQty } from './bank'
import { restingWorkers } from './assign'
import { startCombat } from './encounters'
import { ticks } from './tick'
import { autoLineQuota, dispatchManualRound, ROUND_BADGE_TIP, toggleStationAuto } from './workshopDispatch'
import { fighterRecommendLabel } from './combatAttrs'
import { createSave } from './createSave'
import { fuseRestWorkers } from './fuse'
import {
  GUIDE_QUEST_DONE_STEP,
  GUIDE_QUEST_GOLD,
  GUIDE_QUEST_PHASE3_START,
  GUIDE_ALCHEMY_CLICK_GOAL,
  GUIDE_ALCHEMY_NEED_HERB_GOAL,
  GUIDE_ALCHEMY_WAIT_HERB_GOAL,
  GUIDE_POTION_NEED_CAMP_GOAL,
  GUIDE_COMBAT_HERB_GOAL,
  GUIDE_FUSE_DRAG_GOAL,
  GUIDE_FUSE_EMPTY_GOAL,
  GUIDE_FUSE_OPEN_GOAL,
  GUIDE_FUSE_WAIT_GOAL,
  GUIDE_POTION_INSTALL_CLOSED_GOAL,
  GUIDE_POTION_INSTALL_OPEN_GOAL,
  GUIDE_POTION_USE_CLOSED_GOAL,
  GUIDE_RECRUIT_CLOSED_GOAL,
  GUIDE_RECRUIT_OPEN_GOAL,
  guideClaimNotice,
  guideDispatchStation,
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
import { isModuleUnlocked, levelGateUnlockNote } from './moduleUnlock'
import { mainlineStepOf, mainlineTaskById } from './mainlineQuest'
import { installPotionSlot } from './potionSlots'
import { usePotionSlot } from './potions'
import { recruitWorker, spawnWorker } from './recruit'
import { POTION_ITEM_IDS, START_DIAMONDS } from './tables'
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
      unlockNote: null,
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
    expect(view?.goal).toBe(GUIDE_POTION_INSTALL_CLOSED_GOAL)
    expect(guideQuestView(save, true)?.goal).toBe(GUIDE_POTION_INSTALL_OPEN_GOAL)
    expect(guideQuestFlashId(save)).toBe('potionInstall')
  })

  it('keeps a stored step and does not skip tasks that are already satisfied', () => {
    const save = createSave()
    spawnWorker(save)
    spawnWorker(save)
    save.workers[0].assignment = 'herbalism'
    save.guideQuestStep = 1
    save.guideQuestRev = 2
    hydrateGuideQuestFields(save, save)
    expect(save.guideQuestStep).toBe(1)
    expect(save.guideQuestRev).toBe(GUIDE_QUEST_REV)
    expect(guideQuestView(save)?.taskId).toBe('recruit')
    expect(guideQuestView(save)?.claimable).toBe(true)
  })

  it('stamps the guide rev without moving a stored step', () => {
    const save = createSave()
    save.guideQuestStep = 8
    save.guideQuestRev = 4
    hydrateGuideQuestFields(save, save)
    expect(save.guideQuestRev).toBe(GUIDE_QUEST_REV)
    expect(save.guideQuestStep).toBe(8)
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
    expect(save.diamonds).toBe(START_DIAMONDS)
    expect(save.freeRecruitLeft).toBe(1)

    expect(guideQuestView(save)?.goal).toBe('点采药站，把营地队首派上去工作一轮')
    expect(guideQuestView(save, true)?.goal).toBe('点采药站，把营地队首派上去工作一轮')
    expect(dispatchManualRound(save, 'herbalism').ok).toBe(true)
    expect(save.workers.some((worker) => worker.assignment === 'herbalism')).toBe(true)
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(save.guideQuestStep).toBe(mainlineStepOf('herbQueue'))
    expect(dispatchManualRound(save, 'herbalism').ok).toBe(true)
    expect(save.stations.herbalism.manualRounds).toBeGreaterThanOrEqual(2)
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(save.guideQuestStep).toBe(mainlineStepOf('fuse'))

    spawnWorker(save)
    spawnWorker(save)
    expect(fuseRestWorkers(save, save.workers[1].id, save.workers[2].id).ok).toBe(true)
    expect(guideQuestView(save)?.goal).toBe('在营地把两名同品质苦工合成，升到 2 档')
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(save.guideQuestStep).toBe(mainlineStepOf('combat'))
    expect(guideQuestView(save)?.title).toBe('出征')
    expect(guideQuestView(save)?.goal).toBe(GUIDE_COMBAT_HERB_GOAL)
    save.bank.herb = 2
    expect(guideQuestView(save)?.goal).toBe('点战场，选人后开战')
    markCombatStarted(save)
    expect(hasStartedBattlefieldCombat(save)).toBe(true)
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(save.guideQuestStep).toBe(mainlineStepOf('level2'))
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(save.guideQuestStep).toBe(mainlineStepOf('alchemy'))
    expect(guideQuestView(save)?.title).toBe('熬药')
    expect(guideQuestView(save)?.goal).toBe(GUIDE_ALCHEMY_CLICK_GOAL)
    save.bank.herb = 0
    expect(save.stations.herbalism.auto).toBe(false)
    expect(guideQuestView(save)?.goal).toBe(GUIDE_ALCHEMY_NEED_HERB_GOAL)
    save.stations.herbalism.auto = true
    expect(guideQuestView(save)?.goal).toBe(GUIDE_ALCHEMY_WAIT_HERB_GOAL)
    expect(GUIDE_ALCHEMY_WAIT_HERB_GOAL).toBe('等采药站出草，再点炼金站派工')
    save.stations.herbalism.auto = false
    save.bank.herb = 1
    save.stations.alchemy.completed = 1
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(save.guideQuestStep).toBe(mainlineStepOf('potionInstall'))
    expect(guideQuestView(save)?.title).toBe('装药')

    save.bank.salve = 2
    expect(installPotionSlot(save, 0, 'salve').ok).toBe(true)
    expect(guideQuestView(save)?.goal).toBe('在营地把任一药剂槽装上药')
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(save.guideQuestStep).toBe(mainlineStepOf('potionUse'))
    expect(guideQuestView(save)?.goal).toBe(GUIDE_POTION_USE_CLOSED_GOAL)
    expect(guideQuestView(save, true)?.goal).toBe('在营地点已装的药剂槽用药')
    const parked = save.workers.map((worker) => worker.assignment)
    for (const worker of save.workers) worker.assignment = 'herbalism'
    expect(guideQuestView(save)?.goal).toBe(GUIDE_POTION_NEED_CAMP_GOAL)
    expect(GUIDE_POTION_NEED_CAMP_GOAL).toBe('等苦工回到营地，再点药剂槽用药')
    save.workers.forEach((worker, index) => {
      worker.assignment = parked[index]
    })

    const resting = save.workers.find((worker) => worker.assignment == null)
    expect(resting).toBeTruthy()
    resting!.hp = Math.max(1, resting!.hpMax - 1)
    expect(save.stations.herbalism.auto).toBe(false)
    expect(usePotionSlot(save, 0).ok).toBe(true)
    expect(save.guideQuestPotionUsed).toBe(true)
    expect(guideQuestView(save)?.goal).toBe('在营地点用过药剂槽')
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(save.guideQuestStep).toBe(mainlineStepOf('autoLine'))
    expect(mainlineStepOf('autoLine')).toBe(10)
    expect(autoLineQuota(save)).toBe(1)
    expect(toggleStationAuto(save, 'herbalism').ok).toBe(true)
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(save.guideQuestStep).toBe(mainlineStepOf('level3'))
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(save.guideQuestStep).toBe(mainlineStepOf('firstBlood'))
    expect(guideQuestView(save)?.waiting).toBe(false)
    expect(guideQuestView(save)?.taskId).toBe('firstBlood')
    expect(guideQuestView(save)?.goal).toBe('在悬赏打赢一个敌人并领到战利品')
    expect(save.gold).toBe(gold0 + GUIDE_QUEST_GOLD * 11)
  })

  it('completes step 2 when a click dispatches herbalism or herbalism has produced', () => {
    const blocked = createSave()
    blocked.guideQuestStep = 2
    expect(guideQuestProgressAt(blocked, 2)).toBe(0)
    expect(recruitWorker(blocked).ok).toBe(true)
    expect(recruitWorker(blocked).ok).toBe(true)
    blocked.workers[0].hp = 1
    expect(dispatchManualRound(blocked, 'herbalism').ok).toBe(false)
    expect(guideQuestProgressAt(blocked, 2)).toBe(0)
    blocked.workers[0].hp = blocked.workers[0].hpMax
    blocked.workers[0].fatigueDebt = 0
    expect(dispatchManualRound(blocked, 'herbalism').ok).toBe(true)
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
    expect(guideQuestView(save)?.goal).toBe(GUIDE_COMBAT_HERB_GOAL)
    save.bank.herb = 2
    expect(guideQuestView(save)?.goal).toBe('点战场，选人后开战')
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

  it('shows the rune step once that mainline task is reached', () => {
    const save = createSave()
    save.knightLevel = 18
    save.guideQuestStep = mainlineStepOf('level18')
    expect(isModuleUnlocked(save, 'rune')).toBe(false)
    const levelView = guideQuestView(save)
    expect(levelView?.waiting).toBe(false)
    expect(levelView?.claimable).toBe(true)
    expect(levelView?.unlockNote).toBe('完成后开启：铭刻、符文槽')
    save.guideQuestStep = GUIDE_QUEST_PHASE3_START
    expect(isModuleUnlocked(save, 'rune')).toBe(true)
    expect(guideQuestView(save)?.waiting).toBe(false)
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

    expect(dispatchManualRound(save, 'herbalism').ok).toBe(true)
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(guideQuestFlashId(save)).toBe('herbQueue')
    expect(dispatchManualRound(save, 'herbalism').ok).toBe(true)
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(guideQuestFlashId(save)).toBe('fuse')

    spawnWorker(save)
    spawnWorker(save)
    fuseRestWorkers(save, save.workers[1].id, save.workers[2].id)
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(guideQuestFlashId(save)).toBe('combat')
    expect(isGuideQuestCombatFlash(save, save.encounters[0])).toBe(false)
    expect(guideDispatchStation(save)).toBe('herbalism')
    save.bank.herb = 2
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

    const resting = save.workers.find((worker) => worker.assignment == null)
    expect(resting).toBeTruthy()
    resting!.hp = Math.max(1, resting!.hpMax - 1)
    expect(save.stations.herbalism.auto).toBe(false)
    expect(usePotionSlot(save, 0).ok).toBe(true)
    expect(guideQuestFlashId(save)).toBeNull()
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(guideQuestFlashId(save)).toBe('autoLine')
    expect(autoLineQuota(save)).toBe(1)
    expect(toggleStationAuto(save, 'herbalism').ok).toBe(true)
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
    expect(GUIDE_RECRUIT_CLOSED_GOAL).toBe('点营地，抽取苦工 2 次')
    expect(GUIDE_RECRUIT_OPEN_GOAL).toBe('在营地里抽取苦工 2 次')
    expect(GUIDE_FUSE_EMPTY_GOAL).toBe('再抽 1 名苦工，新人会进营地')
    expect(GUIDE_FUSE_OPEN_GOAL).toBe('点营地，打开名单')
    expect(GUIDE_FUSE_DRAG_GOAL).toBe('在营地按住苦工，拖到同品质的人身上合成')
    expect(GUIDE_FUSE_WAIT_GOAL).toBe('等苦工回到营地，或再抽 1 名，再拖到同品质的人身上合成')
  })

  it('flashes recruit while step 3 has an empty camp', () => {
    const save = createSave()
    save.guideQuestStep = mainlineStepOf('fuse')
    spawnWorker(save)
    spawnWorker(save)
    save.workers[0].assignment = 'herbalism'
    save.workers[1].assignment = 'alchemy'
    expect(guideFuseCue(save, false)).toBe('recruit')
    expect(guideFuseCue(save, true)).toBe('recruit')
    expect(guideQuestView(save)?.goal).toBe(GUIDE_FUSE_EMPTY_GOAL)
    expect(guideFuseFlashStations(save, true)).toEqual([])
  })

  it('waits while only one camp worker can pair, and never flashes stations', () => {
    const save = createSave()
    save.guideQuestStep = mainlineStepOf('fuse')
    spawnWorker(save)
    spawnWorker(save)
    save.workers[0].assignment = 'herbalism'
    expect(guideFuseCue(save, false)).toBe('wait')
    expect(guideFuseCue(save, true)).toBe('wait')
    expect(guideQuestView(save, false)?.goal).toBe(GUIDE_FUSE_WAIT_GOAL)
    expect(guideQuestView(save, true)?.goal).toBe(GUIDE_FUSE_WAIT_GOAL)
    expect(GUIDE_FUSE_WAIT_GOAL).toContain('回到营地')
    expect(guideFuseFlashStations(save, true)).toEqual([])

    spawnWorker(save)
    expect(guideFuseCue(save, false)).toBe('openCamp')
    expect(guideQuestView(save, false)?.goal).toBe(GUIDE_FUSE_OPEN_GOAL)
    expect(guideFuseCue(save, true)).toBe('drag')
    expect(guideQuestView(save, true)?.goal).toBe(GUIDE_FUSE_DRAG_GOAL)
    expect(GUIDE_FUSE_DRAG_GOAL).toBe('在营地按住苦工，拖到同品质的人身上合成')
    expect(guideFuseFlashStations(save, false)).toEqual([])
    expect(guideFuseFlashStations(save, true)).toEqual([])
  })

  it('unblocks camp fuse after the station worker returns, without recruiting again', () => {
    let save = createSave()
    expect(recruitWorker(save).ok).toBe(true)
    expect(recruitWorker(save).ok).toBe(true)
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(dispatchManualRound(save, 'herbalism').ok).toBe(true)
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(dispatchManualRound(save, 'herbalism').ok).toBe(true)
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(guideQuestView(save)?.taskId).toBe('fuse')
    expect(guideFuseCue(save, true)).toBe('wait')
    expect(guideFuseFlashStations(save, true)).toEqual([])
    for (let i = 0; i < 80 && restingWorkers(save).length < 2; i++) save = ticks(save, 8)
    expect(restingWorkers(save).length).toBeGreaterThanOrEqual(2)
    expect(guideFuseCue(save, false)).toBe('openCamp')
    expect(guideFuseCue(save, true)).toBe('drag')
    expect(guideFuseFlashStations(save, true)).toEqual([])
    const resting = restingWorkers(save)
    expect(fuseRestWorkers(save, resting[0].id, resting[1].id).ok).toBe(true)
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(guideQuestView(save)?.taskId).toBe('combat')
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
    expect(guideAlchemyCardFlash(save, 'alchemy', null)).toBe(false)
    expect(guideDispatchStation(save)).toBe('herbalism')
    save.bank.herb = 1
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

function pumpHerbs(save: Save, need: number): Save {
  let current = save
  for (let i = 0; i < 100 && bankQty(current, 'herb') < need; i++) {
    const station = current.stations.herbalism
    if (!station.auto && station.manualRounds < 5) dispatchManualRound(current, 'herbalism')
    current = ticks(current, 16)
  }
  return current
}

describe('early guide on a fresh save', () => {
  it('walks recruit through potion use by clicking stations, without getting stuck', () => {
    let save = createSave()
    expect(recruitWorker(save).ok).toBe(true)
    expect(recruitWorker(save).ok).toBe(true)
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(guideQuestView(save)?.taskId).toBe('autoHerb')
    expect(dispatchManualRound(save, 'herbalism').ok).toBe(true)
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(guideQuestView(save)?.goal).toBe('采药站还在工作时再点一次，排上下一轮（最多 5 轮）')
    expect(dispatchManualRound(save, 'herbalism').ok).toBe(true)
    expect(save.stations.herbalism.manualRounds).toBeGreaterThanOrEqual(2)
    expect(claimGuideQuest(save).ok).toBe(true)

    expect(guideFuseCue(save, true)).toBe('wait')
    expect(guideQuestView(save, true)?.goal).toBe(GUIDE_FUSE_WAIT_GOAL)
    expect(guideFuseFlashStations(save, true)).toEqual([])
    expect(save.freeRecruitLeft).toBe(1)
    let waited = 0
    while (restingWorkers(save).length < 2 && waited < 40) {
      save = ticks(save, 20)
      waited += 1
    }
    const resting = restingWorkers(save)
    expect(resting.length).toBeGreaterThanOrEqual(2)
    expect(fuseRestWorkers(save, resting[0].id, resting[1].id).ok).toBe(true)
    expect(claimGuideQuest(save).ok).toBe(true)
    if (bankQty(save, 'herb') < 2) {
      expect(guideQuestView(save)?.goal).toBe(GUIDE_COMBAT_HERB_GOAL)
      save = pumpHerbs(save, 2)
    }
    expect(bankQty(save, 'herb')).toBeGreaterThanOrEqual(2)
    expect(guideQuestView(save)?.goal).toBe('点战场，选人后开战')
    const fighter = restingWorkers(save)[0] ?? save.workers.find((worker) => worker.assignment == null)
    expect(fighter).toBeTruthy()
    expect(startCombat(save, 0, [fighter!.id]).ok).toBe(true)
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(guideQuestView(save)?.taskId).toBe('alchemy')
    expect(save.stations.herbalism.auto).toBe(false)

    let guard = 0
    while ((save.stations.alchemy.completed ?? 0) < 1 && guard < 50) {
      guard += 1
      if (!restingWorkers(save).some((worker) => worker.hp >= worker.hpMax && worker.fatigueDebt === 0)) {
        for (const enc of save.encounters) {
          if (enc.kind !== 'enemy' || !enc.combat) continue
          enc.lootClaimed = true
          enc.combat = null
        }
        for (const worker of save.workers) {
          if (worker.assignment != null) continue
          worker.hp = worker.hpMax
          worker.fatigueDebt = 0
        }
      }
      if (bankQty(save, 'herb') < 1) {
        save = pumpHerbs(save, 1)
        continue
      }
      if (!dispatchManualRound(save, 'alchemy').ok) {
        for (const enc of save.encounters) {
          if (enc.kind !== 'enemy' || !enc.combat) continue
          enc.lootClaimed = true
          enc.combat = null
        }
        for (const worker of save.workers) {
          if (worker.assignment != null) continue
          worker.hp = worker.hpMax
          worker.fatigueDebt = 0
        }
        if (save.stations.herbalism.auto && restingWorkers(save).length === 0) {
          toggleStationAuto(save, 'herbalism')
        }
        save = ticks(save, 30)
        continue
      }
      save = ticks(save, 40)
    }
    expect(save.stations.alchemy.completed).toBeGreaterThanOrEqual(1)
    expect(claimGuideQuest(save).ok).toBe(true)
    const potion = POTION_ITEM_IDS.find((id) => bankQty(save, id) > 0)
    expect(potion).toBeTruthy()
    expect(installPotionSlot(save, 0, potion!).ok).toBe(true)
    expect(claimGuideQuest(save).ok).toBe(true)
    let target = save.workers.find((worker) => worker.assignment == null)
    if (!target) {
      target = save.workers.find((worker) => worker.assignment != null)
      expect(target).toBeTruthy()
      target!.assignment = null
    }
    target!.fatigueDebt = 0
    target!.hp = Math.max(1, target!.hpMax - 1)
    expect(save.stations.herbalism.auto).toBe(false)
    expect(usePotionSlot(save, 0).ok).toBe(true)
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(guideQuestView(save)?.taskId).toBe('autoLine')
    expect(autoLineQuota(save)).toBe(1)
    expect(toggleStationAuto(save, 'herbalism').ok).toBe(true)
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(guideQuestView(save)?.taskId).toBe('level3')
  })

  it('points opened stations at a click, and tells the player when the second auto line opens', () => {
    expect(mainlineTaskById('huntStart')?.goal).toBe('点狩猎站，把营地队首派上去工作一轮')
    expect(mainlineTaskById('cookStart')?.goal).toBe('点烹饪站，把营地队首派上去工作一轮')
    expect(mainlineTaskById('mining')?.goal).toBe('点采矿站，把营地队首派上去工作一轮')
    expect(mainlineTaskById('inscribe')?.goal).toBe('点铭刻站，把营地队首派上去工作一轮')
    expect(mainlineTaskById('huntHaul')?.goal).toContain('可以挂自动')
    expect(guideClaimNotice('level11')).toContain('自动线名额变成 2')
    expect(levelGateUnlockNote(11)).toContain('自动线名额变成 2')
    expect(ROUND_BADGE_TIP).toContain('工作一轮')
    expect(ROUND_BADGE_TIP).toContain('还在工作时')
    expect(ROUND_BADGE_TIP).toContain('一轮工作完')
    expect(ROUND_BADGE_TIP).toContain('最多 5 轮')
    expect(ROUND_BADGE_TIP).toContain('不会排队')
    expect(ROUND_BADGE_TIP).toContain('营地队尾')

    const save = createSave()
    save.guideQuestStep = mainlineStepOf('huntStart')
    save.knightLevel = 6
    save.openedModules = ['hunting', 'market']
    expect(guideDispatchStation(save)).toBe('hunting')
    expect(guideQuestView(save)?.goal).toContain('点狩猎站')
  })
})
