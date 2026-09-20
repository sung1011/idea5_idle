import { bankQty } from './bank'
import { allEncounters, isEncounterDone, isStarterCopperPawn } from './encounters'
import { knightLevelOf } from './stationUnlock'
import { POTION_ITEM_IDS } from './tables'
import type { ActionResult, Encounter, Save } from './types'

export const GUIDE_QUEST_PHASE1_STEPS = 4
export const GUIDE_QUEST_PHASE2_STEPS = 3
export const GUIDE_QUEST_STEPS = GUIDE_QUEST_PHASE1_STEPS + GUIDE_QUEST_PHASE2_STEPS
export const GUIDE_QUEST_GOLD = 20
/** 七步都已领取后的步号；浮层不渲染。 */
export const GUIDE_QUEST_DONE_STEP = GUIDE_QUEST_STEPS + 1
export const GUIDE_QUEST_PHASE2_START = GUIDE_QUEST_PHASE1_STEPS + 1
/** 骑士 2 级才开第二阶段（炼金 / 装槽 / 点用）。 */
export const GUIDE_QUEST_PHASE2_KNIGHT = 2
/** 第一步须抽工人 2 次。缺字段或旧档按现况重落步号。 */
export const GUIDE_QUEST_REV = 3
/** 第一阶段「抽工人」完成所需次数（花名册人数或已生成序号，取较大）。 */
export const GUIDE_QUEST_RECRUIT_NEED = 2

export const GUIDE_QUEST_GOALS = [
  '抽取工人 2 次',
  '把工人派入采药',
  '合成两名同品质工人',
  '在主线弹层中点击战斗',
  '在炼金站炼成药剂',
  '把药剂装进技能槽',
  '点药剂槽产生效果',
] as const

export type GuideQuestView = {
  step: number
  phase: 1 | 2
  phaseStep: number
  phaseTotal: number
  title: string
  goal: string
  progress: 0 | 1
  progressLabel: string
  claimable: boolean
  fillPct: number
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

/** 选人弹层点过「战斗」入战即可。点订单卡「开战」只开框，不算。不要求分出胜负或领战利品。旧档已出发/已有战斗态也算。 */
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
    buffs.wardUntil != null ||
    buffs.focusUntil != null
  )
}

export function isGuideQuestPhase2Open(save: Pick<Save, 'knightLevel'>): boolean {
  return knightLevelOf(save) >= GUIDE_QUEST_PHASE2_KNIGHT
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

export function guideQuestProgressAt(save: Save, step: number): 0 | 1 {
  switch (step) {
    case 1:
      return hasRecruitedGuideWorkers(save) ? 1 : 0
    case 2:
      return hasAssignedHerbalism(save) ? 1 : 0
    case 3:
      return hasFusedWorkers(save) ? 1 : 0
    case 4:
      return hasStartedBattlefieldCombat(save) ? 1 : 0
    case 5:
      return hasProducedAlchemyPotion(save) ? 1 : 0
    case 6:
      return hasInstalledPotion(save) ? 1 : 0
    case 7:
      return hasUsedPotionFromSlot(save) ? 1 : 0
    default:
      return 0
  }
}

/** 第一未完成步；七步都齐则 8。 */
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

export type GuideQuestFlashId =
  | 'recruit'
  | 'assignHerb'
  | 'fuse'
  | 'combat'
  | 'alchemy'
  | 'potionInstall'
  | 'potionUse'

export function guideQuestFlashId(save: Save): GuideQuestFlashId | null {
  const view = guideQuestView(save)
  if (!view || view.claimable) return null
  switch (view.step) {
    case 1:
      return 'recruit'
    case 2:
      return 'assignHerb'
    case 3:
      return 'fuse'
    case 4:
      return 'combat'
    case 5:
      return 'alchemy'
    case 6:
      return 'potionInstall'
    case 7:
      return 'potionUse'
    default:
      return null
  }
}

export function isGuideQuestFlash(save: Save, id: GuideQuestFlashId): boolean {
  return guideQuestFlashId(save) === id
}

/** 步骤 4 要闪的那张战场敌：未入战可点「开战」的优先，否则第一张未领。 */
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

export function guideQuestView(save: Save): GuideQuestView | null {
  const step = normalizeGuideQuestStep(save.guideQuestStep)
  if (step >= GUIDE_QUEST_DONE_STEP) return null
  if (step >= GUIDE_QUEST_PHASE2_START && !isGuideQuestPhase2Open(save)) return null
  const progress = guideQuestProgressAt(save, step)
  const claimable = progress >= 1
  const phase: 1 | 2 = step <= GUIDE_QUEST_PHASE1_STEPS ? 1 : 2
  const phaseStep = phase === 1 ? step : step - GUIDE_QUEST_PHASE1_STEPS
  const phaseTotal = phase === 1 ? GUIDE_QUEST_PHASE1_STEPS : GUIDE_QUEST_PHASE2_STEPS
  const recruitHave = Math.min(guideQuestRecruitCount(save), GUIDE_QUEST_RECRUIT_NEED)
  const denom = step === 1 ? GUIDE_QUEST_RECRUIT_NEED : 1
  const numer = step === 1 ? recruitHave : progress
  return {
    step,
    phase,
    phaseStep,
    phaseTotal,
    title: phase === 1 ? `主线 · ${phaseStep}/${phaseTotal}` : `进阶 · ${phaseStep}/${phaseTotal}`,
    goal: GUIDE_QUEST_GOALS[step - 1] ?? '',
    progress,
    progressLabel: claimable ? `进度 ${numer}/${denom} · 可领` : `进度 ${numer}/${denom}`,
    claimable,
    fillPct: denom > 0 ? Math.round((numer / denom) * 100) : 0,
  }
}

export function claimGuideQuest(save: Save): ActionResult {
  const step = normalizeGuideQuestStep(save.guideQuestStep)
  if (step >= GUIDE_QUEST_DONE_STEP) return { ok: false, reason: '新手任务已完成' }
  if (step >= GUIDE_QUEST_PHASE2_START && !isGuideQuestPhase2Open(save)) {
    return { ok: false, reason: '骑士 2 级开放' }
  }
  if (guideQuestProgressAt(save, step) < 1) return { ok: false, reason: '尚未完成' }
  save.gold += GUIDE_QUEST_GOLD
  save.guideQuestStep = step + 1
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
  }
  hydratePawnFlag(save, raw, incoming)

  incoming.guideQuestPotionUsed =
    normalizeGuideQuestPotionUsed(incoming.guideQuestPotionUsed) || hasUsedPotionFromSlot(save)

  const hadRev = !!raw && Object.prototype.hasOwnProperty.call(raw, 'guideQuestRev')
  const hadStep = !!raw && Object.prototype.hasOwnProperty.call(raw, 'guideQuestStep')
  const rev = normalizeGuideQuestRev(incoming.guideQuestRev)
  incoming.guideQuestRev = GUIDE_QUEST_REV

  if (hadRev && rev >= GUIDE_QUEST_REV && hadStep) {
    incoming.guideQuestStep = normalizeGuideQuestStep(incoming.guideQuestStep)
    return save
  }

  incoming.guideQuestStep = firstIncompleteGuideQuestStep(save)
  return save
}
