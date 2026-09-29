import { assignedWorkers, restingWorkers } from './assign'
import { bankQty } from './bank'
import { canReinforceCombat, isCombatLost, isCombatWon, isFighting } from './combat'
import { combatSupplyBlockReason, isEncounterDone, isStarterCopperPawn } from './encounters'
import { isModuleUnlocked, knightLevelProgress, moduleLabel, moduleUnlockKnightLevel, queueModuleUnlocks } from './moduleUnlock'
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
  migrateOldGuide,
  normalizeGuideIdList,
  normalizeSkipMask,
  payMainlineReward,
  seedGuideEvidence,
  syncGuideQuestMet,
  taskModuleReady,
  type MainlineTask,
} from './mainlineQuest'

export const GUIDE_QUEST_PHASE1_STEPS = 5
export const GUIDE_QUEST_PHASE2_STEPS = 2
export const GUIDE_QUEST_PHASE3_STEPS = 1
/** 旧九步引导领完后的步号。REV 6 起只用来认老档。 */
export const GUIDE_OLD_DONE_STEP = 10
export const GUIDE_QUEST_GOLD = 20
/** 骑士 1 级即可装槽 / 点用。主线在升到 2 级之后才引导炼金，开战排在炼金前面。 */
export const GUIDE_QUEST_PHASE2_KNIGHT = 1
/**
 * 9：确认过的 90 步清单。升到 N 级达到即完成，并接上该级的开放卡片。
 * 旧 REV 从第 1 条连续跳过已满足的任务，停在第一条未满足的上，跳过的不发奖。
 * 跳过位图记到 90 步。旧步号到 10 视为旧段已领完。第一步仍须抽工人 2 次。
 */
export const GUIDE_QUEST_REV = 9
/** 第 1 步还没打开营地。 */
export const GUIDE_RECRUIT_CLOSED_GOAL = '点底部营地，抽取苦工 2 次'
/** 第 1 步营地弹框已打开。 */
export const GUIDE_RECRUIT_OPEN_GOAL = '在营地弹框里抽取苦工 2 次'
/** 第 2 步还没打开营地。 */
export const GUIDE_AUTO_HERB_CLOSED_GOAL = '点底部营地，队首满血会自动上采药站'
/** 第 2 步营地弹框已打开。 */
export const GUIDE_AUTO_HERB_OPEN_GOAL = '看营地弹框里的队首，满血就会上采药站'
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

/** 符文槽按铭刻门槛或老档已玩过才开。 */
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

/** 出征步要闪的那张悬赏单上的敌人：未入战可点「开战」的优先，否则第一张未领。 */
export function guideQuestCombatFlashEncounter(save: Save): Encounter | null {
  if (!isGuideQuestFlash(save, 'combat')) return null
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
  return stationId === 'alchemy' && isGuideQuestFlash(save, 'alchemy') && openDetail !== 'alchemy'
}

/** 炼金详情打开后，闪里面的制造进度。 */
export function guideAlchemyProgressFlash(save: Save, stationId: StationId): boolean {
  return stationId === 'alchemy' && isGuideQuestFlash(save, 'alchemy')
}

function guideStepGoal(save: Save, row: MainlineTask, claimable: boolean, campOpen: boolean): string {
  if (!claimable && row.id === 'recruit') return campOpen ? GUIDE_RECRUIT_OPEN_GOAL : GUIDE_RECRUIT_CLOSED_GOAL
  if (!claimable && row.id === 'autoHerb') return campOpen ? GUIDE_AUTO_HERB_OPEN_GOAL : GUIDE_AUTO_HERB_CLOSED_GOAL
  if (row.id === 'fuse' && !claimable) {
    const cue = guideFuseCue(save, campOpen)
    if (cue === 'recruit') return GUIDE_FUSE_EMPTY_GOAL
    if (cue === 'openCamp') return GUIDE_FUSE_OPEN_GOAL
    return GUIDE_FUSE_DRAG_GOAL
  }
  return row.goal
}

function guidePhaseMeta(row: MainlineTask): Pick<GuideQuestView, 'phase' | 'phaseStep' | 'phaseTotal' | 'title'> {
  const start = ['recruit', 'autoHerb', 'fuse', 'combat', 'alchemy'].indexOf(row.id)
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
    goal: `下一个目标：酋长 ${need} 级开放${name}`,
    rewardLabel: mainlineRewardLabel(row.reward),
    progress: 0,
    progressLabel: `酋长 ${progress.level} 级 · 距下一级 ${progress.percent}%`,
    claimable: false,
    fillPct: progress.percent,
    waiting: true,
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
    return { ok: false, reason: row.module ? `酋长 ${moduleUnlockKnightLevel(row.module)} 级开放${moduleLabel(row.module)}` : '尚未开放' }
  }
  if (!mainlineDone(save, row.id)) return { ok: false, reason: '尚未完成' }
  const message = payMainlineReward(save, row.reward)
  if (row.tier === 'level') queueModuleUnlocks(save, row.gate - 1, row.gate)
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
  incoming.guideQuestPotionUsed =
    normalizeGuideQuestPotionUsed(incoming.guideQuestPotionUsed) || hasUsedPotionFromSlot(save)
  incoming.guideQuestRuneOpened = normalizeGuideQuestRuneOpened(incoming.guideQuestRuneOpened)
  incoming.guideQuestSkipped = normalizeGuideIdList(incoming.guideQuestSkipped)
  incoming.guideQuestMet = normalizeGuideIdList(incoming.guideQuestMet)
  incoming.guideQuestSkipMask = normalizeSkipMask(incoming.guideQuestSkipMask)
  seedGuideEvidence(save)

  const hadRev = !!raw && Object.prototype.hasOwnProperty.call(raw, 'guideQuestRev')
  const hadStep = !!raw && Object.prototype.hasOwnProperty.call(raw, 'guideQuestStep')
  const rev = normalizeGuideQuestRev(incoming.guideQuestRev)
  const rawStep = hadStep ? Math.max(1, Math.floor(Number(incoming.guideQuestStep)) || 1) : 0
  incoming.guideQuestRev = GUIDE_QUEST_REV

  if (hadRev && rev >= GUIDE_QUEST_REV && hadStep) {
    incoming.guideQuestStep = normalizeGuideQuestStep(incoming.guideQuestStep)
    advanceSkippedGuideSteps(save)
    syncGuideQuestMet(save)
    return save
  }

  migrateOldGuide(save, rev, rawStep, incoming.guideQuestSkipMask)
  advanceSkippedGuideSteps(save)
  syncGuideQuestMet(save)
  return save
}
