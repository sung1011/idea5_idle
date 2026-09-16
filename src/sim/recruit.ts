import {
  CLASS_PLACEHOLDERS,
  FOOD_BUFF_DEF,
  isToolItemId,
  ITEM_IDS,
  RECRUIT_COST,
  resolveStationId,
  TOOL_DEF,
  WORKER_NAME_POOL,
} from './tables'
import type {
  ActionResult,
  Affix,
  EffectInstance,
  EffectSource,
  FoodSlot,
  ItemId,
  ProductionBuff,
  Save,
  ToolSlot,
  Worker,
} from './types'

export function findWorker(save: Save, workerId: string): Worker | undefined {
  return save.workers.find((w) => w.id === workerId)
}

function isItemId(id: unknown): id is ItemId {
  return typeof id === 'string' && (ITEM_IDS as string[]).includes(id)
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

function hydrateEffects(raw: unknown, fallbackSource: EffectSource): EffectInstance[] {
  if (!Array.isArray(raw)) return []
  const out: EffectInstance[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const effect = row as Partial<EffectInstance>
    if (typeof effect.effectId !== 'string') continue
    if (typeof effect.value !== 'number' || !Number.isFinite(effect.value)) continue
    const source = effect.source === 'tool' || effect.source === 'food' ? effect.source : fallbackSource
    out.push({ effectId: effect.effectId, value: effect.value, source })
  }
  return out
}

function hydrateProductionBuff(raw: unknown, fallback?: ProductionBuff): ProductionBuff | null {
  if (raw && typeof raw === 'object') {
    const buff = raw as Partial<ProductionBuff>
    if (typeof buff.effectId === 'string' && typeof buff.mul === 'number' && Number.isFinite(buff.mul)) {
      const durationS =
        typeof buff.durationS === 'number' && Number.isFinite(buff.durationS) && buff.durationS > 0
          ? Math.floor(buff.durationS)
          : (fallback?.durationS ?? 180)
      return { effectId: buff.effectId, mul: buff.mul, durationS }
    }
  }
  return fallback ?? null
}

function hydrateToolSlot(rawSlot: unknown, rawWorker: Record<string, unknown>): ToolSlot | null {
  if (rawSlot && typeof rawSlot === 'object') {
    const slot = rawSlot as Partial<ToolSlot>
    if (isToolItemId(slot.itemId) || isItemId(slot.itemId)) {
      const itemId = slot.itemId
      const def = isToolItemId(itemId) ? TOOL_DEF[itemId] : undefined
      const affixes = hydrateAffixes(slot.affixes)
      const effects = hydrateEffects(slot.effects, 'tool')
      return {
        itemId,
        matchStationId: resolveStationId(slot.matchStationId) ?? def?.matchStationId ?? 'mining',
        affixes: affixes.length ? affixes : (def?.affixes ?? []),
        effects: effects.length ? effects : (def?.effects ?? []),
      }
    }
  }
  if (isToolItemId(rawWorker.toolId)) {
    const def = TOOL_DEF[rawWorker.toolId]
    return {
      itemId: def.itemId,
      matchStationId: def.matchStationId,
      affixes: def.affixes,
      effects: def.effects,
    }
  }
  return null
}

function hydrateFoodSlot(rawSlot: unknown, rawWorker: Record<string, unknown>): FoodSlot | null {
  if (rawSlot && typeof rawSlot === 'object') {
    const slot = rawSlot as Partial<FoodSlot>
    if (isItemId(slot.itemId)) {
      const fallback = FOOD_BUFF_DEF[slot.itemId]
      const buff = hydrateProductionBuff(slot.buff, fallback)
      if (buff) {
        const expiresAt =
          typeof slot.expiresAt === 'number' && Number.isFinite(slot.expiresAt) ? slot.expiresAt : 0
        const effects = hydrateEffects(slot.effects, 'food')
        return {
          itemId: slot.itemId,
          buff,
          expiresAt,
          effects: effects.length
            ? effects
            : [{ effectId: buff.effectId, value: buff.mul, source: 'food' }],
        }
      }
    }
  }
  if (isItemId(rawWorker.foodItemId)) {
    const fallback = FOOD_BUFF_DEF[rawWorker.foodItemId]
    const buff = hydrateProductionBuff(rawWorker.prodBuff, fallback)
    if (!buff) return null
    return {
      itemId: rawWorker.foodItemId,
      buff,
      expiresAt: 0,
      effects: [{ effectId: buff.effectId, value: buff.mul, source: 'food' }],
    }
  }
  return null
}

export function hydrateWorker(raw: unknown, index = 0): Worker {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const id = typeof src.id === 'string' && src.id ? src.id : `w-${index + 1}`
  return {
    id,
    name: typeof src.name === 'string' ? src.name : undefined,
    classId:
      src.classId === 'laborer' || src.classId === 'artisan' || src.classId === 'wanderer'
        ? src.classId
        : undefined,
    assignment: resolveStationId(src.assignment),
    toolSlot: hydrateToolSlot(src.toolSlot, src),
    foodSlot: hydrateFoodSlot(src.foodSlot, src),
  }
}

/** 旧档缺双槽补 null；已派伐木 / 未知站撤到休息；`smithing` 映到 forging。 */
export function hydrateWorkers(raw: unknown): Worker[] {
  if (!Array.isArray(raw)) return []
  return raw.map((row, index) => hydrateWorker(row, index))
}

/** 写入一名工人，不扣金币。GM 免费招人复用。 */
export function spawnWorker(save: Save): Worker {
  const idx = save.nextWorkerId - 1
  const worker: Worker = {
    id: `w-${save.nextWorkerId}`,
    name: WORKER_NAME_POOL[idx % WORKER_NAME_POOL.length],
    classId: CLASS_PLACEHOLDERS[idx % CLASS_PLACEHOLDERS.length],
    assignment: null,
    toolSlot: null,
    foodSlot: null,
  }
  save.nextWorkerId += 1
  save.workers.push(worker)
  return worker
}

/** 表驱动抽工人。扣账号金币，写入花名册。 */
export function recruitWorker(save: Save): ActionResult {
  if (save.gold < RECRUIT_COST) return { ok: false, reason: '金币不足' }
  save.gold -= RECRUIT_COST
  spawnWorker(save)
  return { ok: true }
}
