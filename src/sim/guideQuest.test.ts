import { describe, expect, it } from 'vitest'
import { assignWorker } from './assign'
import { createSave } from './createSave'
import { fuseStationWorkers } from './fuse'
import {
  GUIDE_QUEST_DONE_STEP,
  GUIDE_QUEST_GOLD,
  GUIDE_QUEST_PHASE2_START,
  GUIDE_QUEST_PHASE3_START,
  GUIDE_QUEST_REV,
  GUIDE_QUEST_STEPS,
  claimGuideQuest,
  firstIncompleteGuideQuestStep,
  guideQuestFlashId,
  guideQuestProgressAt,
  guideQuestView,
  hasStartedBattlefieldCombat,
  hydrateGuideQuestFields,
  isGuideQuestCombatFlash,
  isGuideQuestFlash,
  isGuideQuestRuneFlash,
  isGuideQuestVisible,
  markGuideQuestRuneOpened,
  normalizeGuideQuestStep,
} from './guideQuest'
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
      phaseTotal: 4,
      title: '主线 · 1/4',
      goal: '抽取工人 2 次',
      progress: 0,
      progressLabel: '进度 0/2',
      claimable: false,
      fillPct: 0,
    })
    expect(normalizeGuideQuestStep(undefined)).toBe(1)
    expect(normalizeGuideQuestStep(0)).toBe(1)
    expect(normalizeGuideQuestStep(2.8)).toBe(2)
    expect(normalizeGuideQuestStep(9)).toBe(GUIDE_QUEST_DONE_STEP)
  })

  it('hides phase 2 until knight is 2, then shows alchemy', () => {
    const save = createSave()
    save.guideQuestStep = GUIDE_QUEST_PHASE2_START
    expect(save.knightLevel).toBe(1)
    expect(guideQuestView(save)).toBeNull()
    expect(isGuideQuestVisible(save)).toBe(false)
    save.knightLevel = 2
    const view = guideQuestView(save)
    expect(view?.title).toBe('进阶 · 1/3')
    expect(view?.goal).toBe('在炼金站炼成药剂')
    expect(guideQuestFlashId(save)).toBe('alchemy')
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
    expect((vetRaw as Save).guideQuestStep).toBe(8)
    expect((vetRaw as Save).guideQuestRuneOpened).toBe(false)
    expect(isGuideQuestVisible(vetRaw as Save)).toBe(false)
    expect(guideQuestView(vetRaw as Save)).toBeNull()
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
  it('walks eight steps across three phases and pays 20 gold each claim', () => {
    const save = createSave()
    const gold0 = save.gold
    expect(claimGuideQuest(save).ok).toBe(false)
    expect(save.guideQuestStep).toBe(1)
    expect(GUIDE_QUEST_STEPS).toBe(8)

    expect(recruitWorker(save).ok).toBe(true)
    expect(guideQuestProgressAt(save, 1)).toBe(0)
    expect(guideQuestView(save)?.progressLabel).toBe('进度 1/2')
    expect(claimGuideQuest(save).ok).toBe(false)
    expect(recruitWorker(save).ok).toBe(true)
    expect(guideQuestProgressAt(save, 1)).toBe(1)
    expect(guideQuestView(save)?.progressLabel).toBe('进度 2/2 · 可领')
    expect(claimGuideQuest(save)).toEqual({ ok: true, message: `金币 +${GUIDE_QUEST_GOLD}` })
    expect(save.guideQuestStep).toBe(2)
    expect(save.gold).toBe(gold0 + GUIDE_QUEST_GOLD)
    expect(save.diamonds).toBe(START_DIAMONDS - RECRUIT_COST * 2)

    expect(guideQuestView(save)?.goal).toBe('把工人派入采药')
    expect(assignWorker(save, save.workers[0].id, 'herbalism').ok).toBe(true)
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(save.guideQuestStep).toBe(3)

    spawnWorker(save)
    assignWorker(save, save.workers[1].id, 'herbalism')
    expect(fuseStationWorkers(save, 'herbalism').ok).toBe(true)
    expect(guideQuestView(save)?.goal).toBe('合成两名同品质工人')
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(save.guideQuestStep).toBe(4)

    expect(guideQuestView(save)?.goal).toBe('在主线弹层中点击开战')
    markCombatStarted(save)
    expect(hasStartedBattlefieldCombat(save)).toBe(true)
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(save.guideQuestStep).toBe(5)
    expect(guideQuestView(save)).toBeNull()

    save.knightLevel = 2
    expect(guideQuestView(save)?.title).toBe('进阶 · 1/3')
    save.stations.alchemy.completed = 1
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(save.guideQuestStep).toBe(6)

    save.bank.salve = 2
    expect(installPotionSlot(save, 0, 'salve').ok).toBe(true)
    expect(guideQuestView(save)?.goal).toBe('把药剂装进技能槽')
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(save.guideQuestStep).toBe(7)

    expect(usePotionSlot(save, 0).ok).toBe(true)
    expect(save.guideQuestPotionUsed).toBe(true)
    expect(guideQuestView(save)?.goal).toBe('点药剂槽产生效果')
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(save.guideQuestStep).toBe(GUIDE_QUEST_PHASE3_START)
    expect(guideQuestView(save)).toBeNull()

    save.knightLevel = 10
    expect(guideQuestView(save)?.title).toBe('符文 · 1/1')
    expect(guideQuestView(save)?.goal).toBe('在选人面板点开符文槽')
    expect(guideQuestFlashId(save)).toBe('rune')
    expect(isGuideQuestRuneFlash(save, save.encounters[0])).toBe(true)
    expect(markGuideQuestRuneOpened(save)).toBe(true)
    expect(save.guideQuestRuneOpened).toBe(true)
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(save.guideQuestStep).toBe(GUIDE_QUEST_DONE_STEP)
    expect(isGuideQuestVisible(save)).toBe(false)
    expect(claimGuideQuest(save)).toEqual({ ok: false, reason: '新手任务已完成' })
  })

  it('completes step 4 only after the pick-sheet 开战 click starts combat', () => {
    const save = createSave()
    save.guideQuestStep = 4
    expect(guideQuestView(save)?.goal).toBe('在主线弹层中点击开战')
    expect(guideQuestProgressAt(save, 4)).toBe(0)
    expect(hasStartedBattlefieldCombat(save)).toBe(false)

    const idle = save.encounters[0] as EnemyEncounter
    expect(idle.departed).toBe(false)
    expect(idle.combat).toBeNull()
    expect(guideQuestProgressAt(save, 4)).toBe(0)

    save.departCount = 1
    expect(guideQuestProgressAt(save, 4)).toBe(1)
    expect(hasStartedBattlefieldCombat(save)).toBe(true)

    const fighting = createSave()
    fighting.guideQuestStep = 4
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
    expect(guideQuestProgressAt(fighting, 4)).toBe(1)
  })

  it('shows the rune step only after inscription unlock and a battlefield fight button', () => {
    const save = createSave()
    save.guideQuestStep = GUIDE_QUEST_PHASE3_START
    expect(guideQuestView(save)).toBeNull()
    save.knightLevel = 10
    expect(guideQuestView(save)?.title).toBe('符文 · 1/1')
    for (const enc of save.encounters) {
      if (enc.kind === 'enemy') enc.lootClaimed = true
    }
    expect(guideQuestView(save)).toBeNull()
    const first = save.encounters[0] as EnemyEncounter
    first.lootClaimed = false
    expect(guideQuestView(save)?.goal).toBe('在选人面板点开符文槽')
    expect(guideQuestFlashId(save)).toBe('rune')
  })
})

describe('guideQuest flash target', () => {
  it('flashes only the current unfinished step and stops when claimable', () => {
    const save = createSave()
    expect(guideQuestFlashId(save)).toBe('recruit')
    expect(isGuideQuestFlash(save, 'recruit')).toBe(true)
    expect(isGuideQuestFlash(save, 'assignHerb')).toBe(false)

    expect(recruitWorker(save).ok).toBe(true)
    expect(guideQuestFlashId(save)).toBe('recruit')
    expect(recruitWorker(save).ok).toBe(true)
    expect(guideQuestFlashId(save)).toBeNull()
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(guideQuestFlashId(save)).toBe('assignHerb')

    assignWorker(save, save.workers[0].id, 'herbalism')
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(guideQuestFlashId(save)).toBe('fuse')

    spawnWorker(save)
    assignWorker(save, save.workers[1].id, 'herbalism')
    fuseStationWorkers(save, 'herbalism')
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(guideQuestFlashId(save)).toBe('combat')
    expect(isGuideQuestCombatFlash(save, save.encounters[0])).toBe(true)

    markCombatStarted(save)
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(guideQuestFlashId(save)).toBeNull()
    save.knightLevel = 2
    expect(guideQuestFlashId(save)).toBe('alchemy')

    save.stations.alchemy.completed = 1
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(guideQuestFlashId(save)).toBe('potionInstall')

    save.bank.salve = 1
    installPotionSlot(save, 0, 'salve')
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(guideQuestFlashId(save)).toBe('potionUse')

    usePotionSlot(save, 0)
    expect(guideQuestFlashId(save)).toBeNull()
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(guideQuestFlashId(save)).toBeNull()
    save.knightLevel = 10
    expect(guideQuestFlashId(save)).toBe('rune')
    markGuideQuestRuneOpened(save)
    expect(guideQuestFlashId(save)).toBeNull()
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(guideQuestFlashId(save)).toBeNull()
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
