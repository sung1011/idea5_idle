import { resizeEncounterBoard } from './encounters'
import { syncKnightLevel } from './knightLevel'
import { OFFLINE_CAP_S, RECRUIT_COST } from './tables'
import type { ActionResult, Save, StationId, TechId } from './types'

/** 任意站完成 1 次周期给 1 点灵感。 */
export const CYCLE_TECH_POINTS = 1
/** @deprecated 旧名，等同 CYCLE_TECH_POINTS */
export const CRAFT_TECH_POINTS = CYCLE_TECH_POINTS

export const ENCOUNTER_SLOT_MIN = 1
export const ENCOUNTER_SLOT_MAX = 6
/** 主线订单格大科技的 effectId。每点亮 1 个 +1 格，与初始 1 格相加，封顶 6。 */
export const ENCOUNTER_SLOT_EFFECT = 'encounterSlot'
export const NOOP_TECH_EFFECT = 'noop'

export type TechKind = 'minor' | 'major'

export type TechNodeDef = {
  id: TechId
  name: string
  desc: string
  cost: number
  /** 多数占位。主线订单格大科技为 encounterSlot；工坊规章 / 工匠密录走 stationConflictMul。 */
  effectId: string
  kind: TechKind
  stage: number
}

export type TechStageDef = {
  stage: number
  name: string
  minors: readonly TechNodeDef[]
  major: TechNodeDef
}

type MinorSeed = {
  id: TechId
  name: string
  desc?: string
  cost: number
}

type MajorSeed = {
  id: TechId
  name: string
  desc: string
  cost: number
  effectId?: string
}

type StageSeed = {
  name: string
  minors: readonly MinorSeed[]
  major: MajorSeed
}

const LATER = '稍后开放。'

/** 未研究时同站两人冲突倍率。 */
export const STATION_CONFLICT_BASE_MUL = 0.5
/** 解锁「工坊规章」后冲突倍率。 */
export const STATION_CONFLICT_RULES_MUL = 0.75
/** 解锁「工匠密录」后消除冲突。 */
export const STATION_CONFLICT_CLEARED_MUL = 1

const SLOT_MAJORS: readonly MajorSeed[] = [
  { id: 'pathOutpost', name: '探路哨岗', desc: '在工坊外立一座哨岗，主线订单格 1→2。', cost: 5, effectId: ENCOUNTER_SLOT_EFFECT },
  { id: 'marketLicense', name: '市集执照', desc: '拿到摆摊文书，主线订单格 2→3。', cost: 8, effectId: ENCOUNTER_SLOT_EFFECT },
  { id: 'scoutRelay', name: '斥候驿站', desc: '路书可传到更远，主线订单格 3→4。', cost: 12, effectId: ENCOUNTER_SLOT_EFFECT },
  { id: 'farWatch', name: '远望烽台', desc: '夜里也能看见客商，主线订单格 4→5。', cost: 16, effectId: ENCOUNTER_SLOT_EFFECT },
  { id: 'caravanPermit', name: '商队路引', desc: '大队可同时进场，主线订单格 5→6。', cost: 20, effectId: ENCOUNTER_SLOT_EFFECT },
]

const EARLY_MINORS: readonly (readonly MinorSeed[])[] = [
  [
    { id: 'workshopLog', name: '工坊日志', desc: '记下每日吞吐与空转。', cost: 1 },
    { id: 'apprenticeNotes', name: '学徒笔记', desc: '学徒手抄的工序要点。', cost: 2 },
    { id: 'artisanManual', name: '匠人手册', desc: '各站配方的对照手册。', cost: 3 },
  ],
  [
    { id: 'workshopRules', name: '工坊规章', desc: '排班规矩减轻同站两人冲突（效率 −25%）。', cost: 4 },
    { id: 'pipelineChart', name: '流水线图', desc: '站与站之间的物流草图。', cost: 4 },
    { id: 'artisanArchive', name: '工匠密录', desc: '密录消除同站两人冲突，满员按人数全速。', cost: 5 },
  ],
  [
    { id: 'knightEdict', name: '骑士训令', desc: '骑士对工坊的号令。', cost: 5 },
    { id: 'crestDraft', name: '纹章底稿', desc: '纹章未上色的底稿。', cost: 6 },
    { id: 'workshopCrest', name: '工坊纹章', desc: '工坊自己的徽记。', cost: 6 },
  ],
  [
    { id: 'knightCrest', name: '骑士工坊纹章', desc: '正式授纹的底稿。', cost: 6 },
    { id: 's04DraftB', name: '路碑拓片', cost: 7 },
    { id: 's04DraftC', name: '夜更口令', cost: 7 },
  ],
  [
    { id: 's05DraftA', name: '货单副本', cost: 8 },
    { id: 's05DraftB', name: '脚力名册', cost: 8 },
    { id: 's05DraftC', name: '关卡印花', cost: 9 },
  ],
]

const LATER_STAGE_NAMES = [
  '工坊',
  '纹章',
  '骑士',
  '边贸',
  '驿站',
  '炉火',
  '典籍',
  '号角',
  '盟约',
  '王庭',
  '传奇',
] as const

function laterStageSeed(index: number, name: string): StageSeed {
  const stage = index + 1
  const marks = ['A', 'B', 'C'] as const
  const labels = ['甲', '乙', '丙'] as const
  return {
    name,
    minors: marks.map((mark, i) => ({
      id: `s${String(stage).padStart(2, '0')}Draft${mark}`,
      name: `${name}草稿${labels[i]}`,
      cost: 8 + stage + i,
    })),
    major: {
      id: `s${String(stage).padStart(2, '0')}Major`,
      name: `${name}要诀`,
      desc: LATER,
      cost: 18 + stage * 2,
    },
  }
}

function buildStage(stage: number, seed: StageSeed): TechStageDef {
  const minors = seed.minors.map((minor) => ({
    id: minor.id,
    name: minor.name,
    desc: minor.desc ?? LATER,
    cost: minor.cost,
    effectId: NOOP_TECH_EFFECT,
    kind: 'minor' as const,
    stage,
  }))
  const major: TechNodeDef = {
    id: seed.major.id,
    name: seed.major.name,
    desc: seed.major.desc,
    cost: seed.major.cost,
    effectId: seed.major.effectId ?? NOOP_TECH_EFFECT,
    kind: 'major',
    stage,
  }
  return { stage, name: seed.name, minors, major }
}

const STAGE_SEEDS: StageSeed[] = [
  { name: '探路', minors: EARLY_MINORS[0], major: SLOT_MAJORS[0] },
  { name: '市集', minors: EARLY_MINORS[1], major: SLOT_MAJORS[1] },
  { name: '哨线', minors: EARLY_MINORS[2], major: SLOT_MAJORS[2] },
  { name: '远望', minors: EARLY_MINORS[3], major: SLOT_MAJORS[3] },
  { name: '商队', minors: EARLY_MINORS[4], major: SLOT_MAJORS[4] },
  ...LATER_STAGE_NAMES.map((name, i) => laterStageSeed(i + 5, name)),
]

/** 阶段科技树。每阶段 3 小点 + 1 大科技，表驱动可往后扩。 */
export const TECH_STAGES: readonly TechStageDef[] = STAGE_SEEDS.map((seed, i) => buildStage(i + 1, seed))

/** 扁平表，兼容旧遍历。顺序：阶段从小到大，先小点后大科技。 */
export const TECH_TREE: readonly TechNodeDef[] = TECH_STAGES.flatMap((stage) => [...stage.minors, stage.major])

export const TECH_IDS = TECH_TREE.map((node) => node.id)

export const ENCOUNTER_SLOT_TECH_IDS: readonly TechId[] = TECH_TREE.filter(
  (node) => node.effectId === ENCOUNTER_SLOT_EFFECT,
).map((node) => node.id)

const TECH_BY_ID = new Map<TechId, TechNodeDef>(TECH_TREE.map((node) => [node.id, node]))
const STAGE_BY_NUMBER = new Map<number, TechStageDef>(TECH_STAGES.map((stage) => [stage.stage, stage]))
const TECH_ID_SET = new Set<TechId>(TECH_IDS)

export function isTechId(value: unknown): value is TechId {
  return typeof value === 'string' && TECH_ID_SET.has(value)
}

export function techNode(id: TechId): TechNodeDef {
  return TECH_BY_ID.get(id) ?? TECH_TREE[0]
}

export function techStage(stage: number): TechStageDef | undefined {
  return STAGE_BY_NUMBER.get(stage)
}

export function normalizeTechPoints(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return Math.floor(value)
}

function unlockedSet(ids: readonly string[]): Set<TechId> {
  return new Set(ids.filter(isTechId))
}

/**
 * 旧线性档：能对上新 id 的小点保留，对不上的丢掉。
 * 大科技必须本阶段小点齐才保留，避免旧档或脏档白送主线订单格。
 * 灵感另走字段，这里不改点数。
 */
export function hydrateUnlockedTechIds(raw: unknown): TechId[] {
  if (!Array.isArray(raw)) return []
  const have = unlockedSet(raw.filter((id): id is string => typeof id === 'string'))
  const kept: TechId[] = []
  const keptSet = new Set<TechId>()
  for (const stage of TECH_STAGES) {
    for (const minor of stage.minors) {
      if (have.has(minor.id)) {
        kept.push(minor.id)
        keptSet.add(minor.id)
      }
    }
    const minorsReady = stage.minors.every((minor) => keptSet.has(minor.id))
    if (minorsReady && have.has(stage.major.id)) {
      kept.push(stage.major.id)
      keptSet.add(stage.major.id)
    }
  }
  return kept
}

export function hydrateTechFields(save: Save & { inspiration?: unknown }): void {
  const hasPoints =
    typeof save.techPoints === 'number' && Number.isFinite(save.techPoints) && save.techPoints > 0
  save.techPoints = normalizeTechPoints(hasPoints ? save.techPoints : save.inspiration)
  save.unlockedTechIds = hydrateUnlockedTechIds(save.unlockedTechIds)
  syncKnightLevel(save)
}

export function hasTech(save: Save, id: TechId): boolean {
  return save.unlockedTechIds.includes(id)
}

export function isStageOpen(save: Save, stage: number): boolean {
  if (stage <= 1) return true
  const prev = techStage(stage - 1)
  return !!prev && hasTech(save, prev.major.id)
}

export function stageMinorsReady(save: Save, stage: number): boolean {
  const def = techStage(stage)
  return !!def && def.minors.every((minor) => hasTech(save, minor.id))
}

export function researchBlockReason(save: Save, techId: string): string | null {
  if (!isTechId(techId)) return '未知科技'
  if (hasTech(save, techId)) return '已经点亮'
  const node = techNode(techId)
  if (!isStageOpen(save, node.stage)) return '需先点亮上一阶段大科技'
  if (node.kind === 'major' && !stageMinorsReady(save, node.stage)) return '需先点亮本阶段小点'
  if (normalizeTechPoints(save.techPoints) < node.cost) return '灵感不足'
  return null
}

export function researchableTechs(save: Save): TechNodeDef[] {
  const out: TechNodeDef[] = []
  for (const stage of TECH_STAGES) {
    if (!isStageOpen(save, stage.stage)) continue
    for (const minor of stage.minors) {
      if (!hasTech(save, minor.id)) out.push(minor)
    }
    if (stageMinorsReady(save, stage.stage) && !hasTech(save, stage.major.id)) {
      out.push(stage.major)
    }
  }
  return out
}

export function nextTech(save: Save): TechNodeDef | null {
  return researchableTechs(save)[0] ?? null
}

export function isTechComplete(save: Save): boolean {
  return TECH_TREE.every((node) => hasTech(save, node.id))
}

export function techTier(save: Save): number {
  return save.unlockedTechIds.filter(isTechId).length
}

/** 当前主线订单格数。初始 1，每点亮一个主线订单格大科技 +1，封顶 6。 */
export function encounterSlotCount(save: Save): number {
  const have = unlockedSet(save.unlockedTechIds ?? [])
  let bonus = 0
  for (const id of ENCOUNTER_SLOT_TECH_IDS) {
    if (have.has(id)) bonus += 1
  }
  return Math.min(ENCOUNTER_SLOT_MAX, ENCOUNTER_SLOT_MIN + bonus)
}

/** 结算占位：科技效果本阶段恒为 0。主线订单格走 encounterSlotCount，不走这里。 */
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

/** 合成后新人留在原站。 */
export function fuseStayAssigned(_save: Save): boolean {
  return true
}

/** 站点速度不受科技影响（冲突倍率走 stationConflictMul）。 */
export function stationTechSpeedMul(_save: Save, _stationId: StationId): number {
  return 1
}

function assignedAt(save: Save, stationId: StationId): number {
  return save.workers.filter((w) => w.assignment === stationId).length
}

/**
 * 同站正好 2 人时的冲突倍率，乘在人数 / 工具等之后。
 * 1 人或 0 人无冲突。不做吵架、掉血、拆队，也不影响战斗。
 */
export function stationConflictMul(save: Save, stationId: StationId): number {
  if (assignedAt(save, stationId) !== 2) return STATION_CONFLICT_CLEARED_MUL
  if (hasTech(save, 'artisanArchive')) return STATION_CONFLICT_CLEARED_MUL
  if (hasTech(save, 'workshopRules')) return STATION_CONFLICT_RULES_MUL
  return STATION_CONFLICT_BASE_MUL
}

/** 站卡满 2 人且仍有冲突时的提示。mul === 1 不显示。 */
export function stationConflictHint(save: Save, stationId: StationId): string | null {
  const mul = stationConflictMul(save, stationId)
  if (mul >= 1) return null
  const cutPct = Math.round((1 - mul) * 100)
  return `冲突：效率 −${cutPct}%`
}

/** 任意站完成一次吞吐后给灵感。 */
export function grantTechPoint(save: Save, _stationId?: StationId): void {
  save.techPoints = normalizeTechPoints(save.techPoints) + CYCLE_TECH_POINTS
}

/** @deprecated 旧名，现对任意站生效。 */
export const grantCraftTechPoint = grantTechPoint

export function researchTech(save: Save, techId: string): ActionResult {
  const blocked = researchBlockReason(save, techId)
  if (blocked) return { ok: false, reason: blocked }
  const node = techNode(techId)
  save.techPoints = normalizeTechPoints(save.techPoints) - node.cost
  save.unlockedTechIds = [...save.unlockedTechIds.filter(isTechId), node.id]
  if (node.effectId === ENCOUNTER_SLOT_EFFECT) {
    resizeEncounterBoard(save)
  }
  return { ok: true, message: `已点亮「${node.name}」` }
}

export function researchNextTech(save: Save): ActionResult {
  const next = nextTech(save)
  if (!next) return { ok: false, reason: '科技树已满' }
  return researchTech(save, next.id)
}
