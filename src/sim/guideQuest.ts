import { restingWorkers } from './assign'
import { bankQty } from './bank'
import { canReinforceCombat, isCombatLost, isCombatWon, isFighting } from './combat'
import { combatSupplyBlockReason, isEncounterDone, isStarterCopperPawn, STARTER_GUIDE_HERB_QTY } from './encounters'
import { isModuleUnlocked, knightLevelProgress, levelGateUnlockNote, moduleLockedTip, moduleUnlockKnightLevel, SECOND_AUTO_LINE_TIP } from './moduleUnlock'
import { knightLevelOf } from './stationUnlock'
import { anyWorkerHasPotionBuff } from './potions'
import { POTION_ITEM_IDS, QUALITY_MAX } from './tables'
import { isFullWorkshopHp } from './workshopHp'
import type { ActionResult, Encounter, EnemyEncounter, Save, StationId } from './types'
import {
  MAINLINE_TASKS,
  mainlineDone,
  mainlineMeter,
  mainlineRewardLabel,
  mainlineStepOf,
  mainlineTaskAt,
  normalizeGuideIdList,
  normalizeSkipMask,
  grantPassedLevelModules,
  payMainlineReward,
  syncGuideQuestMet,
  taskModuleReady,
  type MainlineTask,
} from './mainlineQuest'

export const GUIDE_QUEST_PHASE1_STEPS = 5
export const GUIDE_QUEST_PHASE2_STEPS = 2
export const GUIDE_QUEST_PHASE3_STEPS = 1
/** 用药这一步的步号。不再用来迁移旧档。 */
export const GUIDE_OLD_DONE_STEP = mainlineStepOf('potionUse')
export const GUIDE_QUEST_GOLD = 20
/** 骑士 1 级即可装槽 / 点用。主线在升到 2 级后引导炼金、装药、用药，用药不要求已经挂上自动线。 */
export const GUIDE_QUEST_PHASE2_KNIGHT = 1
/**
 * 9：确认过的清单，另插入派工、排队和挂自动。升到 N 级的任务领奖后才开启该级功能。
 * 存档版本对不上整档丢弃，读档不再按旧 REV 跳过已满足的任务。第一步仍须抽工人 2 次。
 */
export const GUIDE_QUEST_REV = 9
/** 第 1 步还没打开营地。 */
export const GUIDE_RECRUIT_CLOSED_GOAL = '点营地，抽取苦工 2 次'
/** 第 1 步营地已打开。 */
export const GUIDE_RECRUIT_OPEN_GOAL = '在营地里抽取苦工 2 次'
/** 合伙步营地无人。 */
export const GUIDE_FUSE_EMPTY_GOAL = '再抽 1 名苦工，新人会进营地'
/** 合伙步已有两名同品质在营地，名单还没打开。 */
export const GUIDE_FUSE_OPEN_GOAL = '点营地，打开名单'
/** 开战步卡面弱点行说明。 */
export const GUIDE_WEAKNESS_CARD_TIP =
  '敌人有弱点，派属性对得上的苦工出战，伤害更高，还会削敌人的盾；盾打空会破防，敌人暂停出手。'
/** 开战步选人面板，对准带「推荐」的苦工。 */
export const GUIDE_WEAKNESS_PICK_TIP = '这名苦工的属性正好打中弱点'
/** 合伙步名单已打开，两名同品质都在营地。 */
export const GUIDE_FUSE_DRAG_GOAL = '在营地按住苦工，拖到同品质的人身上合成'
/** 合伙步有人还在干活，凑不齐两名同品质。 */
export const GUIDE_FUSE_WAIT_GOAL = '等苦工回到营地，或再抽 1 名，再拖到同品质的人身上合成'
/** 出征步草还不够首单时，先回到采药站连点。 */
export const GUIDE_COMBAT_HERB_GOAL = '草不够。再去采药站排队，凑够 2 株'
/** 熬药步还没有原料。 */
export const GUIDE_ALCHEMY_NEED_HERB_GOAL = '先点采药站出草，再点炼金站派工'
/** 采药已在出草，等出草再点炼金。 */
export const GUIDE_ALCHEMY_WAIT_HERB_GOAL = '等采药站出草，再点炼金站派工'
/** 有原料时点炼金站派一轮。 */
export const GUIDE_ALCHEMY_CLICK_GOAL = '点炼金站，派队首去熬一轮药'
/** 装药步营地还没打开。 */
export const GUIDE_POTION_INSTALL_CLOSED_GOAL = '点营地，再点药剂槽装药'
/** 装药步营地已打开。 */
export const GUIDE_POTION_INSTALL_OPEN_GOAL = '在营地点空药剂槽，装上一种药'
/** 用药步营地还没打开。 */
export const GUIDE_POTION_USE_CLOSED_GOAL = '点营地，再点药剂槽用药'
/** 用药步营地已打开。 */
export const GUIDE_POTION_USE_OPEN_GOAL = '在营地点已装的药剂槽用药'
/** 用药步营地没人。 */
export const GUIDE_POTION_NEED_CAMP_GOAL = '等苦工回到营地，再点药剂槽用药'
/** 第一阶段「抽工人」完成所需次数（花名册人数或已生成序号，取较大）。 */
export const GUIDE_QUEST_RECRUIT_NEED = 2

export const GUIDE_QUEST_STEPS = MAINLINE_TASKS.length
export const GUIDE_QUEST_DONE_STEP = GUIDE_QUEST_STEPS + 1
export const GUIDE_QUEST_PHASE2_START = GUIDE_QUEST_PHASE1_STEPS + 1
export const GUIDE_QUEST_PHASE3_START = mainlineStepOf('rune')
export const GUIDE_QUEST_GOALS = MAINLINE_TASKS.map((step) => step.goal)

export type GuideQuestView = {
  step: number
  taskId: string
  phase: number
  phaseStep: number
  phaseTotal: number
  title: string
  goal: string
  rewardLabel: string
  progress: 0 | 1
  progressLabel: string
  claimable: boolean
  fillPct: number
  waiting: boolean
  /** 等级任务领奖后要开的功能。其它任务为空。 */
  unlockNote: string | null
}

export function normalizeGuideQuestStep(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) return 1
  return Math.min(GUIDE_QUEST_DONE_STEP, Math.floor(value))
}

export function normalizeGuideQuestRev(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) return 0
  return Math.floor(value)
}

export function normalizeStarterCopperPawnDone(value: unknown): boolean {
  return value === true
}

export function normalizeGuideQuestPotionUsed(value: unknown): boolean {
  return value === true
}

export function normalizeGuideQuestRuneOpened(value: unknown): boolean {
  return value === true
}

export function hasCompletedStarterCopperPawn(encounters: readonly Encounter[]): boolean {
  return encounters.some((enc) => isStarterCopperPawn(enc) && enc.completed)
}

export function hasCompletedMainlineOrder(
  save: Pick<Save, 'encounters' | 'starterCopperPawnDone' | 'marketEncounters'> & {
    guideQuestStats?: Save['guideQuestStats']
  },
): boolean {
  if ((save.guideQuestStats?.marketDeals ?? 0) > 0) return true
  return save.marketEncounters?.some((enc) => isEncounterDone(enc)) ?? false
}

export function openDealEncounters(encounters: readonly Encounter[]): Encounter[] {
  return encounters.filter((enc) => enc.kind !== 'enemy' && !enc.completed)
}

export function hasStarterCopperPawn(encounters: readonly Encounter[]): boolean {
  return encounters.some((enc) => isStarterCopperPawn(enc))
}

export function hasAssignedHerbalism(save: Save): boolean {
  if (save.workers.some((w) => w.assignment === 'herbalism')) return true
  return (save.stations.herbalism?.completed ?? 0) >= 1
}

export function hasFusedWorkers(save: Save): boolean {
  return save.workers.some((w) => w.qualityTier >= 2)
}

/** 营地已选定一份共享伙食。未选（null）不算。 */
export function hasSelectedRestFood(save: Pick<Save, 'restFoodId'>): boolean {
  return save.restFoodId != null
}

/** 选人弹层点过「开战」入战即可。点订单卡「开战」只开框，不算。不要求分出胜负或领战利品。旧档已出发/已有战斗态也算。 */
export function hasStartedBattlefieldCombat(save: Save): boolean {
  if ((save.departCount ?? 0) >= 1) return true
  if ((save.mainLootClaims ?? 0) >= 1) return true
  return save.encounters.some((enc) => {
    if (enc.kind !== 'enemy') return false
    if (enc.lootClaimed || enc.departed) return true
    return enc.combat != null
  })
}

export function hasProducedAlchemyPotion(save: Save): boolean {
  if ((save.stations.alchemy?.completed ?? 0) >= 1) return true
  if (save.potionSlots.some((id) => id != null)) return true
  return POTION_ITEM_IDS.some((id) => bankQty(save, id) > 0)
}

export function hasInstalledPotion(save: Save): boolean {
  return save.potionSlots.some((id) => id != null)
}

export function hasUsedPotionFromSlot(save: Save): boolean {
  if (save.guideQuestPotionUsed) return true
  return anyWorkerHasPotionBuff(save)
}

export function isGuideQuestPhase2Open(save: Pick<Save, 'knightLevel'>): boolean {
  return knightLevelOf(save) >= GUIDE_QUEST_PHASE2_KNIGHT
}

/** 符文槽按铭刻模块是否已由主线打开。 */
export function isGuideQuestPhase3Open(save: Pick<Save, 'knightLevel' | 'openedModules'>): boolean {
  return isModuleUnlocked(save, 'rune')
}

export function hasOpenedRunePick(save: Pick<Save, 'guideQuestRuneOpened'>): boolean {
  return save.guideQuestRuneOpened === true
}

export function markGuideQuestRuneOpened(save: Save): boolean {
  if (save.guideQuestRuneOpened) return false
  if (!isGuideQuestPhase3Open(save)) return false
  save.guideQuestRuneOpened = true
  return true
}

/** 悬赏卡面出「开战」或「增援」的格子；物资不够的开战仍算出。 */
export function isBattlefieldRuneGuideFight(enc: Encounter): enc is EnemyEncounter {
  if (enc.kind !== 'enemy' || enc.lootClaimed) return false
  if (isFighting(enc)) return canReinforceCombat(enc)
  return !isCombatWon(enc)
}

export function canOpenBattlefieldRuneGuidePick(save: Save, enc: Encounter, index: number): boolean {
  if (!isBattlefieldRuneGuideFight(enc)) return false
  if (isFighting(enc) || isCombatLost(enc)) return true
  return !combatSupplyBlockReason(save, index)
}

export function battlefieldRuneGuideFightIndex(save: Save): number | null {
  for (let i = 0; i < save.encounters.length; i++) {
    if (isBattlefieldRuneGuideFight(save.encounters[i])) return i
  }
  return null
}

export function battlefieldRuneGuideOpenIndex(save: Save): number | null {
  for (let i = 0; i < save.encounters.length; i++) {
    if (canOpenBattlefieldRuneGuidePick(save, save.encounters[i], i)) return i
  }
  return null
}

export function hasClickableBattlefieldRuneFight(save: Save): boolean {
  return battlefieldRuneGuideFightIndex(save) != null
}

/** 已抽/已生成工人次数。花名册与 nextWorkerId 取较大，合成后仍算抽过。 */
export function guideQuestRecruitCount(save: Pick<Save, 'workers' | 'nextWorkerId'>): number {
  const roster = save.workers.length
  const spawned = Math.max(0, Math.floor(save.nextWorkerId) - 1)
  return Math.max(roster, spawned)
}

export function hasRecruitedGuideWorkers(save: Pick<Save, 'workers' | 'nextWorkerId'>): boolean {
  return guideQuestRecruitCount(save) >= GUIDE_QUEST_RECRUIT_NEED
}

export function advanceSkippedGuideSteps(save: Save): void {
  const skipped = new Set(save.guideQuestSkipped ?? [])
  let step = normalizeGuideQuestStep(save.guideQuestStep)
  while (step < GUIDE_QUEST_DONE_STEP) {
    const row = mainlineTaskAt(step)
    if (!row || !skipped.has(row.id)) break
    step += 1
  }
  save.guideQuestStep = step
  grantPassedLevelModules(save)
}

export function guideQuestProgressAt(save: Save, step: number): 0 | 1 {
  const row = mainlineTaskAt(step)
  if (!row) return 0
  return mainlineDone(save, row.id) ? 1 : 0
}

/** 第一未完成步；九步都齐则 10。 */
export function firstIncompleteGuideQuestStep(save: Save): number {
  for (let step = 1; step <= GUIDE_QUEST_STEPS; step++) {
    if (guideQuestProgressAt(save, step) < 1) return step
  }
  return GUIDE_QUEST_DONE_STEP
}

export function isGuideQuestDone(save: Save): boolean {
  return normalizeGuideQuestStep(save.guideQuestStep) >= GUIDE_QUEST_DONE_STEP
}

export function isGuideQuestVisible(save: Save): boolean {
  return guideQuestView(save) != null
}

export type GuideQuestFlashId = string

export function guideQuestFlashId(save: Save): GuideQuestFlashId | null {
  const view = guideQuestView(save)
  if (!view || view.claimable || view.waiting) return null
  return view.taskId
}

export function isGuideQuestFlash(save: Save, id: GuideQuestFlashId): boolean {
  return guideQuestFlashId(save) === id
}

/** 药剂槽高亮。两槽齐备和装药只圈空槽，满 2 个可领后不再圈；用药圈已装上的槽。 */
export function guidePotionSlotFlash(save: Save, occupied: boolean): boolean {
  if (isGuideQuestFlash(save, 'slotsFull') || isGuideQuestFlash(save, 'potionInstall')) return !occupied
  if (isGuideQuestFlash(save, 'potionUse')) return occupied && !guideNeedsCampForPotion(save)
  return false
}

export function guideCombatNeedsHerbs(save: Save): boolean {
  if (hasStartedBattlefieldCombat(save)) return false
  return bankQty(save, 'herb') < STARTER_GUIDE_HERB_QTY
}

const ALCHEMY_GUIDE_INPUTS = ['herb', 'blood', 'tooth', 'eye'] as const

export function guideAlchemyNeedsHerbs(save: Save): boolean {
  if (hasProducedAlchemyPotion(save)) return false
  return ALCHEMY_GUIDE_INPUTS.every((id) => bankQty(save, id) < 1)
}

export function guideNeedsCampForPotion(save: Save): boolean {
  return restingWorkers(save).length === 0
}

const GUIDE_HEAL_POTIONS = new Set(['salve', 'brinkSalve', 'clearMind', 'renewSoup'])

/** 用药步装着回血药、营地又全员满血时，把队尾打残，点下去才治得了。提效药满血可用，空槽不打残。只剩一人时只扣 1 点。 */
export function ensureGuidePotionCampTarget(save: Save): void {
  const step = normalizeGuideQuestStep(save.guideQuestStep)
  if (mainlineTaskAt(step)?.id !== 'potionUse') return
  if (hasUsedPotionFromSlot(save)) return
  const camp = restingWorkers(save)
  if (!camp.length || camp.some((worker) => !isFullWorkshopHp(worker))) return
  const installed = (save.potionSlots ?? []).filter((id): id is NonNullable<typeof id> => id != null)
  if (!installed.some((id) => GUIDE_HEAL_POTIONS.has(id))) return
  const target = camp.length > 1 ? camp[camp.length - 1] : camp[0]
  const hpMax = Math.max(1, Math.floor(target.hpMax))
  if (hpMax <= 1) return
  target.fatigueDebt = 0
  target.hp = camp.length > 1 ? Math.max(1, Math.floor(hpMax * 0.5)) : hpMax - 1
  if (target.hp >= hpMax) target.hp = hpMax - 1
}

/** 领到「升到酋长 11 级」后多给一句：第二条自动线开了。 */
export function guideClaimNotice(taskId: string): string | null {
  if (taskId === 'level11') return SECOND_AUTO_LINE_TIP
  return null
}

/** 当前步要点的站卡。草不够、没原料、没人在岗时先回到采药。 */
export function guideDispatchStation(save: Save): StationId | null {
  const id = guideQuestFlashId(save)
  if (!id) return null
  if (id === 'autoHerb' || id === 'herbQueue') return 'herbalism'
  if (id === 'combat' && guideCombatNeedsHerbs(save)) return 'herbalism'
  if (id === 'alchemy' && guideAlchemyNeedsHerbs(save)) return 'herbalism'
  if (id === 'huntStart') return 'hunting'
  if (id === 'cookStart') return 'cooking'
  if (id === 'mining') return 'mining'
  if (id === 'inscribe') return 'inscription'
  return null
}

/** 点任务条要打开的任务。原料或草不够时先打开采药站。 */
export function guideQuestOpenTaskId(save: Save): string | null {
  const view = guideQuestView(save)
  if (!view) return null
  const id = view.taskId
  if (view.waiting) return id
  if (id === 'combat' && guideCombatNeedsHerbs(save)) return 'autoHerb'
  if (id === 'alchemy' && guideAlchemyNeedsHerbs(save)) return 'autoHerb'
  return id
}

/** 出征步要闪的那张悬赏单。草还不够时不闪订单，先闪采药站。 */
export function guideQuestCombatFlashEncounter(save: Save): Encounter | null {
  if (!isGuideQuestFlash(save, 'combat') || guideCombatNeedsHerbs(save)) return null
  const board = save.encounters.filter((enc) => enc.kind === 'enemy')
  return (
    board.find((enc) => enc.kind === 'enemy' && enc.combat?.outcome === 'win' && !enc.lootClaimed) ??
    board.find((enc) => enc.kind === 'enemy' && !enc.lootClaimed && enc.combat?.outcome !== 'lose') ??
    board.find((enc) => enc.kind === 'enemy' && !enc.lootClaimed) ??
    board[0] ??
    null
  )
}

export function isGuideQuestCombatFlash(save: Save, enc: Encounter): boolean {
  const target = guideQuestCombatFlashEncounter(save)
  return !!target && target.id === enc.id
}

export function guideQuestRuneFlashEncounter(save: Save): Encounter | null {
  if (!isGuideQuestFlash(save, 'rune')) return null
  const index = battlefieldRuneGuideFightIndex(save)
  return index == null ? null : save.encounters[index]
}

export function isGuideQuestRuneFlash(save: Save, enc: Encounter): boolean {
  const target = guideQuestRuneFlashEncounter(save)
  return !!target && target.id === enc.id
}

export type GuideFuseCue = 'recruit' | 'openCamp' | 'wait' | 'drag'

function campHasFusePair(save: Save): boolean {
  const counts = new Map<number, number>()
  for (const worker of restingWorkers(save)) {
    if (worker.qualityTier >= QUALITY_MAX) continue
    counts.set(worker.qualityTier, (counts.get(worker.qualityTier) ?? 0) + 1)
  }
  for (const count of counts.values()) {
    if (count >= 2) return true
  }
  return false
}

/** 合伙步未完成时：凑齐两名同品质才让拖；否则等人回营地或再抽。站卡不闪。 */
export function guideFuseCue(save: Save, campOpen: boolean): GuideFuseCue | null {
  const step = normalizeGuideQuestStep(save.guideQuestStep)
  if (mainlineTaskAt(step)?.id !== 'fuse') return null
  if (guideQuestProgressAt(save, step) >= 1) return null
  if (campHasFusePair(save)) return campOpen ? 'drag' : 'openCamp'
  if (restingWorkers(save).length === 0) return 'recruit'
  return 'wait'
}

/** 合成只在营地里进行，站卡不再当作合成目标。 */
export function guideFuseFlashStations(_save: Save, _campOpen: boolean): StationId[] {
  return []
}

/** 炼金步：有原料时闪炼金站卡。详情打开也不改圈详情。 */
export function guideAlchemyCardFlash(save: Save, stationId: StationId): boolean {
  return stationId === 'alchemy' && isGuideQuestFlash(save, 'alchemy') && !guideAlchemyNeedsHerbs(save)
}

function guideStepGoal(save: Save, row: MainlineTask, claimable: boolean, campOpen: boolean): string {
  if (!claimable && row.id === 'recruit') return campOpen ? GUIDE_RECRUIT_OPEN_GOAL : GUIDE_RECRUIT_CLOSED_GOAL
  if (row.id === 'fuse' && !claimable) {
    const cue = guideFuseCue(save, campOpen)
    if (cue === 'recruit') return GUIDE_FUSE_EMPTY_GOAL
    if (cue === 'openCamp') return GUIDE_FUSE_OPEN_GOAL
    if (cue === 'wait') return GUIDE_FUSE_WAIT_GOAL
    return GUIDE_FUSE_DRAG_GOAL
  }
  if (!claimable && row.id === 'combat' && guideCombatNeedsHerbs(save)) return GUIDE_COMBAT_HERB_GOAL
  if (!claimable && row.id === 'alchemy' && guideAlchemyNeedsHerbs(save)) {
    return save.stations.herbalism?.auto ? GUIDE_ALCHEMY_WAIT_HERB_GOAL : GUIDE_ALCHEMY_NEED_HERB_GOAL
  }
  if (!claimable && (row.id === 'potionInstall' || row.id === 'potionUse')) {
    if (row.id === 'potionUse' && guideNeedsCampForPotion(save)) return GUIDE_POTION_NEED_CAMP_GOAL
    if (row.id === 'potionInstall') return campOpen ? GUIDE_POTION_INSTALL_OPEN_GOAL : GUIDE_POTION_INSTALL_CLOSED_GOAL
    return campOpen ? GUIDE_POTION_USE_OPEN_GOAL : GUIDE_POTION_USE_CLOSED_GOAL
  }
  return row.goal
}

function guidePhaseMeta(row: MainlineTask): Pick<GuideQuestView, 'phase' | 'phaseStep' | 'phaseTotal' | 'title'> {
  const start = ['recruit', 'autoHerb', 'herbQueue', 'fuse', 'combat'].indexOf(row.id)
  if (start >= 0) {
    const phaseStep = start + 1
    return {
      phase: 1,
      phaseStep,
      phaseTotal: GUIDE_QUEST_PHASE1_STEPS,
      title: row.title,
    }
  }
  if (row.id === 'potionInstall' || row.id === 'potionUse') {
    const phaseStep = row.id === 'potionInstall' ? 1 : 2
    return {
      phase: 2,
      phaseStep,
      phaseTotal: GUIDE_QUEST_PHASE2_STEPS,
      title: row.title,
    }
  }
  if (row.tier === 'level') {
    return { phase: 0, phaseStep: row.gate, phaseTotal: row.gate, title: row.title }
  }
  return { phase: 3, phaseStep: 1, phaseTotal: 1, title: row.title }
}

function waitingLevelView(save: Save, step: number, row: MainlineTask): GuideQuestView {
  const progress = knightLevelProgress(save)
  return {
    step,
    taskId: row.id,
    phase: 0,
    phaseStep: row.gate,
    phaseTotal: row.gate,
    title: row.title,
    goal: row.goal,
    rewardLabel: mainlineRewardLabel(row.reward),
    progress: 0,
    progressLabel: `酋长 ${progress.level} 级 · 距下一级 ${progress.percent}%`,
    claimable: false,
    fillPct: progress.percent,
    waiting: true,
    unlockNote: levelGateUnlockNote(row.gate),
  }
}

function waitingModuleView(save: Save, step: number, row: MainlineTask): GuideQuestView {
  const progress = knightLevelProgress(save)
  const need = row.module ? moduleUnlockKnightLevel(row.module) : row.gate
  return {
    step,
    taskId: row.id,
    phase: 0,
    phaseStep: need,
    phaseTotal: need,
    title: '下一目标',
    goal: row.module ? moduleLockedTip(row.module) : `先升到 ${need} 级`,
    rewardLabel: mainlineRewardLabel(row.reward),
    progress: 0,
    progressLabel: `酋长 ${progress.level} 级 · 距下一级 ${progress.percent}%`,
    claimable: false,
    fillPct: progress.percent,
    waiting: true,
    unlockNote: row.module ? moduleLockedTip(row.module) : null,
  }
}

export function guideQuestView(save: Save, campOpen = false): GuideQuestView | null {
  const step = normalizeGuideQuestStep(save.guideQuestStep)
  if (step >= GUIDE_QUEST_DONE_STEP) return null
  const row = mainlineTaskAt(step)
  if (!row) return null
  if (row.tier === 'level' && knightLevelOf(save) < row.gate) return waitingLevelView(save, step, row)
  if (!taskModuleReady(save, row)) return waitingModuleView(save, step, row)
  const meter = mainlineMeter(save, row.id)
  const claimable = meter.done
  const meta = guidePhaseMeta(row)
  return {
    step,
    taskId: row.id,
    ...meta,
    goal: guideStepGoal(save, row, claimable, campOpen),
    rewardLabel: mainlineRewardLabel(row.reward),
    progress: claimable ? 1 : 0,
    progressLabel: claimable ? `进度 ${meter.numer}/${meter.denom} · 可领` : `进度 ${meter.numer}/${meter.denom}`,
    claimable,
    fillPct: meter.denom > 0 ? Math.round((meter.numer / meter.denom) * 100) : 0,
    waiting: false,
    unlockNote: row.tier === 'level' ? levelGateUnlockNote(row.gate) : null,
  }
}

export function claimGuideQuest(save: Save): ActionResult {
  syncGuideQuestMet(save)
  advanceSkippedGuideSteps(save)
  const step = normalizeGuideQuestStep(save.guideQuestStep)
  if (step >= GUIDE_QUEST_DONE_STEP) return { ok: false, reason: '新手任务已完成' }
  const row = mainlineTaskAt(step)
  if (!row) return { ok: false, reason: '新手任务已完成' }
  if (row.tier === 'level' && knightLevelOf(save) < row.gate) return { ok: false, reason: row.goal }
  if (!taskModuleReady(save, row)) {
    return { ok: false, reason: row.module ? moduleLockedTip(row.module) : '尚未开放' }
  }
  if (!mainlineDone(save, row.id)) return { ok: false, reason: '尚未完成' }
  const message = payMainlineReward(save, row.reward)
  save.guideQuestStep = step + 1
  advanceSkippedGuideSteps(save)
  return { ok: true, message }
}

export function hydrateGuideQuestFields(save: Save, raw?: object): Save {
  const incoming = save as Save & {
    starterCopperPawnDone?: unknown
    guideQuestStep?: unknown
    guideQuestRev?: unknown
    guideQuestPotionUsed?: unknown
    guideQuestRuneOpened?: unknown
    guideQuestSkipped?: unknown
    guideQuestMet?: unknown
  }
  incoming.starterCopperPawnDone = incoming.starterCopperPawnDone === true
  incoming.guideQuestPotionUsed = normalizeGuideQuestPotionUsed(incoming.guideQuestPotionUsed)
  incoming.guideQuestRuneOpened = normalizeGuideQuestRuneOpened(incoming.guideQuestRuneOpened)
  incoming.guideQuestSkipped = normalizeGuideIdList(incoming.guideQuestSkipped)
  incoming.guideQuestMet = normalizeGuideIdList(incoming.guideQuestMet)
  incoming.guideQuestSkipMask = normalizeSkipMask(incoming.guideQuestSkipMask)
  incoming.guideQuestRev = GUIDE_QUEST_REV
  incoming.guideQuestStep = normalizeGuideQuestStep(incoming.guideQuestStep)
  advanceSkippedGuideSteps(save)
  syncGuideQuestMet(save)
  return save
}
