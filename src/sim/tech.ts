import { takeCosts } from './costs'
import {
  OFFLINE_CAP_S,
  RECRUIT_COST,
  RESONANCE_BONUS_EVERY,
  RESONANCE_SPEED_MUL,
  STATION_DEF,
} from './tables'
import type { ActionResult, Save, StationId, TechId } from './types'

/** 制造站（锻造 / 烹饪 / 炼金）每完成 1 次周期给 1 点。采集站不给。 */
export const CRAFT_TECH_POINTS = 1
/** 消耗 1 张图纸兑换的科技点。 */
export const BLUEPRINT_TECH_POINTS = 3

export type TechNodeDef = {
  id: TechId
  name: string
  desc: string
  cost: number
}

/** 线性 10 档。必须先解锁前一档。效果挂进 sim 结算。 */
export const TECH_TREE: readonly TechNodeDef[] = [
  {
    id: 'workshopLedger',
    name: '工坊账本',
    desc: '离线上限 +1 小时（8→9）。',
    cost: 4,
  },
  {
    id: 'recruitDeal',
    name: '招工优惠',
    desc: '抽人费 −2 金。',
    cost: 6,
  },
  {
    id: 'resonanceTune',
    name: '共振调谐',
    desc: '工坊共振速度 1.2 → 1.3。',
    cost: 8,
  },
  {
    id: 'exploreMap',
    name: '探路简图',
    desc: '探索费 −1 金。',
    cost: 10,
  },
  {
    id: 'craftRhythm',
    name: '制造节奏',
    desc: '锻造 / 烹饪 / 炼金速度 +8%。',
    cost: 12,
  },
  {
    id: 'toolReady',
    name: '工具就绪',
    desc: '工坊已装工具时该站再 +6% 速度。',
    cost: 16,
  },
  {
    id: 'mergeInsight',
    name: '合并心得',
    desc: '同站两人合并后，新人留在该站，不必再派。',
    cost: 20,
  },
  {
    id: 'longWatch',
    name: '长时守望',
    desc: '离线上限再 +3 小时（合计 12 小时）。',
    cost: 24,
  },
  {
    id: 'deepResonance',
    name: '深层共振',
    desc: '共振额外产物改为每 3 次吞吐触发（原 4 次）。',
    cost: 30,
  },
  {
    id: 'masterPlan',
    name: '工坊主计',
    desc: '抽人再 −2 金、探索再 −1 金、制造站再 +7% 速度。',
    cost: 40,
  },
]

const TECH_IDS = new Set<TechId>(TECH_TREE.map((node) => node.id))

export function isTechId(value: unknown): value is TechId {
  return typeof value === 'string' && TECH_IDS.has(value as TechId)
}

export function techNode(id: TechId): TechNodeDef {
  return TECH_TREE.find((node) => node.id === id) ?? TECH_TREE[0]
}

export function normalizeTechPoints(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return Math.floor(value)
}

/**
 * 只保留树的连续前缀。跳档、脏 id、缺字段都钉回合法线性进度。
 */
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

export function hydrateTechFields(save: Pick<Save, 'techPoints' | 'unlockedTechIds'>): void {
  save.techPoints = normalizeTechPoints(save.techPoints)
  save.unlockedTechIds = hydrateUnlockedTechIds(save.unlockedTechIds)
}

export function hasTech(save: Save, id: TechId): boolean {
  return save.unlockedTechIds.includes(id)
}

export function nextTech(save: Save): TechNodeDef | null {
  const index = save.unlockedTechIds.length
  return TECH_TREE[index] ?? null
}

export function isTechComplete(save: Save): boolean {
  return save.unlockedTechIds.length >= TECH_TREE.length
}

export function recruitCost(save: Save): number {
  let cost = RECRUIT_COST
  if (hasTech(save, 'recruitDeal')) cost -= 2
  if (hasTech(save, 'masterPlan')) cost -= 2
  return Math.max(1, cost)
}

export function exploreCostReduce(save: Save): number {
  let reduce = 0
  if (hasTech(save, 'exploreMap')) reduce += 1
  if (hasTech(save, 'masterPlan')) reduce += 1
  return reduce
}

export function offlineCapS(save: Save): number {
  let cap = OFFLINE_CAP_S
  if (hasTech(save, 'workshopLedger')) cap += 60 * 60
  if (hasTech(save, 'longWatch')) cap += 3 * 60 * 60
  return cap
}

export function offlineCapHours(save: Save): number {
  return Math.round(offlineCapS(save) / 3600)
}

export function resonanceSpeedMul(save: Save): number {
  return hasTech(save, 'resonanceTune') ? 1.3 : RESONANCE_SPEED_MUL
}

export function resonanceBonusEvery(save: Save): number {
  return hasTech(save, 'deepResonance') ? 3 : RESONANCE_BONUS_EVERY
}

export function fuseStayAssigned(save: Save): boolean {
  return hasTech(save, 'mergeInsight')
}

export function stationTechSpeedMul(save: Save, stationId: StationId): number {
  let mul = 1
  if (STATION_DEF[stationId].kind === 'craft') {
    if (hasTech(save, 'craftRhythm')) mul *= 1.08
    if (hasTech(save, 'masterPlan')) mul *= 1.07
  }
  if (hasTech(save, 'toolReady') && save.stations[stationId].toolSlot) {
    mul *= 1.06
  }
  return mul
}

/** 制造站完成一次吞吐后给点。采集站不给。 */
export function grantCraftTechPoint(save: Save, stationId: StationId): void {
  if (STATION_DEF[stationId].kind !== 'craft') return
  save.techPoints = normalizeTechPoints(save.techPoints) + CRAFT_TECH_POINTS
}

export function exchangeBlueprint(save: Save, qty = 1): ActionResult {
  const n = Math.max(1, Math.floor(qty))
  const took = takeCosts(save, [{ itemId: 'blueprint', qty: n }])
  if (!took.ok) return { ok: false, reason: took.reason ?? '图纸见底' }
  const gained = n * BLUEPRINT_TECH_POINTS
  save.techPoints = normalizeTechPoints(save.techPoints) + gained
  return { ok: true, message: `兑换科技点 +${gained}` }
}

export function researchNextTech(save: Save): ActionResult {
  const next = nextTech(save)
  if (!next) return { ok: false, reason: '科技已全部解锁' }
  if (save.techPoints < next.cost) {
    return { ok: false, reason: `科技点不足：还差 ${next.cost - save.techPoints}` }
  }
  save.techPoints -= next.cost
  save.unlockedTechIds = [...save.unlockedTechIds, next.id]
  return { ok: true, message: `研究完成：${next.name}` }
}
