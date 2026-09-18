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
/** 主线订单格科技的 effectId。每级 +1 格，与初始 1 格相加，封顶 6。已实装节点先 `maxLevel=1`。 */
export const ENCOUNTER_SLOT_EFFECT = 'encounterSlot'
export const NOOP_TECH_EFFECT = 'noop'
/** 已实装节点先保持单级，图标仍走 `0/1`→`1/1`。 */
export const IMPLEMENTED_TECH_MAX_LEVEL = 1
/** 占位节点可连点，图标能看出 `1/5`。 */
export const PLACEHOLDER_TECH_MAX_LEVEL = 5

export const TECH_TAB_IDS = ['production', 'combat', 'affairs'] as const
export type TechTabId = (typeof TECH_TAB_IDS)[number]

export const TECH_TAB_LABELS: Record<TechTabId, string> = {
  production: '生产',
  combat: '战斗',
  affairs: '事务',
}

export type TechNodeDef = {
  id: TechId
  name: string
  desc: string
  cost: number
  /** 多数占位。事务订单格为 encounterSlot；工坊规章 / 工匠密录走 stationConflictMul。 */
  effectId: string
  tab: TechTabId
  row: number
  icon: string
  implemented: boolean
  /** 可点次数，≥1。已实装先 1；占位 5。 */
  maxLevel: number
}

export type TechRowDef = {
  tab: TechTabId
  row: number
  cost: number
  options: readonly TechNodeDef[]
}

export type TechTabDef = {
  id: TechTabId
  name: string
  rows: readonly TechRowDef[]
}

type OptionSeed = {
  id: TechId
  name: string
  desc: string
  icon: string
  effectId?: string
  implemented?: boolean
  maxLevel?: number
}

type RowSeed = {
  cost: number
  options: readonly OptionSeed[]
}

/** 未研究时同站两人冲突倍率。 */
export const STATION_CONFLICT_BASE_MUL = 0.5
/** 解锁「工坊规章」后冲突倍率。 */
export const STATION_CONFLICT_RULES_MUL = 0.75
/** 解锁「工匠密录」后消除冲突。 */
export const STATION_CONFLICT_CLEARED_MUL = 1

const PLACEHOLDER = '效果尚未实现。扣灵感点亮后可占位。'

const PRODUCTION_ROWS: readonly RowSeed[] = [
  {
    cost: 2,
    options: [
      { id: 'workshopLog', name: '工坊日志', desc: '记下每日吞吐与空转。', icon: '📋' },
      { id: 'apprenticeNotes', name: '学徒笔记', desc: '学徒手抄的工序要点。', icon: '📝' },
      { id: 'artisanManual', name: '匠人手册', desc: '各站配方的对照手册。', icon: '📘' },
    ],
  },
  {
    cost: 4,
    options: [
      {
        id: 'workshopRules',
        name: '工坊规章',
        desc: '排班规矩减轻同站两人冲突（效率 −25%）。',
        icon: '📜',
        implemented: true,
        maxLevel: IMPLEMENTED_TECH_MAX_LEVEL,
      },
      { id: 'pipelineChart', name: '流水线图', desc: '站与站之间的物流草图。', icon: '📊' },
    ],
  },
  {
    cost: 6,
    options: [
      {
        id: 'artisanArchive',
        name: '工匠密录',
        desc: '密录消除同站两人冲突，满员按人数全速。',
        icon: '📗',
        implemented: true,
        maxLevel: IMPLEMENTED_TECH_MAX_LEVEL,
      },
      { id: 'knightEdict', name: '骑士训令', desc: '骑士对工坊的号令。', icon: '📯' },
    ],
  },
  {
    cost: 8,
    options: [
      { id: 'crestDraft', name: '纹章底稿', desc: '纹章未上色的底稿。', icon: '✏️' },
      { id: 'workshopCrest', name: '工坊纹章', desc: '工坊自己的徽记。', icon: '🛡️' },
      { id: 'knightCrest', name: '骑士工坊纹章', desc: '正式授纹的底稿。', icon: '🏅' },
    ],
  },
  {
    cost: 10,
    options: [
      { id: 's06DraftA', name: '炉火手记', desc: PLACEHOLDER, icon: '🔥' },
      { id: 's07DraftA', name: '典籍目录', desc: PLACEHOLDER, icon: '📚' },
    ],
  },
  {
    cost: 12,
    options: [
      { id: 's08DraftA', name: '号角试音', desc: PLACEHOLDER, icon: '📢' },
      { id: 's09DraftA', name: '盟约草稿', desc: PLACEHOLDER, icon: '🤝' },
      { id: 's10DraftA', name: '王庭备忘', desc: PLACEHOLDER, icon: '👑' },
    ],
  },
]

const COMBAT_ROWS: readonly RowSeed[] = [
  {
    cost: 3,
    options: [
      { id: 'combatPost', name: '训练木桩', desc: PLACEHOLDER, icon: '🪵' },
      { id: 'combatBracer', name: '护腕试作', desc: PLACEHOLDER, icon: '🥊' },
    ],
  },
  {
    cost: 5,
    options: [
      { id: 'combatManual', name: '步战教范', desc: PLACEHOLDER, icon: '📖' },
      { id: 'combatShield', name: '盾墙口令', desc: PLACEHOLDER, icon: '🛡️' },
      { id: 'combatWeak', name: '弱点笔记', desc: PLACEHOLDER, icon: '🎯' },
    ],
  },
  {
    cost: 7,
    options: [
      { id: 'combatMarch', name: '急行号令', desc: PLACEHOLDER, icon: '🏃' },
      { id: 'combatOath', name: '骑士誓词', desc: PLACEHOLDER, icon: '⚔️' },
    ],
  },
  {
    cost: 9,
    options: [
      { id: 'combatBanner', name: '纹章战旗', desc: PLACEHOLDER, icon: '🚩' },
      { id: 'combatEdge', name: '锋刃打磨', desc: PLACEHOLDER, icon: '🗡️' },
      { id: 'combatArmor', name: '甲胄合缝', desc: PLACEHOLDER, icon: '🪖' },
    ],
  },
  {
    cost: 11,
    options: [
      { id: 'combatCourt', name: '王庭校场', desc: PLACEHOLDER, icon: '🏰' },
      { id: 'combatLegend', name: '传奇演武', desc: PLACEHOLDER, icon: '⭐' },
    ],
  },
]

const AFFAIRS_ROWS: readonly RowSeed[] = [
  {
    cost: 5,
    options: [
      {
        id: 'pathOutpost',
        name: '探路哨岗',
        desc: '在工坊外立一座哨岗，主线订单格 1→2。',
        icon: '🏕️',
        effectId: ENCOUNTER_SLOT_EFFECT,
        maxLevel: IMPLEMENTED_TECH_MAX_LEVEL,
      },
      { id: 's04DraftB', name: '路碑拓片', desc: PLACEHOLDER, icon: '🪨' },
    ],
  },
  {
    cost: 8,
    options: [
      {
        id: 'marketLicense',
        name: '市集执照',
        desc: '拿到摆摊文书，主线订单格 2→3。',
        icon: '🪪',
        effectId: ENCOUNTER_SLOT_EFFECT,
        maxLevel: IMPLEMENTED_TECH_MAX_LEVEL,
      },
      { id: 's05DraftA', name: '货单副本', desc: PLACEHOLDER, icon: '📄' },
    ],
  },
  {
    cost: 12,
    options: [
      {
        id: 'scoutRelay',
        name: '斥候驿站',
        desc: '路书可传到更远，主线订单格 3→4。',
        icon: '🏇',
        effectId: ENCOUNTER_SLOT_EFFECT,
        maxLevel: IMPLEMENTED_TECH_MAX_LEVEL,
      },
      { id: 's05DraftB', name: '脚力名册', desc: PLACEHOLDER, icon: '📋' },
    ],
  },
  {
    cost: 16,
    options: [
      {
        id: 'farWatch',
        name: '远望烽台',
        desc: '夜里也能看见客商，主线订单格 4→5。',
        icon: '🗼',
        effectId: ENCOUNTER_SLOT_EFFECT,
        maxLevel: IMPLEMENTED_TECH_MAX_LEVEL,
      },
      { id: 's04DraftC', name: '夜更口令', desc: PLACEHOLDER, icon: '🌙' },
    ],
  },
  {
    cost: 20,
    options: [
      {
        id: 'caravanPermit',
        name: '商队路引',
        desc: '大队可同时进场，主线订单格 5→6。',
        icon: '🐫',
        effectId: ENCOUNTER_SLOT_EFFECT,
        maxLevel: IMPLEMENTED_TECH_MAX_LEVEL,
      },
      { id: 's05DraftC', name: '关卡印花', desc: PLACEHOLDER, icon: '💮' },
    ],
  },
  {
    cost: 24,
    options: [
      { id: 'affairsRoadbook', name: '边贸路书', desc: PLACEHOLDER, icon: '🗺️' },
      { id: 'affairsRoster', name: '驿站号簿', desc: PLACEHOLDER, icon: '📒' },
      { id: 'affairsSeal', name: '商盟印信', desc: PLACEHOLDER, icon: '🔏' },
    ],
  },
]

function isImplemented(seed: OptionSeed): boolean {
  return seed.implemented === true || seed.effectId === ENCOUNTER_SLOT_EFFECT
}

function resolveMaxLevel(seed: OptionSeed): number {
  if (typeof seed.maxLevel === 'number' && Number.isFinite(seed.maxLevel) && seed.maxLevel >= 1) {
    return Math.floor(seed.maxLevel)
  }
  return isImplemented(seed) ? IMPLEMENTED_TECH_MAX_LEVEL : PLACEHOLDER_TECH_MAX_LEVEL
}

function buildRow(tab: TechTabId, row: number, seed: RowSeed): TechRowDef {
  const options = seed.options.map((option) => ({
    id: option.id,
    name: option.name,
    desc: option.desc,
    cost: seed.cost,
    effectId: option.effectId ?? NOOP_TECH_EFFECT,
    tab,
    row,
    icon: option.icon,
    implemented: isImplemented(option),
    maxLevel: resolveMaxLevel(option),
  }))
  return { tab, row, cost: seed.cost, options }
}

function buildTab(id: TechTabId, seeds: readonly RowSeed[]): TechTabDef {
  return {
    id,
    name: TECH_TAB_LABELS[id],
    rows: seeds.map((seed, i) => buildRow(id, i + 1, seed)),
  }
}

/** 三页签科技树。每页独立线性层，第 1 层在屏幕最下。 */
export const TECH_TABS: readonly TechTabDef[] = [
  buildTab('production', PRODUCTION_ROWS),
  buildTab('combat', COMBAT_ROWS),
  buildTab('affairs', AFFAIRS_ROWS),
]

/** 扁平表，兼容旧遍历。顺序：生产 → 战斗 → 事务，层内自下而上。 */
export const TECH_TREE: readonly TechNodeDef[] = TECH_TABS.flatMap((tab) =>
  tab.rows.flatMap((row) => row.options),
)

export const TECH_IDS = TECH_TREE.map((node) => node.id)

export const ENCOUNTER_SLOT_TECH_IDS: readonly TechId[] = TECH_TREE.filter(
  (node) => node.effectId === ENCOUNTER_SLOT_EFFECT,
).map((node) => node.id)

const TECH_BY_ID = new Map<TechId, TechNodeDef>(TECH_TREE.map((node) => [node.id, node]))
const TAB_BY_ID = new Map<TechTabId, TechTabDef>(TECH_TABS.map((tab) => [tab.id, tab]))
const TECH_ID_SET = new Set<TechId>(TECH_IDS)

export function isTechTabId(value: unknown): value is TechTabId {
  return typeof value === 'string' && TECH_TAB_IDS.includes(value as TechTabId)
}

export function isTechId(value: unknown): value is TechId {
  return typeof value === 'string' && TECH_ID_SET.has(value)
}

export function techNode(id: TechId): TechNodeDef {
  return TECH_BY_ID.get(id) ?? TECH_TREE[0]
}

export function techTab(id: TechTabId): TechTabDef {
  return TAB_BY_ID.get(id) ?? TECH_TABS[0]
}

export function techRow(tab: TechTabId, row: number): TechRowDef | undefined {
  return techTab(tab).rows.find((item) => item.row === row)
}

export function techReadyLabel(node: TechNodeDef): string {
  return node.implemented ? '已实装' : '未实装（效果尚未实现）'
}

export function normalizeTechPoints(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return Math.floor(value)
}

export function normalizeTechLevel(value: unknown, maxLevel: number): number {
  const cap = Math.max(1, Math.floor(maxLevel))
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return Math.min(cap, Math.floor(value))
}

function unlockedSet(ids: readonly string[]): Set<TechId> {
  return new Set(ids.filter(isTechId))
}

/**
 * 旧档：能对上新表的 id 原样留下并保留效果，对不上的丢掉。
 * 不要求下层已买，也不扣灵感。
 */
export function hydrateUnlockedTechIds(raw: unknown): TechId[] {
  if (!Array.isArray(raw)) return []
  const have = unlockedSet(raw.filter((id): id is string => typeof id === 'string'))
  return TECH_TREE.filter((node) => have.has(node.id)).map((node) => node.id)
}

export function hydrateTechLevels(raw: unknown, unlockedIds: readonly TechId[] = []): Partial<Record<TechId, number>> {
  const levels: Partial<Record<TechId, number>> = {}
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const node of TECH_TREE) {
      const n = normalizeTechLevel((raw as Record<string, unknown>)[node.id], node.maxLevel)
      if (n > 0) levels[node.id] = n
    }
  }
  for (const id of unlockedIds) {
    if (!isTechId(id)) continue
    const node = techNode(id)
    if ((levels[id] ?? 0) < 1) levels[id] = 1
    if ((levels[id] ?? 0) > node.maxLevel) levels[id] = node.maxLevel
  }
  return levels
}

function syncUnlockedFromLevels(levels: Partial<Record<TechId, number>>): TechId[] {
  return TECH_TREE.filter((node) => (levels[node.id] ?? 0) >= 1).map((node) => node.id)
}

/** 把旧档 / 测试里只写了 `unlockedTechIds` 的点落成 level=1，避免再点时冲掉。 */
function materializeTechLevels(save: Save): Partial<Record<TechId, number>> {
  const levels: Partial<Record<TechId, number>> = { ...save.techLevels }
  for (const id of save.unlockedTechIds ?? []) {
    if (!isTechId(id)) continue
    if ((levels[id] ?? 0) < 1) levels[id] = 1
  }
  return levels
}

export function hydrateTechFields(save: Save & { inspiration?: unknown; techLevels?: unknown }): void {
  const hasPoints =
    typeof save.techPoints === 'number' && Number.isFinite(save.techPoints) && save.techPoints > 0
  save.techPoints = normalizeTechPoints(hasPoints ? save.techPoints : save.inspiration)
  const unlocked = hydrateUnlockedTechIds(save.unlockedTechIds)
  save.techLevels = hydrateTechLevels(save.techLevels, unlocked)
  save.unlockedTechIds = syncUnlockedFromLevels(save.techLevels)
  syncKnightLevel(save)
}

export function techLevel(save: Save, id: TechId): number {
  const node = techNode(id)
  const fromLevels = normalizeTechLevel(save.techLevels?.[id], node.maxLevel)
  if (fromLevels > 0) return fromLevels
  return save.unlockedTechIds.includes(id) ? 1 : 0
}

export function isTechMaxed(save: Save, id: TechId): boolean {
  return techLevel(save, id) >= techNode(id).maxLevel
}

export function techProgressText(save: Save, id: TechId): string {
  return `${techLevel(save, id)}/${techNode(id).maxLevel}`
}

export function techActivateLabel(save: Save, id: TechId): string {
  const node = techNode(id)
  if (isTechMaxed(save, id)) return '已激活'
  if (techLevel(save, id) > 0) return `还可再点 · ${node.cost} 灵感`
  return `激活 · ${node.cost} 灵感`
}

export function hasTech(save: Save, id: TechId): boolean {
  return techLevel(save, id) >= 1
}

export function rowHasPurchase(save: Save, tab: TechTabId, row: number): boolean {
  const def = techRow(tab, row)
  return !!def && def.options.some((option) => hasTech(save, option.id))
}

/** 某层可买：第 1 层，或更低序号层已买过至少 1 个。本层已有旧档点亮时也可补买同行。 */
export function isRowOpen(save: Save, tab: TechTabId, row: number): boolean {
  if (row <= 1) return true
  return rowHasPurchase(save, tab, row - 1) || rowHasPurchase(save, tab, row)
}

export function researchBlockReason(save: Save, techId: string): string | null {
  if (!isTechId(techId)) return '未知科技'
  if (isTechMaxed(save, techId)) return '已经点满'
  const node = techNode(techId)
  if (!isRowOpen(save, node.tab, node.row)) return '未解锁'
  if (normalizeTechPoints(save.techPoints) < node.cost) return '灵感不足'
  return null
}

export function researchableTechs(save: Save): TechNodeDef[] {
  const out: TechNodeDef[] = []
  for (const tab of TECH_TABS) {
    for (const row of tab.rows) {
      if (!isRowOpen(save, tab.id, row.row)) continue
      for (const option of row.options) {
        if (!isTechMaxed(save, option.id)) out.push(option)
      }
    }
  }
  return out
}

export function nextTech(save: Save): TechNodeDef | null {
  return researchableTechs(save)[0] ?? null
}

export function isTechComplete(save: Save): boolean {
  return TECH_TREE.every((node) => isTechMaxed(save, node.id))
}

export function techTier(save: Save): number {
  return TECH_TREE.filter((node) => hasTech(save, node.id)).length
}

/** 当前主线订单格数。初始 1，每级订单格科技 +1，封顶 6。已实装节点 maxLevel=1，与「点亮 1 个 +1 格」相同。 */
export function encounterSlotCount(save: Save): number {
  let bonus = 0
  for (const id of ENCOUNTER_SLOT_TECH_IDS) {
    bonus += techLevel(save, id)
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
  const nextLevel = techLevel(save, node.id) + 1
  save.techLevels = { ...materializeTechLevels(save), [node.id]: nextLevel }
  save.unlockedTechIds = syncUnlockedFromLevels(save.techLevels)
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

/** 已点科技按「等级 × 该层 cost」累计消耗的灵感。 */
export function spentTechPoints(save: Save): number {
  let spent = 0
  for (const node of TECH_TREE) {
    spent += techLevel(save, node.id) * node.cost
  }
  return spent
}

/** GM：清空科技进度并全额返还灵感。不改骑士等级、金币、工人、其它资源。 */
export function resetAllTech(save: Save): ActionResult {
  const refund = spentTechPoints(save)
  save.techPoints = normalizeTechPoints(save.techPoints) + refund
  save.techLevels = {}
  save.unlockedTechIds = []
  resizeEncounterBoard(save)
  return {
    ok: true,
    message: refund > 0 ? `已重置科技，返还灵感 ${refund}` : '已重置科技',
  }
}
