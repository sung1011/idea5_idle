import { fillWorkerHp } from './combat'
import { isAssistWorker } from './combatAssist'
import { hydrateWorkerCombatAttrs, spawnFillCombatAttrs, uniqueCombatAttrs } from './combatAttrs'
import { normalizeWorkerProgress, WORKER_LEVEL_MIN } from './workerLevel'
import {
  CLASS_PLACEHOLDERS,
  FOOD_BUFF_DEF,
  foodBuffDef,
  hydrateQualityTier,
  isClassId,
  isFoodItemId,
  ITEM_IDS,
  migrateQualityTierFromGrayTable,
  needsGrayQualityMigration,
  QUALITY_MIN,
  resolveStationId,
  WORKER_NAME_POOL,
} from './tables'
import { recruitCost } from './tech'
import type {
  ActionResult,
  EffectInstance,
  EffectSource,
  FoodSlot,
  ItemId,
  ProductionBuff,
  ClassId,
  CombatAttrId,
  QualityTier,
  Save,
  Worker,
} from './types'

export function findWorker(save: Save, workerId: string): Worker | undefined {
  return save.workers.find((w) => w.id === workerId)
}

function isItemId(id: unknown): id is ItemId {
  return typeof id === 'string' && (ITEM_IDS as string[]).includes(id)
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

function hydrateQty(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return 0
  return Math.floor(raw)
}

function hydrateFatigueDebt(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return 0
  return raw
}

function hydrateFoodSlot(rawSlot: unknown, rawWorker: Record<string, unknown>): FoodSlot | null {
  if (rawSlot && typeof rawSlot === 'object') {
    const slot = rawSlot as Partial<FoodSlot> & { foodCount?: unknown }
    if (isItemId(slot.itemId)) {
      const fallback = isFoodItemId(slot.itemId) ? foodBuffDef(slot.itemId) : FOOD_BUFF_DEF.meal
      const buff = hydrateProductionBuff(slot.buff, fallback)
      if (buff) {
        const expiresAt =
          typeof slot.expiresAt === 'number' && Number.isFinite(slot.expiresAt) ? slot.expiresAt : 0
        const effects = hydrateEffects(slot.effects, 'food')
        return {
          itemId: slot.itemId,
          qty: hydrateQty(slot.qty ?? slot.foodCount ?? rawWorker.foodCount),
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
    const fallback = isFoodItemId(rawWorker.foodItemId) ? foodBuffDef(rawWorker.foodItemId) : undefined
    const buff = hydrateProductionBuff(rawWorker.prodBuff, fallback)
    if (!buff) return null
    return {
      itemId: rawWorker.foodItemId,
      qty: hydrateQty(rawWorker.foodCount),
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
  const progress = normalizeWorkerProgress(src.level, src.xp)
  return hydrateWorkerCombatAttrs(
    fillWorkerHp({
      id,
      name: typeof src.name === 'string' ? src.name : undefined,
      classId: isClassId(src.classId) ? src.classId : undefined,
      qualityTier: hydrateQualityTier(src.qualityTier),
      assignment: resolveStationId(src.assignment),
      foodSlot: hydrateFoodSlot(src.foodSlot, src),
      fatigueDebt: hydrateFatigueDebt(src.fatigueDebt),
      hp: 0,
      hpMax: 1,
      level: progress.level,
      xp: progress.xp,
      combatAttrs: uniqueCombatAttrs(src.combatAttrs),
    }, src.hp),
    src.combatAttrs,
  )
}

/**
 * 旧档缺食物槽补 null；已派伐木 / 未知站撤到休息；`smithing` 映到 forging。
 * 工人身上的旧 toolSlot 不在这里落地，由 hydrate 一律回物资。
 * `qualityRev` 缺或小于当前色表版本时，按旧灰表迁一次 `qualityTier`。
 */
export function hydrateWorkers(raw: unknown, qualityRev?: unknown): Worker[] {
  if (!Array.isArray(raw)) return []
  const workers = raw.map((row, index) => hydrateWorker(row, index)).filter((w) => !isAssistWorker(w))
  if (needsGrayQualityMigration(qualityRev)) {
    for (const worker of workers) {
      worker.qualityTier = migrateQualityTierFromGrayTable(worker.qualityTier)
      hydrateWorkerCombatAttrs(worker, worker.combatAttrs)
    }
  }
  return workers
}

/** 写入一名工人，不扣钻石。GM 免费招人复用。新抽默认最低档。 */
export function spawnWorker(save: Save): Worker {
  const idx = save.nextWorkerId - 1
  return spawnWorkerWith(save, QUALITY_MIN, CLASS_PLACEHOLDERS[idx % CLASS_PLACEHOLDERS.length])
}

/** 指定品质与职业写入花名册。名字仍按 nextWorkerId 轮转。可带入已有战斗属性，只补新解锁空槽。 */
export function spawnWorkerWith(
  save: Save,
  qualityTier: QualityTier,
  classId: ClassId,
  combatAttrs: readonly CombatAttrId[] = [],
): Worker {
  const idx = save.nextWorkerId - 1
  const worker: Worker = spawnFillCombatAttrs(
    save,
    fillWorkerHp({
      id: `w-${save.nextWorkerId}`,
      name: WORKER_NAME_POOL[idx % WORKER_NAME_POOL.length],
      classId,
      qualityTier,
      assignment: null,
      foodSlot: null,
      fatigueDebt: 0,
      hp: 0,
      hpMax: 1,
      level: WORKER_LEVEL_MIN,
      xp: 0,
      combatAttrs: uniqueCombatAttrs(combatAttrs),
    }),
  )
  save.nextWorkerId += 1
  save.workers.push(worker)
  return worker
}

/** 表驱动抽工人。扣账号钻石，写入花名册。费用数字与旧金币抽人费相同。 */
export function recruitWorker(save: Save): ActionResult {
  const cost = recruitCost(save)
  if (save.diamonds < cost) return { ok: false, reason: '钻石不足' }
  save.diamonds -= cost
  spawnWorker(save)
  return { ok: true }
}
