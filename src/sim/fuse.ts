import { assignedWorkers } from './assign'
import { unloadFood } from './food'
import { findWorker, spawnWorkerWith } from './recruit'
import { roll01 } from './rng'
import {
  CLASS_LABEL,
  classPoolForQuality,
  isStationId,
  pickClassFromPool,
  QUALITY_MAX,
  STATION_DEF,
  workerQualityDef,
} from './tables'
import { fuseStayAssigned } from './tech'
import type { ActionResult, QualityTier, Save, StationId, Worker } from './types'

function stripSlots(save: Save, worker: Worker): void {
  if (worker.foodSlot) unloadFood(save, worker.id)
}

/** 同站同档两人合成：消耗两人，产出 1 个高一档新人（休息、空槽）。满档 / 不同档 / 不同站失败。 */
export function fuseWorkers(save: Save, workerIdA: string, workerIdB: string): ActionResult {
  if (!workerIdA || !workerIdB) return { ok: false, reason: '请选两个同品质工人' }
  if (workerIdA === workerIdB) return { ok: false, reason: '不能合成同一个人' }
  const a = findWorker(save, workerIdA)
  const b = findWorker(save, workerIdB)
  if (!a || !b) return { ok: false, reason: '没有这个工人' }
  if (!a.assignment || a.assignment !== b.assignment) {
    return { ok: false, reason: '只能合并同一工坊的两人' }
  }
  if (a.qualityTier !== b.qualityTier) return { ok: false, reason: '品质不同，不能合成' }
  if (a.qualityTier >= QUALITY_MAX) return { ok: false, reason: '已是最高品质' }

  stripSlots(save, a)
  stripSlots(save, b)

  const nextTier = (a.qualityTier + 1) as QualityTier
  const pool = classPoolForQuality(nextTier)
  const classId = pickClassFromPool(pool, roll01(save))

  const stayAt = fuseStayAssigned(save) ? a.assignment : null
  save.workers = save.workers.filter((w) => w.id !== a.id && w.id !== b.id)
  const worker = spawnWorkerWith(save, nextTier, classId)
  if (stayAt) worker.assignment = stayAt
  const quality = workerQualityDef(nextTier)
  const job = worker.classId ? CLASS_LABEL[worker.classId] : '未标'
  return { ok: true, message: `合成出${worker.name ?? worker.id}（${quality.label}·${job}）` }
}

/** 工坊站卡入口：该站正好 2 人才能合。品质规则走 fuseWorkers。 */
export function fuseStationWorkers(save: Save, stationId: StationId): ActionResult {
  if (!isStationId(stationId)) return { ok: false, reason: '没有这个站点' }
  const pair = assignedWorkers(save, stationId)
  if (pair.length < 2) return { ok: false, reason: '该站需要 2 人才可合并' }
  return fuseWorkers(save, pair[0].id, pair[1].id)
}

export function stationMergeLabel(save: Save, stationId: StationId): string {
  const pair = assignedWorkers(save, stationId)
  if (pair.length < 2) return `合并（${STATION_DEF[stationId].label}）`
  const names = pair.map((w) => w.name ?? w.id).join(' + ')
  return `合并 ${names}`
}
