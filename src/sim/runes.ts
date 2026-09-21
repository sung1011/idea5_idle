import { addToBank, bankQty, takeFromBank } from './bank'
import { roll01 } from './rng'
import { isStationUnlocked, stationUnlockKnightLevel } from './stationUnlock'
import {
  inscriptionRecipes,
  isRuneItemId,
  isStationToolId,
  isToolItemId,
  ITEM_DEF,
  RUNE_BLOOD_XP,
  RUNE_BREAK_SHIELD_BONUS,
  RUNE_DEAL_MUL,
  RUNE_DEF,
  RUNE_ITEM_IDS,
  RUNE_SWIFT_SPD_MUL,
  RUNE_TAKEN_MUL,
  type RuneDef,
} from './tables'
import type { ActionResult, CombatFighter, ItemId, RuneItemId, Save } from './types'

export type RunePickMap = Partial<Record<string, RuneItemId | null>>

export type RunePickOption = {
  id: RuneItemId
  label: string
  effect: string
  qty: number
}

export function runeLabel(id: RuneItemId): string {
  return RUNE_DEF[id].label
}

export function runeEffectText(id: RuneItemId): string {
  return RUNE_DEF[id].effect
}

export function listRunePickOptions(save: Save): RunePickOption[] {
  return RUNE_ITEM_IDS.map((id) => ({
    id,
    label: RUNE_DEF[id].label,
    effect: RUNE_DEF[id].effect,
    qty: bankQty(save, id),
  }))
}

export function reservedRuneQty(picks: RunePickMap, itemId: RuneItemId, exceptWorkerId?: string): number {
  let n = 0
  for (const [workerId, runeId] of Object.entries(picks)) {
    if (exceptWorkerId && workerId === exceptWorkerId) continue
    if (runeId === itemId) n += 1
  }
  return n
}

export function availableRuneQty(save: Save, picks: RunePickMap, itemId: RuneItemId, exceptWorkerId?: string): number {
  return Math.max(0, bankQty(save, itemId) - reservedRuneQty(picks, itemId, exceptWorkerId))
}

export function normalizeRunePicks(picks: RunePickMap | undefined): Partial<Record<string, RuneItemId>> {
  const out: Partial<Record<string, RuneItemId>> = {}
  if (!picks) return out
  for (const [workerId, runeId] of Object.entries(picks)) {
    if (!workerId || !isRuneItemId(runeId)) continue
    out[workerId] = runeId
  }
  return out
}

/** 选人列表符文槽：跟铭刻站同一套骑士门槛。 */
export function isRuneSlotUnlocked(save: Pick<Save, 'knightLevel'>): boolean {
  return isStationUnlocked(save, 'inscription')
}

export function runeSlotLockedTip(): string {
  return `铭刻需骑士等级 ${stationUnlockKnightLevel('inscription')} 解锁`
}

export type RuneSlotTapKind = 'open' | 'locked' | 'ignore'

export function runeSlotTapKind(save: Pick<Save, 'knightLevel'>, canFight: boolean): RuneSlotTapKind {
  if (!isRuneSlotUnlocked(save)) return 'locked'
  if (!canFight) return 'ignore'
  return 'open'
}

/** 开战确认：铭刻未开则丢弃已选，避免未解锁仍消耗。 */
export function confirmableRunePicks(
  save: Pick<Save, 'knightLevel'>,
  picks: RunePickMap | undefined,
  workerIds: readonly string[],
): Partial<Record<string, RuneItemId>> {
  if (!isRuneSlotUnlocked(save)) return {}
  const normalized = normalizeRunePicks(picks)
  const out: Partial<Record<string, RuneItemId>> = {}
  for (const id of workerIds) {
    const runeId = normalized[id]
    if (runeId) out[id] = runeId
  }
  return out
}

export function runePickBlockReason(save: Save, picks: RunePickMap | undefined): string | null {
  const used: Partial<Record<RuneItemId, number>> = {}
  for (const runeId of Object.values(normalizeRunePicks(picks))) {
    if (!runeId) continue
    used[runeId] = (used[runeId] ?? 0) + 1
    if ((used[runeId] ?? 0) > bankQty(save, runeId)) return `${ITEM_DEF[runeId].label}见底`
  }
  return null
}

/** 开战 / 增援：扣掉选中的符文。缺货失败不扣。 */
export function consumeRunePicks(save: Save, picks: RunePickMap | undefined): ActionResult {
  const blocked = runePickBlockReason(save, picks)
  if (blocked) return { ok: false, reason: blocked }
  for (const runeId of Object.values(normalizeRunePicks(picks))) {
    if (!runeId) continue
    const took = takeFromBank(save, runeId, 1)
    if (!took.ok) return took
  }
  return { ok: true }
}

export function fighterRuneId(fighter: Pick<CombatFighter, 'runeId'> | undefined): RuneItemId | null {
  return isRuneItemId(fighter?.runeId) ? fighter.runeId : null
}

export function runeDealMul(runeId: RuneItemId | null | undefined): number {
  return runeId === 'runeSharp' ? RUNE_DEAL_MUL : 1
}

export function runeTakenMul(runeId: RuneItemId | null | undefined): number {
  return runeId === 'runeArmor' ? RUNE_TAKEN_MUL : 1
}

export function runeSpdMul(runeId: RuneItemId | null | undefined): number {
  return runeId === 'runeSwift' ? RUNE_SWIFT_SPD_MUL : 1
}

export function runeBreakBonus(runeId: RuneItemId | null | undefined): number {
  return runeId === 'runeBreak' ? RUNE_BREAK_SHIELD_BONUS : 0
}

export function runeBloodXp(runeId: RuneItemId | null | undefined): number {
  return runeId === 'runeBlood' ? RUNE_BLOOD_XP : 0
}

export function hasInsightRune(fighters: readonly Pick<CombatFighter, 'runeId'>[]): boolean {
  return fighters.some((row) => row.runeId === 'runeInsight')
}

export function rollInscriptionRecipe(save: Save, recipes: readonly RuneDef[]): RuneDef | null {
  if (!recipes.length) return null
  const roll = roll01(save)
  const i = Math.min(recipes.length - 1, Math.max(0, Math.floor(roll * recipes.length)))
  return recipes[i]
}

export function rollRuneBatchQty(save: Save, recipe: RuneDef): number {
  const { min, max } = recipe.batch
  if (max <= min) return min
  return min + Math.floor(roll01(save) * (max - min + 1))
}

export function inscriptionRecipePool(save: Save): RuneDef[] {
  return inscriptionRecipes(save.stations.inscription?.stationLevel ?? 1)
}

const LEGACY_TOOL_CRYSTAL: Partial<Record<ItemId, number>> = {
  tool: 2,
  ironTool: 3,
  mithrilTool: 4,
}

function toolCrystalValue(itemId: ItemId): number {
  if (isStationToolId(itemId)) return 2
  return LEGACY_TOOL_CRYSTAL[itemId] ?? 0
}

function isLegacyToolItem(id: unknown): id is ItemId {
  return isToolItemId(id) || isStationToolId(id)
}

/**
 * 旧档站工具 / 通用工具进荒晶；每满 4 件再给 1 枚锋锐。
 * 清空 selectedToolId 与 forgedTools。
 */
export function convertLegacyToolsToFeedstock(save: Save): number {
  let tools = 0
  const bank = save.bank as Record<string, number | undefined>
  for (const [itemId, qty] of Object.entries(bank)) {
    if (!isLegacyToolItem(itemId) || typeof qty !== 'number' || qty <= 0) continue
    const n = Math.floor(qty)
    tools += n
    addToBank(save, 'wildCrystal', n * toolCrystalValue(itemId))
    delete bank[itemId]
  }
  if (Array.isArray(save.forgedTools) && save.forgedTools.length) {
    for (const row of save.forgedTools) {
      if (!isLegacyToolItem(row.itemId)) continue
      tools += 1
      addToBank(save, 'wildCrystal', toolCrystalValue(row.itemId))
    }
  }
  save.forgedTools = []
  if (save.stations) {
    for (const station of Object.values(save.stations)) {
      const raw = station as { selectedToolId?: unknown; selectedForgeToolId?: unknown; selectedToolType?: unknown }
      raw.selectedToolId = null
      raw.selectedForgeToolId = null
      raw.selectedToolType = null
    }
  }
  if (tools > 0) {
    const starter = Math.max(1, Math.floor(tools / 4))
    addToBank(save, 'runeSharp', starter)
    addToBank(save, 'runeArmor', Math.max(1, Math.floor(starter / 2)))
  }
  return tools
}
