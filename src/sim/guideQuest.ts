import { isStarterCopperPawn } from './encounters'
import { techLevel } from './tech'
import type { ActionResult, Encounter, Save } from './types'

export const GUIDE_QUEST_STEPS = 5
export const GUIDE_QUEST_GOLD = 20
/** 五步都已领取后的步号；浮层不渲染。 */
export const GUIDE_QUEST_DONE_STEP = 6
export const PATH_OUTPOST_TECH_ID = 'pathOutpost'

export const GUIDE_QUEST_GOALS = [
  '在工人中抽取工人（≥1）',
  '在工坊中完成一次采矿产出',
  '在主线中成交开局铜矿当铺单',
  '在主线中成功探索一次',
  '在科技的事务中点亮探路哨岗',
] as const

export type GuideQuestView = {
  step: number
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

export function normalizeStarterCopperPawnDone(value: unknown): boolean {
  return value === true
}

export function hasCompletedStarterCopperPawn(encounters: readonly Encounter[]): boolean {
  return encounters.some((enc) => isStarterCopperPawn(enc) && enc.completed)
}

export function hasStarterCopperPawn(encounters: readonly Encounter[]): boolean {
  return encounters.some((enc) => isStarterCopperPawn(enc))
}

export function guideQuestProgressAt(save: Save, step: number): 0 | 1 {
  switch (step) {
    case 1:
      return save.workers.length >= 1 ? 1 : 0
    case 2:
      return (save.stations.mining?.completed ?? 0) >= 1 ? 1 : 0
    case 3:
      return save.starterCopperPawnDone || hasCompletedStarterCopperPawn(save.encounters) ? 1 : 0
    case 4:
      return (Number.isFinite(save.exploreCount) ? save.exploreCount : 0) >= 1 ? 1 : 0
    case 5:
      return techLevel(save, PATH_OUTPOST_TECH_ID) >= 1 ? 1 : 0
    default:
      return 0
  }
}

/** 第一未完成步；五步都齐则 6。 */
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
  return !isGuideQuestDone(save)
}

/** 当前未完成步要闪的目标。可领 / 已完成 / 浮层关闭则为 null。 */
export type GuideQuestFlashId = 'recruit' | 'mining' | 'starterPawn' | 'explore' | 'pathOutpost'

export function guideQuestFlashId(save: Save): GuideQuestFlashId | null {
  const view = guideQuestView(save)
  if (!view || view.claimable) return null
  switch (view.step) {
    case 1:
      return 'recruit'
    case 2:
      return 'mining'
    case 3:
      return 'starterPawn'
    case 4:
      return 'explore'
    case 5:
      return 'pathOutpost'
    default:
      return null
  }
}

export function isGuideQuestFlash(save: Save, id: GuideQuestFlashId): boolean {
  return guideQuestFlashId(save) === id
}

export function guideQuestView(save: Save): GuideQuestView | null {
  const step = normalizeGuideQuestStep(save.guideQuestStep)
  if (step >= GUIDE_QUEST_DONE_STEP) return null
  const progress = guideQuestProgressAt(save, step)
  const claimable = progress >= 1
  return {
    step,
    title: `主线 · ${step}/${GUIDE_QUEST_STEPS}`,
    goal: GUIDE_QUEST_GOALS[step - 1] ?? '',
    progress,
    progressLabel: claimable ? `进度 ${progress}/1 · 可领` : `进度 ${progress}/1`,
    claimable,
    fillPct: claimable ? 100 : 0,
  }
}

export function claimGuideQuest(save: Save): ActionResult {
  const step = normalizeGuideQuestStep(save.guideQuestStep)
  if (step >= GUIDE_QUEST_DONE_STEP) return { ok: false, reason: '新手任务已完成' }
  if (guideQuestProgressAt(save, step) < 1) return { ok: false, reason: '尚未完成' }
  save.gold += GUIDE_QUEST_GOLD
  save.guideQuestStep = step + 1
  return { ok: true, message: `金币 +${GUIDE_QUEST_GOLD}` }
}

export function hydrateGuideQuestFields(save: Save, raw?: object): Save {
  const hadStep = !!raw && Object.prototype.hasOwnProperty.call(raw, 'guideQuestStep')
  const hadPawn = !!raw && Object.prototype.hasOwnProperty.call(raw, 'starterCopperPawnDone')
  const incoming = save as Save & { starterCopperPawnDone?: unknown; guideQuestStep?: unknown }

  if (hasCompletedStarterCopperPawn(save.encounters)) {
    incoming.starterCopperPawnDone = true
  } else if (hadPawn) {
    incoming.starterCopperPawnDone = normalizeStarterCopperPawnDone(incoming.starterCopperPawnDone)
  } else if (!hasStarterCopperPawn(save.encounters) && (save.exploreCount ?? 0) >= 1) {
    incoming.starterCopperPawnDone = true
  } else {
    incoming.starterCopperPawnDone = false
  }

  if (hadStep) {
    incoming.guideQuestStep = normalizeGuideQuestStep(incoming.guideQuestStep)
  } else {
    incoming.guideQuestStep = firstIncompleteGuideQuestStep(save)
  }
  return save
}
