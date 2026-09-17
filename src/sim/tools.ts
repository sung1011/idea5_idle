import { potionEffectValue } from './alchemy'
import { addToBank, bankQty, takeFromBank } from './bank'
import { foodEffectValue } from './food'
import {
  EFFECT_ID,
  isStationId,
  isToolItemId,
  isToolTypeId,
  ITEM_DEF,
  resolveStationId,
  STATION_DEF,
  TOOL_DEF,
  TOOL_TYPE_DEF,
  toolTypeByStation,
  type ToolItemId,
} from './tables'
import type { ActionResult, Affix, EffectId, EffectInstance, ForgedTool, Save, StationId, ToolSlot, ToolTypeId, Worker } from './types'

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

export function stationToolSlot(save: Save, stationId: StationId): ToolSlot | null {
  return save.stations[stationId]?.toolSlot ?? null
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

function hydrateAffixes(raw: unknown): Affix[] {
  if (!Array.isArray(raw)) return []
  const out: Affix[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const affix = row as Partial<Affix>
    if (typeof affix.affixId !== 'string' || typeof affix.effectId !== 'string') continue
    if (typeof affix.value !== 'number' || !Number.isFinite(affix.value)) continue
    out.push({ affixId: affix.affixId, effectId: affix.effectId, value: affix.value })
  }
  return out
}

function hydrateEffects(raw: unknown): EffectInstance[] {
  if (!Array.isArray(raw)) return []
  const out: EffectInstance[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const effect = row as Partial<EffectInstance>
    if (typeof effect.effectId !== 'string') continue
    if (typeof effect.value !== 'number' || !Number.isFinite(effect.value)) continue
    out.push({ effectId: effect.effectId, value: effect.value, source: 'tool' })
  }
  return out
}

/** 站槽 / 旧工人槽 / 旧别名 `toolId`。非法值回 null。 */
export function hydrateToolSlot(rawSlot: unknown, rawLegacy: Record<string, unknown> = {}): ToolSlot | null {
  if (rawSlot && typeof rawSlot === 'object') {
    const slot = rawSlot as Partial<ToolSlot>
    if (isToolItemId(slot.itemId)) {
      const def = TOOL_DEF[slot.itemId]
      const affixes = hydrateAffixes(slot.affixes)
      const effects = hydrateEffects(slot.effects)
      return {
        itemId: slot.itemId,
        matchStationId: resolveStationId(slot.matchStationId) ?? def.matchStationId,
        affixes: affixes.length ? affixes : def.affixes.map((affix) => ({ ...affix })),
        effects: effects.length ? effects : def.effects.map((effect) => ({ ...effect })),
      }
    }
  }
  if (isToolItemId(rawLegacy.toolId)) {
    const def = TOOL_DEF[rawLegacy.toolId]
    return {
      itemId: def.itemId,
      matchStationId: def.matchStationId,
      affixes: def.affixes.map((affix) => ({ ...affix })),
      effects: def.effects.map((effect) => ({ ...effect })),
    }
  }
  return null
}

function returnToolToBank(save: Save, slot: ToolSlot): void {
  addToBank(save, slot.itemId, 1)
  if (isToolItemId(slot.itemId)) pushForgedTools(save, slot.itemId, slot.matchStationId, 1)
}

/**
 * 旧档工人 toolSlot / toolId：优先迁到 match 站（该站还空才装），否则回物资。
 * 站上已有 toolSlot 时不覆盖。
 */
export function migrateWorkerToolsToStations(save: Save, rawWorkers: unknown): void {
  if (!Array.isArray(rawWorkers)) return
  for (const row of rawWorkers) {
    if (!row || typeof row !== 'object') continue
    const src = row as Record<string, unknown>
    const slot = hydrateToolSlot(src.toolSlot, src)
    if (!slot || !isToolItemId(slot.itemId)) continue
    const stationId = slot.matchStationId
    const station = save.stations[stationId]
    if (station && !station.toolSlot) {
      station.toolSlot = slot
    } else {
      returnToolToBank(save, slot)
    }
  }
}

/** 工具词条与食物 Buff 同 effectId 取最强；炼金解析口本阶段为 0。工具读该站槽。 */
export function workerEffectValue(save: Save, worker: Worker, stationId: StationId, effectId: EffectId, now = Date.now()): number {
  const fromTool = toolEffectValue(stationToolSlot(save, stationId), effectId)
  const fromFood = foodEffectValue(worker.foodSlot, effectId, now)
  const fromPotion = potionEffectValue(null, effectId)
  return Math.max(fromTool, fromFood, fromPotion)
}

export function workerToolSpeedMul(save: Save, worker: Worker, stationId: StationId, now = Date.now()): number {
  const speed = workerEffectValue(save, worker, stationId, EFFECT_ID.prodSpeed, now)
  const shorten = workerEffectValue(save, worker, stationId, EFFECT_ID.cycleShorten, now)
  const speedMul = speed > 0 ? speed : 1
  const cut = Math.min(0.8, Math.max(0, shorten))
  return speedMul / (1 - cut)
}

export function assignedToolWeight(save: Save, stationId: StationId, now = Date.now()): number {
  return save.workers.reduce(
    (sum, worker) =>
      worker.assignment === stationId ? sum + workerToolSpeedMul(save, worker, stationId, now) : sum,
    0,
  )
}

export function matchingToolEffectMax(
  save: Save,
  stationId: StationId,
  effectId: EffectId,
  now = Date.now(),
): number {
  let best = toolEffectValue(stationToolSlot(save, stationId), effectId)
  for (const worker of save.workers) {
    if (worker.assignment !== stationId) continue
    const value = workerEffectValue(save, worker, stationId, effectId, now)
    if (value > best) best = value
  }
  return best
}

export function cycleOutputBonus(save: Save, stationId: StationId, now = Date.now()): number {
  return Math.floor(matchingToolEffectMax(save, stationId, EFFECT_ID.extraOutput, now))
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

function takeForgedTool(save: Save, itemId: ToolItemId, preferStationId: StationId): ForgedTool | undefined {
  if (!save.forgedTools) return undefined
  let index = save.forgedTools.findIndex((row) => row.itemId === itemId && row.matchStationId === preferStationId)
  if (index < 0) index = save.forgedTools.findIndex((row) => row.itemId === itemId)
  if (index < 0) return undefined
  return save.forgedTools.splice(index, 1)[0]
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

/** 把生产工具装到工坊。该站已有工具则先卸回物资。 */
export function equipStationTool(save: Save, stationId: StationId, itemId: ToolItemId): ActionResult {
  if (!isToolItemId(itemId)) return { ok: false, reason: '不是生产工具' }
  if (!isStationId(stationId)) return { ok: false, reason: '没有这个工坊' }
  const station = save.stations[stationId]
  if (bankQty(save, itemId) < 1) return { ok: false, reason: `${ITEM_DEF[itemId].label}见底` }
  if (station.toolSlot) {
    returnToolToBank(save, station.toolSlot)
    station.toolSlot = null
  }
  const took = takeFromBank(save, itemId, 1)
  if (!took.ok) return took
  takeForgedTool(save, itemId, stationId)
  station.toolSlot = makeToolSlot(itemId, stationId)
  const type = toolTypeByStation(stationId)
  return { ok: true, message: `${STATION_DEF[stationId].label}装备${ITEM_DEF[itemId].label}（${TOOL_TYPE_DEF[type].label}）` }
}

export function unequipStationTool(save: Save, stationId: StationId): ActionResult {
  if (!isStationId(stationId)) return { ok: false, reason: '没有这个工坊' }
  const station = save.stations[stationId]
  if (!station.toolSlot) return { ok: false, reason: '没有装备工具' }
  const label = ITEM_DEF[station.toolSlot.itemId].label
  returnToolToBank(save, station.toolSlot)
  station.toolSlot = null
  return { ok: true, message: `已从${STATION_DEF[stationId].label}卸下${label}` }
}
