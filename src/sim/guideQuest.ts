import { assignedWorkers, restingWorkers } from './assign'
import { bankQty } from './bank'
import { canReinforceCombat, isCombatLost, isCombatWon, isFighting } from './combat'
import { combatSupplyBlockReason, isEncounterDone, isStarterCopperPawn, STARTER_GUIDE_HERB_QTY } from './encounters'
import { isModuleUnlocked, knightLevelProgress, levelGateUnlockNote, moduleLabel, moduleLockedTip, moduleUnlockKnightLevel, SECOND_AUTO_LINE_TIP } from './moduleUnlock'
import { knightLevelOf } from './stationUnlock'
import { POTION_ITEM_IDS, QUALITY_MAX, STATION_ORDER } from './tables'
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
/** 早期引导领完招兵到用药之前的参考步号。不再用来迁移旧档。 */
export const GUIDE_OLD_DONE_STEP = 10
export const GUIDE_QUEST_GOLD = 20
/** 骑士 1 级即可装槽 / 点用。主线在升到 2 级、挂上自动线之后才引导炼金。 */
export const GUIDE_QUEST_PHASE2_KNIGHT = 1
/**
 * 9：确认过的清单，另插入派工、排队和挂自动。升到 N 级的任务领奖后才开启该级功能。
 * 存档版本对不上整档丢弃，读档不再按旧 REV 跳过已满足的任务。第一步仍须抽工人 2 次。
 */
export const GUIDE_QUEST_REV = 9
/** 第 1 步还没打开营地。 */
export const GUIDE_RECRUIT_CLOSED_GOAL = '点底部营地，抽取苦工 2 次'
/** 第 1 步营地弹框已打开。 */
export const GUIDE_RECRUIT_OPEN_GOAL = '在营地弹框里抽取苦工 2 次'
/** 第 3 步营地无人时的浮条文案。 */
export const GUIDE_FUSE_EMPTY_GOAL = '点底部营地，再抽 1 名苦工，新人会进营地'
/** 第 3 步营地有人、名单还没打开。 */
export const GUIDE_FUSE_OPEN_GOAL = '点底部营地，打开名单'
/** 开战步卡面弱点行说明。 */
export const GUIDE_WEAKNESS_CARD_TIP =
  '敌人有弱点，派属性对得上的苦工出战，伤害更高，还会削敌人的盾；盾打空会破防，敌人暂停出手。'
/** 开战步选人面板，对准带「推荐」的苦工。 */
export const GUIDE_WEAKNESS_PICK_TIP = '这名苦工的属性正好打中弱点'
/** 第 3 步营地名单已打开。 */
export const GUIDE_FUSE_DRAG_GOAL = '在营地弹框里按住苦工，往任意方向拖到同品质的人身上合成'
/** 出征步草还不够首单时，先回到采药站连点。 */
export const GUIDE_COMBAT_HERB_GOAL = '草不够开战。继续点采药站排队，攒够 2 株草'
/** 熬药步还没有原料。 */
export const GUIDE_ALCHEMY_NEED_HERB_GOAL = '先点采药站出草，再点炼金站派工'
/** 采药已经挂上自动，等出草再点炼金。 */
export const GUIDE_ALCHEMY_WAIT_HERB_GOAL = '等采药站出草，再点炼金站派工'
/** 有原料时点炼金站派一轮。 */
export const GUIDE_ALCHEMY_CLICK_GOAL = '点炼金站，把队首派上去熬一轮药'
/** 用药步工坊没人在岗。 */
export const GUIDE_POTION_NEED_DUTY_GOAL = '先点一个站把人派上去，再点药剂槽用药'
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
  const buffs = save.potionBuffs
  if (!buffs) return false
  return (
    buffs.stimUntil != null ||
    buffs.renewUntil != null ||
    buffs.doubleMist != null ||
    buffs.rushStation != null
  )
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

export function guideCombatNeedsHerbs(save: Save): boolean {
  if (hasStartedBattlefieldCombat(save)) return false
  return bankQty(save, 'herb') < STARTER_GUIDE_HERB_QTY
}

const ALCHEMY_GUIDE_INPUTS = ['herb', 'blood', 'tooth', 'eye'] as const

export function guideAlchemyNeedsHerbs(save: Save): boolean {
  if (hasProducedAlchemyPotion(save)) return false
  return ALCHEMY_GUIDE_INPUTS.every((id) => bankQty(save, id) < 1)
}

export function guideNeedsDutyForPotion(save: Save): boolean {
  return !save.workers.some((worker) => worker.assignment != null)
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
  if (id === 'potionUse' && guideNeedsDutyForPotion(save)) return 'herbalism'
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
  if (id === 'potionUse' && guideNeedsDutyForPotion(save)) return 'autoHerb'
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

export type GuideFuseCue = 'recruit' | 'openCamp' | 'drag'

/** 第 3 步未完成时按营地人数和名单开关决定闪哪里。完成可领后不再闪。 */
export function guideFuseCue(save: Save, campOpen: boolean): GuideFuseCue | null {
  const step = normalizeGuideQuestStep(save.guideQuestStep)
  if (mainlineTaskAt(step)?.id !== 'fuse') return null
  if (guideQuestProgressAt(save, step) >= 1) return null
  if (restingWorkers(save).length === 0) return 'recruit'
  if (!campOpen) return 'openCamp'
  return 'drag'
}

/** 名单打开后，闪和营地里某人同品质、且还能再合的在岗站。 */
export function guideFuseFlashStations(save: Save, campOpen: boolean): StationId[] {
  if (guideFuseCue(save, campOpen) !== 'drag') return []
  const tiers = new Set(
    restingWorkers(save)
      .map((worker) => worker.qualityTier)
      .filter((tier) => tier < QUALITY_MAX),
  )
  if (!tiers.size) return []
  const stations: StationId[] = []
  for (const stationId of STATION_ORDER) {
    const worker = assignedWorkers(save, stationId)[0]
    if (worker && tiers.has(worker.qualityTier)) stations.push(stationId)
  }
  return stations
}

/** 炼金步：详情没开时闪炼金站卡。 */
export function guideAlchemyCardFlash(save: Save, stationId: StationId, openDetail: StationId | null): boolean {
  return stationId === 'alchemy' && isGuideQuestFlash(save, 'alchemy') && !guideAlchemyNeedsHerbs(save) && openDetail !== 'alchemy'
}

/** 炼金详情打开后，闪里面的制造进度。 */
export function guideAlchemyProgressFlash(save: Save, stationId: StationId): boolean {
  return stationId === 'alchemy' && isGuideQuestFlash(save, 'alchemy')
}

function guideStepGoal(save: Save, row: MainlineTask, claimable: boolean, campOpen: boolean): string {
  if (!claimable && row.id === 'recruit') return campOpen ? GUIDE_RECRUIT_OPEN_GOAL : GUIDE_RECRUIT_CLOSED_GOAL
  if (row.id === 'fuse' && !claimable) {
    const cue = guideFuseCue(save, campOpen)
    if (cue === 'recruit') return GUIDE_FUSE_EMPTY_GOAL
    if (cue === 'openCamp') return GUIDE_FUSE_OPEN_GOAL
    return GUIDE_FUSE_DRAG_GOAL
  }
  if (!claimable && row.id === 'combat' && guideCombatNeedsHerbs(save)) return GUIDE_COMBAT_HERB_GOAL
  if (!claimable && row.id === 'alchemy' && guideAlchemyNeedsHerbs(save)) {
    return save.stations.herbalism?.auto ? GUIDE_ALCHEMY_WAIT_HERB_GOAL : GUIDE_ALCHEMY_NEED_HERB_GOAL
  }
  if (!claimable && row.id === 'potionUse' && guideNeedsDutyForPotion(save)) return GUIDE_POTION_NEED_DUTY_GOAL
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
  const name = row.module ? moduleLabel(row.module) : ''
  return {
    step,
    taskId: row.id,
    phase: 0,
    phaseStep: need,
    phaseTotal: need,
    title: '下一目标',
    goal: row.module ? moduleLockedTip(row.module) : `下一个目标：酋长 ${need} 级开放${name}`,
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
