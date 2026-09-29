import { assignedWorkers, restingWorkers } from './assign'
import { bankQty } from './bank'
import { canReinforceCombat, isCombatLost, isCombatWon, isFighting } from './combat'
import { allEncounters, combatSupplyBlockReason, isEncounterDone, isStarterCopperPawn } from './encounters'
import { isModuleUnlocked, knightLevelProgress, moduleLabel, type ModuleId } from './moduleUnlock'
import { knightLevelOf } from './stationUnlock'
import { POTION_ITEM_IDS, QUALITY_MAX, STATION_ORDER } from './tables'
import type { ActionResult, Encounter, EnemyEncounter, Save, StationId } from './types'

export const GUIDE_QUEST_PHASE1_STEPS = 4
export const GUIDE_QUEST_PHASE2_STEPS = 3
export const GUIDE_QUEST_PHASE3_STEPS = 1
/** 旧九步引导领完后的步号。REV 6 起只用来认老档。 */
export const GUIDE_OLD_DONE_STEP = 10
export const GUIDE_QUEST_GOLD = 20
/** 骑士 1 级即可做炼金 / 装槽 / 点用。 */
export const GUIDE_QUEST_PHASE2_KNIGHT = 1
/**
 * 6：按解锁分段。旧 REV 按现况重落；已满足的步跳过不发金。
 * 旧步号到 10 视为旧段已领完，只接还没做到的新段。
 * 第一步仍须抽工人 2 次，只抽过 1 次的不跳过。
 */
export const GUIDE_QUEST_REV = 6
/** 第 3 步营地无人时的浮条文案。 */
export const GUIDE_FUSE_EMPTY_GOAL = '再抽 1 名苦工，新人会进营地'
/** 第 3 步营地有人、名单还没打开。 */
export const GUIDE_FUSE_OPEN_GOAL = '点营地，打开名单'
/** 第 3 步营地名单已打开。 */
export const GUIDE_FUSE_DRAG_GOAL = '把营地苦工拖到同品质的人身上合成（营地里两人互拖也行）'
/** 第一阶段「抽工人」完成所需次数（花名册人数或已生成序号，取较大）。 */
export const GUIDE_QUEST_RECRUIT_NEED = 2

type GuideStepId =
  | 'recruit'
  | 'autoHerb'
  | 'fuse'
  | 'combat'
  | 'alchemy'
  | 'potionInstall'
  | 'potionUse'
  | 'tech'
  | 'market'
  | 'restFood'
  | 'dungeon'
  | 'herb'
  | 'beast'
  | 'mining'
  | 'rune'
  | 'treasure'

type GuideStepDef = {
  id: GuideStepId
  knight: number
  module: ModuleId | null
  segment: 'start' | 'potion' | 'tech' | 'market' | 'camp' | 'herb' | 'beast' | 'mining' | 'rune' | 'treasure'
  goal: string
}

const GUIDE_STEPS: readonly GuideStepDef[] = [
  { id: 'recruit', knight: 1, module: null, segment: 'start', goal: '抽取苦工 2 次' },
  { id: 'autoHerb', knight: 1, module: null, segment: 'start', goal: '满血队首会自动上采药，不能手拖空岗' },
  { id: 'fuse', knight: 1, module: null, segment: 'start', goal: '合成两名同品质苦工' },
  { id: 'combat', knight: 1, module: null, segment: 'start', goal: '在 PVE 弹层中点击开战' },
  { id: 'alchemy', knight: 1, module: null, segment: 'potion', goal: '炼金站有人在岗就会自动炼药，等出第一瓶' },
  { id: 'potionInstall', knight: 1, module: null, segment: 'potion', goal: '点工坊底部的空药剂槽，装入药剂' },
  { id: 'potionUse', knight: 1, module: null, segment: 'potion', goal: '点药剂槽产生效果' },
  { id: 'tech', knight: 4, module: 'tech', segment: 'tech', goal: '点亮一项科技' },
  { id: 'market', knight: 6, module: 'market', segment: 'market', goal: '完成一单集市' },
  { id: 'restFood', knight: 8, module: 'restFood', segment: 'camp', goal: '选好营地伙食' },
  { id: 'dungeon', knight: 8, module: 'dungeon', segment: 'camp', goal: '打一次地牢' },
  { id: 'herb', knight: 10, module: 'herb', segment: 'herb', goal: '割一块草地' },
  { id: 'beast', knight: 13, module: 'beast', segment: 'beast', goal: '挑战一次困兽' },
  { id: 'mining', knight: 16, module: 'mining', segment: 'mining', goal: '采矿站有人在岗' },
  { id: 'rune', knight: 18, module: 'rune', segment: 'rune', goal: '在选人面板点开符文槽' },
  { id: 'treasure', knight: 20, module: 'treasure', segment: 'treasure', goal: '开采一次夺宝矿洞' },
]

const OLD_GUIDE_IDS: readonly GuideStepId[] = [
  'recruit',
  'autoHerb',
  'fuse',
  'restFood',
  'combat',
  'alchemy',
  'potionInstall',
  'potionUse',
  'rune',
]

export const GUIDE_QUEST_STEPS = GUIDE_STEPS.length
export const GUIDE_QUEST_DONE_STEP = GUIDE_QUEST_STEPS + 1
export const GUIDE_QUEST_PHASE2_START = GUIDE_QUEST_PHASE1_STEPS + 1
export const GUIDE_QUEST_PHASE3_START = GUIDE_STEPS.findIndex((step) => step.id === 'rune') + 1
export const GUIDE_QUEST_GOALS = GUIDE_STEPS.map((step) => step.goal)

export type GuideQuestView = {
  step: number
  phase: number
  phaseStep: number
  phaseTotal: number
  title: string
  goal: string
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
  save: Pick<Save, 'encounters' | 'starterCopperPawnDone'> & { marketEncounters?: Encounter[] },
): boolean {
  if (save.starterCopperPawnDone) return true
  return allEncounters(save).some((enc) => isEncounterDone(enc))
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

/** 战场卡面出「开战」或「增援」的格子；物资不够的开战仍算出。 */
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

function hasLitTech(save: Save): boolean {
  if ((save.unlockedTechIds?.length ?? 0) > 0) return true
  return Object.values(save.techLevels ?? {}).some((level) => typeof level === 'number' && level > 0)
}

function hasClearedMarket(save: Save): boolean {
  if (save.starterCopperPawnDone) return true
  return save.marketEncounters?.some((enc) => 'completed' in enc && enc.completed) ?? false
}

function hasDungeonRun(save: Save): boolean {
  const used = save.dungeon?.attemptsUsedById
  if (!used) return false
  return Object.values(used).some((n) => typeof n === 'number' && n > 0)
}

function hasCutHerb(save: Save): boolean {
  return (save.herbPvp?.playerScore ?? 0) > 0
}

function hasChallengedBeast(save: Save): boolean {
  return (save.beastPvp?.playerDamage ?? 0) > 0
}

function hasMiningCrew(save: Save): boolean {
  return save.workers.some((worker) => worker.assignment === 'mining')
}

function hasDugTreasure(save: Save): boolean {
  return (save.treasureMines?.mines ?? []).some((mine) => (mine.dugOre ?? 0) > 0 || (mine.dugCrystal ?? 0) > 0)
}

function guideStepDef(step: number): GuideStepDef | null {
  return GUIDE_STEPS[step - 1] ?? null
}

function guideStepIndex(id: GuideStepId): number {
  return GUIDE_STEPS.findIndex((step) => step.id === id) + 1
}

function skipBit(mask: number, step: number): boolean {
  if (step < 1 || step > 30) return false
  return (mask & (1 << (step - 1))) !== 0
}

function withSkipBit(mask: number, step: number): number {
  if (step < 1) return mask
  return mask | (1 << (step - 1))
}

export function advanceSkippedGuideSteps(save: Save): void {
  let step = normalizeGuideQuestStep(save.guideQuestStep)
  const mask = save.guideQuestSkipMask ?? 0
  while (step < GUIDE_QUEST_DONE_STEP && skipBit(mask, step)) step += 1
  save.guideQuestStep = step
}

function stepReady(save: Save, step: GuideStepDef): boolean {
  if (!step.module) return true
  return isModuleUnlocked(save, step.module)
}

export function guideQuestProgressAt(save: Save, step: number): 0 | 1 {
  const def = guideStepDef(step)
  if (!def) return 0
  switch (def.id) {
    case 'recruit':
      return hasRecruitedGuideWorkers(save) ? 1 : 0
    case 'autoHerb':
      return hasAssignedHerbalism(save) ? 1 : 0
    case 'fuse':
      return hasFusedWorkers(save) ? 1 : 0
    case 'combat':
      return hasStartedBattlefieldCombat(save) ? 1 : 0
    case 'alchemy':
      return hasProducedAlchemyPotion(save) ? 1 : 0
    case 'potionInstall':
      return hasInstalledPotion(save) ? 1 : 0
    case 'potionUse':
      return hasUsedPotionFromSlot(save) ? 1 : 0
    case 'tech':
      return hasLitTech(save) ? 1 : 0
    case 'market':
      return hasClearedMarket(save) ? 1 : 0
    case 'restFood':
      return hasSelectedRestFood(save) ? 1 : 0
    case 'dungeon':
      return hasDungeonRun(save) ? 1 : 0
    case 'herb':
      return hasCutHerb(save) ? 1 : 0
    case 'beast':
      return hasChallengedBeast(save) ? 1 : 0
    case 'mining':
      return hasMiningCrew(save) ? 1 : 0
    case 'rune':
      return hasOpenedRunePick(save) ? 1 : 0
    case 'treasure':
      return hasDugTreasure(save) ? 1 : 0
    default:
      return 0
  }
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

export type GuideQuestFlashId = GuideStepId

export function guideQuestFlashId(save: Save): GuideQuestFlashId | null {
  const view = guideQuestView(save)
  if (!view || view.claimable || view.waiting) return null
  return guideStepDef(view.step)?.id ?? null
}

export function isGuideQuestFlash(save: Save, id: GuideQuestFlashId): boolean {
  return guideQuestFlashId(save) === id
}

/** 步骤 5 要闪的那张战场敌：未入战可点「开战」的优先，否则第一张未领。 */
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
  if (normalizeGuideQuestStep(save.guideQuestStep) !== 3) return null
  if (guideQuestProgressAt(save, 3) >= 1) return null
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

function guideStepGoal(save: Save, step: number, claimable: boolean, campOpen: boolean): string {
  const def = guideStepDef(step)
  if (def?.id === 'fuse' && !claimable) {
    const cue = guideFuseCue(save, campOpen)
    if (cue === 'recruit') return GUIDE_FUSE_EMPTY_GOAL
    if (cue === 'openCamp') return GUIDE_FUSE_OPEN_GOAL
    return GUIDE_FUSE_DRAG_GOAL
  }
  return def?.goal ?? ''
}

function guidePhaseMeta(step: number): Pick<GuideQuestView, 'phase' | 'phaseStep' | 'phaseTotal' | 'title'> {
  const def = guideStepDef(step)
  if (!def || def.segment === 'start') {
    const phaseStep = step
    const phaseTotal = GUIDE_QUEST_PHASE1_STEPS
    const title = def?.id === 'combat' ? `工坊 · ${phaseStep}/${phaseTotal}` : `新手 · ${phaseStep}/${phaseTotal}`
    return { phase: 1, phaseStep, phaseTotal, title }
  }
  if (def.segment === 'potion') {
    const phaseStep = step - GUIDE_QUEST_PHASE1_STEPS
    return { phase: 2, phaseStep, phaseTotal: GUIDE_QUEST_PHASE2_STEPS, title: `进阶 · ${phaseStep}/${GUIDE_QUEST_PHASE2_STEPS}` }
  }
  if (def.segment === 'camp') {
    const phaseStep = def.id === 'restFood' ? 1 : 2
    return { phase: 3, phaseStep, phaseTotal: 2, title: `营地 · ${phaseStep}/2` }
  }
  const name =
    def.segment === 'tech'
      ? '科技'
      : def.segment === 'market'
        ? '集市'
        : def.segment === 'herb'
          ? '割草'
          : def.segment === 'beast'
            ? '困兽'
            : def.segment === 'mining'
              ? '采矿'
              : def.segment === 'rune'
                ? '符文'
                : '夺宝'
  return { phase: 3, phaseStep: 1, phaseTotal: 1, title: `${name} · 1/1` }
}

function waitingGuideView(save: Save, step: number, def: GuideStepDef): GuideQuestView {
  const progress = knightLevelProgress(save)
  const name = def.module ? moduleLabel(def.module) : ''
  return {
    step,
    phase: 0,
    phaseStep: def.knight,
    phaseTotal: def.knight,
    title: '下一目标',
    goal: `下一个目标：酋长 ${def.knight} 级开放${name}`,
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
  const def = guideStepDef(step)
  if (!def) return null
  if (!stepReady(save, def)) return waitingGuideView(save, step, def)
  const progress = guideQuestProgressAt(save, step)
  const claimable = progress >= 1
  const meta = guidePhaseMeta(step)
  const recruitHave = Math.min(guideQuestRecruitCount(save), GUIDE_QUEST_RECRUIT_NEED)
  const denom = def.id === 'recruit' ? GUIDE_QUEST_RECRUIT_NEED : 1
  const numer = def.id === 'recruit' ? recruitHave : progress
  return {
    step,
    ...meta,
    goal: guideStepGoal(save, step, claimable, campOpen),
    progress,
    progressLabel: claimable ? `进度 ${numer}/${denom} · 可领` : `进度 ${numer}/${denom}`,
    claimable,
    fillPct: denom > 0 ? Math.round((numer / denom) * 100) : 0,
    waiting: false,
  }
}

export function claimGuideQuest(save: Save): ActionResult {
  advanceSkippedGuideSteps(save)
  const step = normalizeGuideQuestStep(save.guideQuestStep)
  if (step >= GUIDE_QUEST_DONE_STEP) return { ok: false, reason: '新手任务已完成' }
  const def = guideStepDef(step)
  if (def && !stepReady(save, def)) {
    return { ok: false, reason: def.module ? `酋长 ${def.knight} 级开放${moduleLabel(def.module)}` : '尚未开放' }
  }
  if (guideQuestProgressAt(save, step) < 1) return { ok: false, reason: '尚未完成' }
  save.gold += GUIDE_QUEST_GOLD
  save.guideQuestStep = step + 1
  advanceSkippedGuideSteps(save)
  return { ok: true, message: `金币 +${GUIDE_QUEST_GOLD}` }
}

function hydratePawnFlag(save: Save, raw: object | undefined, incoming: Save): void {
  const hadPawn = !!raw && Object.prototype.hasOwnProperty.call(raw, 'starterCopperPawnDone')
  const board = allEncounters(save)
  if (board.some((enc) => isEncounterDone(enc)) || hasCompletedStarterCopperPawn(board)) {
    incoming.starterCopperPawnDone = true
  } else if (hadPawn) {
    incoming.starterCopperPawnDone = normalizeStarterCopperPawnDone(incoming.starterCopperPawnDone)
  } else if (!hasStarterCopperPawn(board) && (save.exploreCount ?? 0) >= 1) {
    incoming.starterCopperPawnDone = true
  } else {
    incoming.starterCopperPawnDone = false
  }
}

export function hydrateGuideQuestFields(save: Save, raw?: object): Save {
  const incoming = save as Save & {
    starterCopperPawnDone?: unknown
    guideQuestStep?: unknown
    guideQuestRev?: unknown
    guideQuestPotionUsed?: unknown
    guideQuestRuneOpened?: unknown
  }
  hydratePawnFlag(save, raw, incoming)

  incoming.guideQuestPotionUsed =
    normalizeGuideQuestPotionUsed(incoming.guideQuestPotionUsed) || hasUsedPotionFromSlot(save)
  incoming.guideQuestRuneOpened = normalizeGuideQuestRuneOpened(incoming.guideQuestRuneOpened)

  const hadRev = !!raw && Object.prototype.hasOwnProperty.call(raw, 'guideQuestRev')
  const hadStep = !!raw && Object.prototype.hasOwnProperty.call(raw, 'guideQuestStep')
  const rev = normalizeGuideQuestRev(incoming.guideQuestRev)
  const rawStep = hadStep ? Math.max(1, Math.floor(Number(incoming.guideQuestStep)) || 1) : 0
  incoming.guideQuestSkipMask =
    typeof incoming.guideQuestSkipMask === 'number' && Number.isFinite(incoming.guideQuestSkipMask)
      ? Math.max(0, Math.floor(incoming.guideQuestSkipMask))
      : 0
  incoming.guideQuestRev = GUIDE_QUEST_REV

  if (hadRev && rev >= GUIDE_QUEST_REV && hadStep) {
    incoming.guideQuestStep = normalizeGuideQuestStep(incoming.guideQuestStep)
    advanceSkippedGuideSteps(save)
    return save
  }

  let mask = incoming.guideQuestSkipMask
  if (rawStep >= GUIDE_OLD_DONE_STEP) {
    for (const id of OLD_GUIDE_IDS) mask = withSkipBit(mask, guideStepIndex(id))
  } else if (rev >= 5 && rawStep > 1) {
    for (let i = 1; i < rawStep && i <= OLD_GUIDE_IDS.length; i += 1) {
      const id = OLD_GUIDE_IDS[i - 1]
      if (id === 'recruit' && !hasRecruitedGuideWorkers(save)) continue
      mask = withSkipBit(mask, guideStepIndex(id))
    }
  }
  for (let step = 1; step <= GUIDE_QUEST_STEPS; step += 1) {
    if (guideQuestProgressAt(save, step) >= 1) mask = withSkipBit(mask, step)
  }
  incoming.guideQuestSkipMask = mask
  incoming.guideQuestStep = 1
  advanceSkippedGuideSteps(save)
  return save
}
