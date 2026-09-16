import { addToBank, bankQty, takeFromBank } from './bank'
import { findWorker } from './recruit'
import {
  EFFECT_ID,
  isToolItemId,
  isToolTypeId,
  ITEM_DEF,
  STATION_DEF,
  TOOL_DEF,
  TOOL_TYPE_DEF,
  toolTypeByStation,
  type ToolItemId,
} from './tables'
import type { ActionResult, EffectId, ForgedTool, Save, StationId, ToolSlot, ToolTypeId, Worker } from './types'

export function toolEffectValue(slot: ToolSlot | null | undefined, effectId: EffectId): number {
  if (!slot) return 0
  let best = 0
  for (const effect of slot.effects) {
    if (effect.effectId === effectId && effect.value > best) best = effect.value
  }
  for (const affix of slot.affixes) {
    if (affix.effectId === effectId && affix.value > best) best = affix.value
  }
  return best
}

export function isToolMatched(slot: ToolSlot | null | undefined, stationId: StationId): boolean {
  return !!slot && slot.matchStationId === stationId
}

export function makeToolSlot(itemId: ToolItemId, matchStationId: StationId): ToolSlot {
  const def = TOOL_DEF[itemId]
  return {
    itemId,
    matchStationId,
    affixes: def.affixes.map((affix) => ({ ...affix })),
    effects: def.effects.map((effect) => ({ ...effect })),
  }
}

/** 匹配才吃常驻增效；空槽或不匹配 = 1（裸效率）。 */
export function workerToolSpeedMul(worker: Worker, stationId: StationId): number {
  if (!isToolMatched(worker.toolSlot, stationId)) return 1
  const speed = toolEffectValue(worker.toolSlot, EFFECT_ID.prodSpeed)
  const shorten = toolEffectValue(worker.toolSlot, EFFECT_ID.cycleShorten)
  const speedMul = speed > 0 ? speed : 1
  const cut = Math.min(0.8, Math.max(0, shorten))
  return speedMul / (1 - cut)
}

export function assignedToolWeight(save: Save, stationId: StationId): number {
  return save.workers.reduce(
    (sum, worker) => (worker.assignment === stationId ? sum + workerToolSpeedMul(worker, stationId) : sum),
    0,
  )
}

export function matchingToolEffectMax(save: Save, stationId: StationId, effectId: EffectId): number {
  let best = 0
  for (const worker of save.workers) {
    if (worker.assignment !== stationId || !isToolMatched(worker.toolSlot, stationId)) continue
    const value = toolEffectValue(worker.toolSlot, effectId)
    if (value > best) best = value
  }
  return best
}

export function cycleOutputBonus(save: Save, stationId: StationId, resonanceExtra: boolean): number {
  return (resonanceExtra ? 1 : 0) + Math.floor(matchingToolEffectMax(save, stationId, EFFECT_ID.extraOutput))
}

export function hydrateForgedTools(raw: unknown): ForgedTool[] {
  if (!Array.isArray(raw)) return []
  const out: ForgedTool[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const item = row as Partial<ForgedTool>
    if (!isToolItemId(item.itemId)) continue
    const match = toolTypeByStationFallback(item.matchStationId)
    if (!match) continue
    out.push({ itemId: item.itemId, matchStationId: match })
  }
  return out
}

function toolTypeByStationFallback(id: unknown): StationId | null {
  if (typeof id !== 'string') return null
  if (Object.prototype.hasOwnProperty.call(STATION_DEF, id)) return id as StationId
  if (isToolTypeId(id)) return TOOL_TYPE_DEF[id].matchStationId
  return null
}

export function peekForgedTool(save: Save, itemId: ToolItemId): ForgedTool | undefined {
  return save.forgedTools.find((row) => row.itemId === itemId)
}

export function pushForgedTools(save: Save, itemId: ToolItemId, matchStationId: StationId, qty: number): void {
  if (!save.forgedTools) save.forgedTools = []
  const copies = Math.max(0, Math.floor(qty))
  for (let i = 0; i < copies; i++) save.forgedTools.push({ itemId, matchStationId })
}


export function forgingMatchStation(save: Save): StationId {
  const selected = save.stations.forging.selectedToolType
  if (isToolTypeId(selected)) return TOOL_TYPE_DEF[selected].matchStationId
  return TOOL_TYPE_DEF.pick.matchStationId
}

export function selectForgingToolType(save: Save, toolTypeId: ToolTypeId): ActionResult {
  if (!isToolTypeId(toolTypeId)) return { ok: false, reason: '没有这种工具' }
  const station = save.stations.forging
  if (station.selectedToolType === toolTypeId) return { ok: true }
  station.selectedToolType = toolTypeId
  return { ok: true, message: `锻造改为${TOOL_TYPE_DEF[toolTypeId].label}` }
}

export function equipTool(
  save: Save,
  workerId: string,
  itemId: ToolItemId,
  matchStationId: StationId,
): ActionResult {
  if (!isToolItemId(itemId)) return { ok: false, reason: '不是生产工具' }
  if (!Object.prototype.hasOwnProperty.call(STATION_DEF, matchStationId)) {
    return { ok: false, reason: '没有这个工坊' }
  }
  const worker = findWorker(save, workerId)
  if (!worker) return { ok: false, reason: '没有这个工人' }
  if (bankQty(save, itemId) < 1) return { ok: false, reason: `${ITEM_DEF[itemId].label}见底` }
  if (worker.toolSlot) {
    addToBank(save, worker.toolSlot.itemId, 1)
    if (isToolItemId(worker.toolSlot.itemId)) {
      pushForgedTools(save, worker.toolSlot.itemId, worker.toolSlot.matchStationId, 1)
    }
  }
  const took = takeFromBank(save, itemId, 1)
  if (!took.ok) return took
  worker.toolSlot = makeToolSlot(itemId, matchStationId)
  const type = toolTypeByStation(matchStationId)
  return { ok: true, message: `装备${ITEM_DEF[itemId].label}（${TOOL_TYPE_DEF[type].label}）` }
}

export function unequipTool(save: Save, workerId: string): ActionResult {
  const worker = findWorker(save, workerId)
  if (!worker) return { ok: false, reason: '没有这个工人' }
  if (!worker.toolSlot) return { ok: false, reason: '没有装备工具' }
  const slot = worker.toolSlot
  addToBank(save, slot.itemId, 1)
  if (isToolItemId(slot.itemId)) pushForgedTools(save, slot.itemId, slot.matchStationId, 1)
  worker.toolSlot = null
  return { ok: true, message: '已卸下工具' }
}
