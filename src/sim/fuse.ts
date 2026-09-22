import { assignedWorkers, assignWorker } from './assign'
import { fillWorkerHp } from './combat'
import { unloadFood } from './food'
import { clearWorkerNew, findWorker, spawnWorkerWith } from './recruit'
import { workerFromTotalXp, workerTotalXp } from './workerLevel'
import { roll01 } from './rng'
import {
  CLASS_LABEL,
  classPoolForQuality,
  isStationId,
  pickClassFromPool,
  QUALITY_MAX,
  STATION_WORKER_CAP,
  workerQualityDef,
} from './tables'
import { fuseStayAssigned } from './tech'
import type { ActionResult, QualityTier, Save, StationId, Worker } from './types'

function stripSlots(save: Save, worker: Worker): void {
  if (worker.foodSlot) unloadFood(save, worker.id)
}

function clearEmptyStation(save: Save, stationId: StationId | null): void {
  if (!stationId || !isStationId(stationId)) return
  if (assignedWorkers(save, stationId).length > 0) return
  save.stations[stationId].progress = 0
  save.stations[stationId].stallReason = null
}

function fusePairAt(save: Save, a: Worker, b: Worker, stayAt: StationId | null): ActionResult {
  clearWorkerNew(save, a.id)
  clearWorkerNew(save, b.id)
  stripSlots(save, a)
  stripSlots(save, b)
  const leftFrom = a.assignment
  const rightFrom = b.assignment
  const nextTier = (a.qualityTier + 1) as QualityTier
  const pool = classPoolForQuality(nextTier)
  const classId = pickClassFromPool(pool, roll01(save))
  const keptAttrs = a.combatAttrs
  const sumTotal = workerTotalXp(a.level, a.xp) + workerTotalXp(b.level, b.xp)
  const progress = workerFromTotalXp(sumTotal)
  save.workers = save.workers.filter((w) => w.id !== a.id && w.id !== b.id)
  const worker = spawnWorkerWith(save, nextTier, classId, keptAttrs)
  worker.level = progress.level
  worker.xp = progress.xp
  fillWorkerHp(worker)
  if (stayAt) worker.assignment = stayAt
  if (leftFrom !== stayAt) clearEmptyStation(save, leftFrom)
  if (rightFrom !== stayAt) clearEmptyStation(save, rightFrom)
  const quality = workerQualityDef(nextTier)
  const job = worker.classId ? CLASS_LABEL[worker.classId] : '未标'
  save.fuseDragTipDone = true
  return { ok: true, message: `合成出${worker.name ?? worker.id}（${quality.label}·${job}）` }
}

export function hydrateFuseDragTip(save: Save): void {
  save.fuseDragTipDone = save.fuseDragTipDone === true
}

function fusePairReady(a: Worker | undefined, b: Worker | undefined): ActionResult | null {
  if (!a || !b) return { ok: false, reason: '没有这个工人' }
  if (a.id === b.id) return { ok: false, reason: '不能合成同一个人' }
  if (a.qualityTier !== b.qualityTier) return { ok: false, reason: '品质不同，不能合成' }
  if (a.qualityTier >= QUALITY_MAX) return { ok: false, reason: '已是最高品质' }
  return null
}

/** 同站同档两人合成：消耗两人，产出 1 个高一档新人（留在原站、空槽）。满档 / 不同档 / 不同站失败。 */
export function fuseWorkers(save: Save, workerIdA: string, workerIdB: string): ActionResult {
  if (!workerIdA || !workerIdB) return { ok: false, reason: '请选两个同品质工人' }
  if (workerIdA === workerIdB) return { ok: false, reason: '不能合成同一个人' }
  const a = findWorker(save, workerIdA)
  const b = findWorker(save, workerIdB)
  const ready = fusePairReady(a, b)
  if (ready || !a || !b) return ready ?? { ok: false, reason: '没有这个工人' }
  if (!a.assignment || a.assignment !== b.assignment) {
    return { ok: false, reason: '只能合并同一工坊的两人' }
  }
  const stayAt = fuseStayAssigned(save) ? a.assignment : null
  return fusePairAt(save, a, b, stayAt)
}

/** 拖放到目标槽：与该槽工人合成，不先派驻（满站也能合），新人留在 stationId。 */
export function canFuseWorkerOntoOccupant(
  save: Save,
  sourceId: string,
  occupantId: string,
  stationId: StationId | null,
): boolean {
  if (!stationId || !isStationId(stationId) || !sourceId || !occupantId || sourceId === occupantId) return false
  const source = findWorker(save, sourceId)
  const occupant = findWorker(save, occupantId)
  if (fusePairReady(source, occupant) || !occupant) return false
  return occupant.assignment === stationId
}

export function fuseWorkerOntoOccupant(
  save: Save,
  sourceId: string,
  occupantId: string,
  stationId: StationId,
): ActionResult {
  if (!isStationId(stationId)) return { ok: false, reason: '没有这个站点' }
  if (!sourceId || !occupantId) return { ok: false, reason: '请选两个同品质工人' }
  const source = findWorker(save, sourceId)
  const occupant = findWorker(save, occupantId)
  const ready = fusePairReady(source, occupant)
  if (ready || !source || !occupant) return ready ?? { ok: false, reason: '没有这个工人' }
  if (occupant.assignment !== stationId) return { ok: false, reason: '只能合并同一工坊的两人' }
  return fusePairAt(save, source, occupant, stationId)
}

/** 该站两人同档且未满档，与 fuseStationWorkers 成功条件一致。 */
export function canFuseStationWorkers(save: Save, stationId: StationId): boolean {
  if (!isStationId(stationId)) return false
  const pair = assignedWorkers(save, stationId)
  if (pair.length < 2) return false
  const a = pair[0]
  const b = pair[1]
  return a.qualityTier === b.qualityTier && a.qualityTier < QUALITY_MAX
}

/**
 * 派驻弹层：当前工人与目标站已有工人（或同站另一人）同档且可合成。
 * 人已在该站则按站上两人判定；否则目标站须有空位、且已有同档工人。
 */
export function canFuseWorkerWithStation(
  save: Save,
  workerId: string,
  stationId: StationId | null,
): boolean {
  if (!stationId || !isStationId(stationId)) return false
  const worker = findWorker(save, workerId)
  if (!worker || worker.qualityTier >= QUALITY_MAX) return false
  const crew = assignedWorkers(save, stationId)
  const others = crew.filter((w) => w.id !== worker.id)
  if (!others.some((w) => w.qualityTier === worker.qualityTier)) return false
  if (worker.assignment === stationId) return crew.length >= 2
  return crew.length < STATION_WORKER_CAP
}

/** 工坊站卡入口：该站正好 2 人才能合。品质规则走 fuseWorkers。 */
export function fuseStationWorkers(save: Save, stationId: StationId): ActionResult {
  if (!isStationId(stationId)) return { ok: false, reason: '没有这个站点' }
  const pair = assignedWorkers(save, stationId)
  if (pair.length < 2) return { ok: false, reason: '该站需要 2 人才可合并' }
  return fuseWorkers(save, pair[0].id, pair[1].id)
}

/** 派驻弹层入口：人未在目标站则先派驻，再走 fuseStationWorkers。不可合成时不派驻。 */
export function fuseWorkerWithStation(save: Save, workerId: string, stationId: StationId): ActionResult {
  const worker = findWorker(save, workerId)
  if (!worker) return { ok: false, reason: '没有这个工人' }
  if (!canFuseWorkerWithStation(save, workerId, stationId)) {
    if (worker.assignment === stationId) return fuseStationWorkers(save, stationId)
    if (!isStationId(stationId)) return { ok: false, reason: '没有这个站点' }
    return { ok: false, reason: '品质不同，不能合成' }
  }
  if (worker.assignment !== stationId) {
    const assigned = assignWorker(save, workerId, stationId)
    if (!assigned.ok) return assigned
  }
  return fuseStationWorkers(save, stationId)
}

export function stationMergeLabel(_save: Save, _stationId: StationId): string {
  return '合成'
}
