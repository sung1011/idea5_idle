import { unloadFood } from './food'
import { findWorker, spawnWorkerWith } from './recruit'
import { roll01 } from './rng'
import {
  CLASS_LABEL,
  classPoolForQuality,
  pickClassFromPool,
  QUALITY_MAX,
  workerQualityDef,
} from './tables'
import { unequipTool } from './tools'
import type { ActionResult, QualityTier, Save, Worker } from './types'

function stripSlots(save: Save, worker: Worker): void {
  if (worker.toolSlot) unequipTool(save, worker.id)
  if (worker.foodSlot) unloadFood(save, worker.id)
}

/** 同档两人合成：消耗两人，产出 1 个高一档新人。满档 / 不同档失败。 */
export function fuseWorkers(save: Save, workerIdA: string, workerIdB: string): ActionResult {
  if (!workerIdA || !workerIdB) return { ok: false, reason: '请选两个同品质工人' }
  if (workerIdA === workerIdB) return { ok: false, reason: '不能合成同一个人' }
  const a = findWorker(save, workerIdA)
  const b = findWorker(save, workerIdB)
  if (!a || !b) return { ok: false, reason: '没有这个工人' }
  if (a.qualityTier !== b.qualityTier) return { ok: false, reason: '品质不同，不能合成' }
  if (a.qualityTier >= QUALITY_MAX) return { ok: false, reason: '已是最高品质' }

  stripSlots(save, a)
  stripSlots(save, b)

  const nextTier = (a.qualityTier + 1) as QualityTier
  const pool = classPoolForQuality(nextTier)
  const classId = pickClassFromPool(pool, roll01(save))

  save.workers = save.workers.filter((w) => w.id !== a.id && w.id !== b.id)
  const worker = spawnWorkerWith(save, nextTier, classId)
  const quality = workerQualityDef(nextTier)
  const job = worker.classId ? CLASS_LABEL[worker.classId] : '未标'
  return { ok: true, message: `合成出${worker.name ?? worker.id}（${quality.label}·${job}）` }
}
