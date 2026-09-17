import { syncKnightLevel } from './knightLevel'
import { OFFLINE_CAP_S, RECRUIT_COST } from './tables'
import type { ActionResult, Save, StationId, TechId } from './types'

/** 任意站完成 1 次周期给 1 点灵感。 */
export const CYCLE_TECH_POINTS = 1
/** @deprecated 旧名，等同 CYCLE_TECH_POINTS */
export const CRAFT_TECH_POINTS = CYCLE_TECH_POINTS

export type TechNodeDef = {
  id: TechId
  name: string
  desc: string
  cost: number
  /** 占位。本阶段结算不读。 */
  effectId: string
}

/** 线性 10 档。必须先解锁前一档。效果稍后开放。 */
export const TECH_TREE: readonly TechNodeDef[] = [
  { id: 'workshopLog', name: '工坊日志', desc: '记下每日吞吐与空转，方便回看。', cost: 1, effectId: 'workshopLog' },
  { id: 'apprenticeNotes', name: '学徒笔记', desc: '学徒手抄的工序要点。', cost: 2, effectId: 'apprenticeNotes' },
  { id: 'artisanManual', name: '匠人手册', desc: '各站配方的对照手册。', cost: 3, effectId: 'artisanManual' },
  { id: 'workshopRules', name: '工坊规章', desc: '排班与缺料的规矩。', cost: 5, effectId: 'workshopRules' },
  { id: 'pipelineChart', name: '流水线图', desc: '站与站之间的物流草图。', cost: 8, effectId: 'pipelineChart' },
  { id: 'artisanArchive', name: '工匠密录', desc: '软失败与遇险攒下的经验。', cost: 12, effectId: 'artisanArchive' },
  { id: 'knightEdict', name: '骑士训令', desc: '骑士对工坊的号令。', cost: 18, effectId: 'knightEdict' },
  { id: 'crestDraft', name: '纹章底稿', desc: '纹章未上色的底稿。', cost: 25, effectId: 'crestDraft' },
  { id: 'workshopCrest', name: '工坊纹章', desc: '工坊自己的徽记。', cost: 35, effectId: 'workshopCrest' },
  { id: 'knightCrest', name: '骑士工坊纹章', desc: '正式授纹。科技树到此为止。', cost: 50, effectId: 'knightCrest' },
]

export const TECH_IDS = TECH_TREE.map((node) => node.id)

const TECH_ID_SET = new Set<TechId>(TECH_IDS)

export function isTechId(value: unknown): value is TechId {
  return typeof value === 'string' && TECH_ID_SET.has(value as TechId)
}

export function techNode(id: TechId): TechNodeDef {
  return TECH_TREE.find((node) => node.id === id) ?? TECH_TREE[0]
}

export function normalizeTechPoints(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return Math.floor(value)
}

/** 只保留树的连续前缀。跳档、脏 id、缺字段都钉回合法线性进度。 */
export function hydrateUnlockedTechIds(raw: unknown): TechId[] {
  if (!Array.isArray(raw)) return []
  const have = new Set(raw.filter(isTechId))
  const out: TechId[] = []
  for (const node of TECH_TREE) {
    if (!have.has(node.id)) break
    out.push(node.id)
  }
  return out
}

export function hydrateTechFields(save: Save & { inspiration?: unknown }): void {
  const hasPoints =
    typeof save.techPoints === 'number' && Number.isFinite(save.techPoints) && save.techPoints > 0
  save.techPoints = normalizeTechPoints(hasPoints ? save.techPoints : save.inspiration)
  save.unlockedTechIds = hydrateUnlockedTechIds(save.unlockedTechIds)
  syncKnightLevel(save)
}

export function hasTech(save: Save, id: TechId): boolean {
  return hydrateUnlockedTechIds(save.unlockedTechIds).includes(id)
}

export function nextTech(save: Save): TechNodeDef | null {
  const index = hydrateUnlockedTechIds(save.unlockedTechIds).length
  return TECH_TREE[index] ?? null
}

export function isTechComplete(save: Save): boolean {
  return hydrateUnlockedTechIds(save.unlockedTechIds).length >= TECH_TREE.length
}

export function techTier(save: Save): number {
  return hydrateUnlockedTechIds(save.unlockedTechIds).length
}

/** 结算占位：科技效果本阶段恒为 0。 */
export function techEffectValue(_save: Save, _effectId: string): number {
  return 0
}

/** 结算占位。恒 no-op。 */
export function applyTechEffects(_save: Save): void {}

/** 抽人费不受科技影响。 */
export function recruitCost(_save: Save): number {
  return RECRUIT_COST
}

/** 探索费减免恒 0。 */
export function exploreCostReduce(_save: Save): number {
  return 0
}

/** 离线上限不受科技影响。 */
export function offlineCapS(_save: Save): number {
  return OFFLINE_CAP_S
}

export function offlineCapHours(save: Save): number {
  return Math.round(offlineCapS(save) / 3600)
}

/** 合并后新人仍回休息。 */
export function fuseStayAssigned(_save: Save): boolean {
  return false
}

/** 站点速度不受科技影响。 */
export function stationTechSpeedMul(_save: Save, _stationId: StationId): number {
  return 1
}

/** 任意站完成一次吞吐后给灵感。 */
export function grantTechPoint(save: Save, _stationId?: StationId): void {
  save.techPoints = normalizeTechPoints(save.techPoints) + CYCLE_TECH_POINTS
}

/** @deprecated 旧名，现对任意站生效。 */
export const grantCraftTechPoint = grantTechPoint

export function researchTech(save: Save, techId: string): ActionResult {
  if (!isTechId(techId)) return { ok: false, reason: '未知科技' }
  const unlocked = hydrateUnlockedTechIds(save.unlockedTechIds)
  save.unlockedTechIds = unlocked
  if (unlocked.includes(techId)) return { ok: false, reason: '已经点亮' }
  const next = nextTech(save)
  if (!next) return { ok: false, reason: '科技树已满' }
  if (next.id !== techId) return { ok: false, reason: '需按序研究' }
  const have = normalizeTechPoints(save.techPoints)
  if (have < next.cost) return { ok: false, reason: '灵感不足' }
  save.techPoints = have - next.cost
  save.unlockedTechIds = [...unlocked, next.id]
  return { ok: true, message: `已点亮「${next.name}」` }
}

export function researchNextTech(save: Save): ActionResult {
  const next = nextTech(save)
  if (!next) return { ok: false, reason: '科技树已满' }
  return researchTech(save, next.id)
}
