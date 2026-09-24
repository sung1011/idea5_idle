import { potionEffectValue } from './alchemy'
import { workshopHpWorkMul } from './workshopHp'
import { addToBank } from './bank'
import { foodBuffEffectValue, foodEffectValue } from './food'
import { convertLegacyToolsToFeedstock } from './runes'
import {
  EFFECT_ID,
  isStationId,
  isStationToolId,
  isToolItemId,
  resolveStationId,
  STATION_IDS,
  STATION_TOOL_BY_ID,
  TOOL_DEF,
  type ToolItemId,
} from './tables'
import type { Affix, EffectId, EffectInstance, ForgedTool, Save, StationId, StationToolId, ToolSlot, Worker } from './types'

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

export function hydrateSelectedToolId(_raw: unknown, _stationId: StationId): StationToolId | null {
  return null
}

function returnToolToBank(save: Save, slot: ToolSlot): void {
  addToBank(save, slot.itemId, 1)
}

/**
 * 旧档工人 toolSlot / toolId：一律回物资，再由 convertLegacyToolsToFeedstock 转荒晶。
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
  const src = rawStations as Partial<Record<string, { toolSlot?: unknown }>>
  for (const stationId of STATION_IDS) {
    const slot = hydrateToolSlot(src[stationId]?.toolSlot)
    if (!slot || !isToolItemId(slot.itemId)) continue
    returnToolToBank(save, slot)
  }
  const forging = (src as { forging?: { toolSlot?: unknown } }).forging
  if (forging) {
    const slot = hydrateToolSlot(forging.toolSlot)
    if (slot && isToolItemId(slot.itemId)) returnToolToBank(save, slot)
  }
}

export function resolvedStationTool(_save: Save, _stationId: StationId): null {
  return null
}

export function sanitizeStationTool(_save: Save, _stationId: StationId): void {}

export function sanitizeAllStationTools(save: Save): void {
  convertLegacyToolsToFeedstock(save)
}

export function stationToolSpeedMul(_save: Save, _stationId: StationId): number {
  return 1
}

/** 食物 / 炼金词条；站工具已撤，不再走 effectId。 */
export function workerEffectValue(save: Save, worker: Worker, stationId: StationId, effectId: EffectId, now = Date.now()): number {
  const fromFood = Math.max(foodEffectValue(worker.foodSlot, effectId, now), foodBuffEffectValue(worker, effectId, now))
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
  return save.workers.reduce(
    (sum, worker) =>
      worker.assignment === stationId
        ? sum + workerToolSpeedMul(save, worker, stationId, now) * workshopHpWorkMul(worker)
        : sum,
    0,
  )
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

/** 旧档锻件先留下，hydrate 末尾再由 convertLegacyToolsToFeedstock 转荒晶。 */
export function hydrateForgedTools(raw: unknown): ForgedTool[] {
  if (!Array.isArray(raw)) return []
  const out: ForgedTool[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const itemId = (row as ForgedTool).itemId
    if (!isToolItemId(itemId) && !isStationToolId(itemId)) continue
    out.push({
      itemId,
      matchStationId: resolveStationId((row as ForgedTool).matchStationId) ?? 'mining',
    })
  }
  return out
}

export function peekForgedTool(_save: Save, _itemId: ToolItemId): ForgedTool | undefined {
  return undefined
}

export function pushForgedTools(_save: Save, _itemId: ToolItemId, _matchStationId: StationId, _qty: number): void {}

export function forgingMatchStation(_save: Save): StationId {
  return 'mining'
}

export function hydrateSelectedForgeToolId(_raw: unknown): StationToolId | null {
  return null
}

export function selectedForgeRecipe(_save: Save): null {
  return null
}

export function unlockedPlusNextPreview<T extends { unlocked: boolean }>(rows: readonly T[]): T[] {
  const open: T[] = []
  let nextLocked: T | null = null
  for (const row of rows) {
    if (row.unlocked) open.push(row)
    else if (!nextLocked) nextLocked = row
  }
  return nextLocked ? [...open, nextLocked] : open
}

export type StationToolPickOption = {
  id: StationToolId | null
  label: string
  unlocked: boolean
  unlockLevel: number
  qty: number
}

export function forgeToolPickOptions(_save: Save): StationToolPickOption[] {
  return []
}

export function sanitizeForgeSelection(_save: Save): void {}

export function selectForgingToolType(_save: Save, _toolTypeId: string) {
  return { ok: false as const, reason: '工具系统已撤' }
}

export function selectForgeOutput(_save: Save, _toolId: string) {
  return { ok: false as const, reason: '工具系统已撤' }
}

export function stationToolPickOptions(_save: Save, _stationId: StationId): StationToolPickOption[] {
  return []
}

export function selectStationTool(_save: Save, _stationId: StationId, _toolId: StationToolId | null) {
  return { ok: false as const, reason: '工具系统已撤' }
}

export function consumeSelectedStationTool(_save: Save, _stationId: StationId): void {}

export function isPlayableStationId(id: unknown): id is StationId {
  return isStationId(id)
}

export { STATION_TOOL_BY_ID }
