import { potionEffectValue } from './alchemy'
import { addToBank, bankQty, takeFromBank } from './bank'
import { foodEffectValue } from './food'
import {
  EFFECT_ID,
  isStationId,
  isStationToolId,
  forgeToolRecipeOf,
  isStationToolUnlocked,
  isToolItemId,
  isToolTypeId,
  ITEM_DEF,
  resolveStationId,
  STATION_DEF,
  STATION_IDS,
  STATION_TOOL_BY_ID,
  stationToolItemId,
  stationToolsOf,
  stationToolSpeedMulOf,
  stationToolUnlockCount,
  stationToolUnlockLevel,
  TOOL_DEF,
  TOOL_TYPE_DEF,
  toolTypeByStation,
  type ForgeToolRecipe,
  type StationToolDef,
  type ToolItemId,
} from './tables'
import type {
  ActionResult,
  Affix,
  EffectId,
  EffectInstance,
  ForgedTool,
  Save,
  StationId,
  StationToolId,
  ToolSlot,
  ToolTypeId,
  Worker,
} from './types'

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

export function hydrateSelectedToolId(raw: unknown, stationId: StationId): StationToolId | null {
  if (!isStationToolId(raw)) return null
  const def = STATION_TOOL_BY_ID[raw]
  if (def.stationId !== stationId) return null
  return raw
}

function returnToolToBank(save: Save, slot: ToolSlot): void {
  addToBank(save, slot.itemId, 1)
  if (isToolItemId(slot.itemId)) pushForgedTools(save, slot.itemId, slot.matchStationId, 1)
}

/**
 * 旧档工人 toolSlot / toolId：一律回物资，不再装到站上。
 */
export function migrateWorkerToolsToStations(save: Save, rawWorkers: unknown): void {
  if (!Array.isArray(rawWorkers)) return
  for (const row of rawWorkers) {
    if (!row || typeof row !== 'object') continue
    const src = row as Record<string, unknown>
    const slot = hydrateToolSlot(src.toolSlot, src)
    if (!slot || !isToolItemId(slot.itemId)) continue
    returnToolToBank(save, slot)
  }
}

/** 旧档站 `toolSlot` 卸回物资；新玩法不再装备槽。 */
export function returnLegacyStationToolSlots(save: Save, rawStations: unknown): void {
  if (!rawStations || typeof rawStations !== 'object') return
  const src = rawStations as Partial<Record<StationId, { toolSlot?: unknown }>>
  for (const stationId of STATION_IDS) {
    const slot = hydrateToolSlot(src[stationId]?.toolSlot)
    if (!slot || !isToolItemId(slot.itemId)) continue
    returnToolToBank(save, slot)
  }
}

export function resolvedStationTool(save: Save, stationId: StationId): StationToolDef | null {
  if (!isStationId(stationId)) return null
  const station = save.stations[stationId]
  const selected = station?.selectedToolId
  if (!selected || !isStationToolId(selected)) return null
  const def = STATION_TOOL_BY_ID[selected]
  if (!def || def.stationId !== stationId) return null
  if (!isStationToolUnlocked(station.stationLevel, def.index)) return null
  if (bankQty(save, def.id) < 1) return null
  return def
}

export function sanitizeStationTool(save: Save, stationId: StationId): void {
  const station = save.stations[stationId]
  if (!station) return
  if (!station.selectedToolId) return
  if (resolvedStationTool(save, stationId)) return
  station.selectedToolId = null
}

export function sanitizeAllStationTools(save: Save): void {
  for (const stationId of STATION_IDS) sanitizeStationTool(save, stationId)
  sanitizeForgeSelection(save)
}

export function stationToolSpeedMul(save: Save, stationId: StationId): number {
  const def = resolvedStationTool(save, stationId)
  return def ? stationToolSpeedMulOf(def.index) : 1
}

/** 食物 / 炼金词条；站工具改为独立效率乘区，不再走 effectId。 */
export function workerEffectValue(save: Save, worker: Worker, stationId: StationId, effectId: EffectId, now = Date.now()): number {
  const fromFood = foodEffectValue(worker.foodSlot, effectId, now)
  const fromPotion = potionEffectValue(null, effectId)
  return Math.max(fromFood, fromPotion)
}

export function workerToolSpeedMul(save: Save, worker: Worker, stationId: StationId, now = Date.now()): number {
  const speed = workerEffectValue(save, worker, stationId, EFFECT_ID.prodSpeed, now)
  const shorten = workerEffectValue(save, worker, stationId, EFFECT_ID.cycleShorten, now)
  const speedMul = speed > 0 ? speed : 1
  const cut = Math.min(0.8, Math.max(0, shorten))
  return speedMul / (1 - cut)
}

export function assignedToolWeight(save: Save, stationId: StationId, now = Date.now()): number {
  const crew = save.workers.reduce(
    (sum, worker) =>
      worker.assignment === stationId ? sum + workerToolSpeedMul(save, worker, stationId, now) : sum,
    0,
  )
  return crew * stationToolSpeedMul(save, stationId)
}

export function matchingToolEffectMax(
  save: Save,
  stationId: StationId,
  effectId: EffectId,
  now = Date.now(),
): number {
  let best = 0
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

export function forgingMatchStation(save: Save): StationId {
  const selected = save.stations.forging.selectedToolType
  if (isToolTypeId(selected)) return TOOL_TYPE_DEF[selected].matchStationId
  return TOOL_TYPE_DEF.pick.matchStationId
}

export function hydrateSelectedForgeToolId(raw: unknown): StationToolId | null {
  return isStationToolId(raw) ? raw : null
}

export function selectedForgeRecipe(save: Save): ForgeToolRecipe | null {
  const selected = save.stations.forging.selectedForgeToolId
  if (!selected || !isStationToolId(selected)) return null
  const def = STATION_TOOL_BY_ID[selected]
  if (!def) return null
  if (!isStationToolUnlocked(save.stations[def.stationId].stationLevel, def.index)) return null
  return forgeToolRecipeOf(selected)
}

export function forgeToolPickOptions(save: Save): StationToolPickOption[] {
  const match = forgingMatchStation(save)
  const level = save.stations[match]?.stationLevel ?? 1
  const unlocked = stationToolUnlockCount(level)
  const rows: StationToolPickOption[] = []
  let nextLocked: StationToolPickOption | null = null
  for (const def of stationToolsOf(match)) {
    const open = isStationToolUnlocked(level, def.index)
    const row: StationToolPickOption = {
      id: def.id,
      label: def.label,
      unlocked: open,
      unlockLevel: stationToolUnlockLevel(def.index),
      qty: bankQty(save, def.id),
    }
    if (open) rows.push(row)
    else if (!nextLocked) nextLocked = row
  }
  return nextLocked ? [...rows, nextLocked] : rows
}

export function sanitizeForgeSelection(save: Save): void {
  const station = save.stations.forging
  const match = forgingMatchStation(save)
  const unlocked = stationToolUnlockCount(save.stations[match].stationLevel)
  const current = station.selectedForgeToolId
  if (current && isStationToolId(current)) {
    const def = STATION_TOOL_BY_ID[current]
    if (def && def.stationId === match && def.index <= unlocked) return
  }
  station.selectedForgeToolId = unlocked >= 1 ? stationToolItemId(match, 1) : null
}

export function selectForgingToolType(save: Save, toolTypeId: ToolTypeId): ActionResult {
  if (!isToolTypeId(toolTypeId)) return { ok: false, reason: '没有这种工具' }
  const station = save.stations.forging
  if (station.selectedToolType === toolTypeId) {
    sanitizeForgeSelection(save)
    return { ok: true }
  }
  station.selectedToolType = toolTypeId
  station.selectedForgeToolId = null
  sanitizeForgeSelection(save)
  return { ok: true, message: `锻造改为${TOOL_TYPE_DEF[toolTypeId].label}` }
}

/** 锻造下拉选要造的专属工具。未解锁不能造。 */
export function selectForgeOutput(save: Save, toolId: StationToolId): ActionResult {
  if (!isStationToolId(toolId)) return { ok: false, reason: '没有这种工具' }
  const def = STATION_TOOL_BY_ID[toolId]
  const type = toolTypeByStation(def.stationId)
  if (save.stations.forging.selectedToolType !== type) {
    save.stations.forging.selectedToolType = type
  }
  if (!isStationToolUnlocked(save.stations[def.stationId].stationLevel, def.index)) {
    return { ok: false, reason: `未解锁（需 ${STATION_DEF[def.stationId].label} Lv${stationToolUnlockLevel(def.index)}）` }
  }
  const station = save.stations.forging
  if (station.selectedForgeToolId === def.id) return { ok: true }
  station.selectedForgeToolId = def.id
  return { ok: true, message: `锻造改为${def.label}` }
}

export type StationToolPickOption = {
  id: StationToolId | null
  label: string
  unlocked: boolean
  unlockLevel: number
  qty: number
}

export function stationToolPickOptions(save: Save, stationId: StationId): StationToolPickOption[] {
  const level = save.stations[stationId]?.stationLevel ?? 1
  const rows: StationToolPickOption[] = [
    { id: null, label: '无', unlocked: true, unlockLevel: 1, qty: 0 },
  ]
  for (const def of stationToolsOf(stationId)) {
    const unlocked = isStationToolUnlocked(level, def.index)
    rows.push({
      id: def.id,
      label: def.label,
      unlocked,
      unlockLevel: stationToolUnlockLevel(def.index),
      qty: bankQty(save, def.id),
    })
  }
  return rows
}

/** 工坊下拉选工具。首项「无」；未解锁即使有库存也不可选。 */
export function selectStationTool(
  save: Save,
  stationId: StationId,
  toolId: StationToolId | null,
): ActionResult {
  if (!isStationId(stationId)) return { ok: false, reason: '没有这个工坊' }
  const station = save.stations[stationId]
  if (!toolId) {
    if (!station.selectedToolId) return { ok: true }
    station.selectedToolId = null
    return { ok: true, message: `${STATION_DEF[stationId].label}改为无` }
  }
  if (!isStationToolId(toolId)) return { ok: false, reason: '没有这种工具' }
  const def = STATION_TOOL_BY_ID[toolId]
  if (def.stationId !== stationId) return { ok: false, reason: '不是本站工具' }
  if (!isStationToolUnlocked(station.stationLevel, def.index)) {
    return { ok: false, reason: `未解锁（需 Lv${stationToolUnlockLevel(def.index)}）` }
  }
  if (bankQty(save, def.id) < 1) return { ok: false, reason: `${def.label}见底` }
  if (station.selectedToolId === def.id) return { ok: true }
  station.selectedToolId = def.id
  const type = toolTypeByStation(stationId)
  return { ok: true, message: `${STATION_DEF[stationId].label}选用${def.label}（${TOOL_TYPE_DEF[type].label}）` }
}

/** 成功吞吐耗 1；无则不耗；耗尽回无。 */
export function consumeSelectedStationTool(save: Save, stationId: StationId): void {
  const def = resolvedStationTool(save, stationId)
  if (!def) {
    sanitizeStationTool(save, stationId)
    return
  }
  takeFromBank(save, def.id, 1)
  if (bankQty(save, def.id) < 1) save.stations[stationId].selectedToolId = null
}
