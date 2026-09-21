import { assignedWorkers, assignWorker, withdrawWorker } from '../sim/assign'
import { fightingWorkerIds, isWorkerInCombat } from '../sim/combat'
import { canFuseWorkerWithStation } from '../sim/fuse'
import { isStationUnlocked, stationLockedTip } from '../sim/stationUnlock'
import { QUALITY_TIERS, STATION_DEF, STATION_ORDER, STATION_WORKER_CAP, WORKER_QUALITY_TABLE } from '../sim/tables'
import type { ActionResult, QualityTier, Save, StationId, Worker, WorkerQualityId } from '../sim/types'
import { railWorkerDotColors } from './workshopRail'

export type WorkerGroupOrder = 'highFirst' | 'lowFirst'

export const WORKER_GROUP_ORDER_KEY = 'idea5IdleWorkerGroupOrder'
export const DEFAULT_WORKER_GROUP_ORDER: WorkerGroupOrder = 'highFirst'

export type WorkerDutyKind = 'rest' | 'busy' | 'fight'

export type WorkerQualityGroup = {
  tier: QualityTier
  id: WorkerQualityId
  label: string
  color: string
  workers: Worker[]
}

export function isWorkerGroupOrder(id: unknown): id is WorkerGroupOrder {
  return id === 'highFirst' || id === 'lowFirst'
}

export function workerGroupOrderOf(id: unknown): WorkerGroupOrder {
  return isWorkerGroupOrder(id) ? id : DEFAULT_WORKER_GROUP_ORDER
}

function storageOf(storage?: Storage | null): Storage | null {
  if (storage) return storage
  if (typeof localStorage === 'undefined') return null
  return localStorage
}

export function loadWorkerGroupOrder(storage?: Storage | null): WorkerGroupOrder {
  const store = storageOf(storage)
  if (!store) return DEFAULT_WORKER_GROUP_ORDER
  try {
    return workerGroupOrderOf(store.getItem(WORKER_GROUP_ORDER_KEY))
  } catch {
    return DEFAULT_WORKER_GROUP_ORDER
  }
}

export function saveWorkerGroupOrder(id: unknown, storage?: Storage | null): WorkerGroupOrder {
  const next = workerGroupOrderOf(id)
  const store = storageOf(storage)
  if (!store) return next
  try {
    store.setItem(WORKER_GROUP_ORDER_KEY, next)
  } catch {
    // quota / private mode
  }
  return next
}

export function toggleWorkerGroupOrder(id: WorkerGroupOrder): WorkerGroupOrder {
  return id === 'highFirst' ? 'lowFirst' : 'highFirst'
}

/** 空档不占段。组内保持名册原序。 */
export function groupWorkersByQuality(
  workers: readonly Worker[],
  order: WorkerGroupOrder = DEFAULT_WORKER_GROUP_ORDER,
): WorkerQualityGroup[] {
  const buckets = new Map<QualityTier, Worker[]>()
  for (const worker of workers) {
    const list = buckets.get(worker.qualityTier) ?? []
    list.push(worker)
    buckets.set(worker.qualityTier, list)
  }
  const present = QUALITY_TIERS.filter((tier) => buckets.has(tier))
  const sorted = order === 'highFirst' ? [...present].reverse() : [...present]
  return sorted.map((tier) => {
    const def = WORKER_QUALITY_TABLE[tier]
    return {
      tier,
      id: def.id,
      label: def.label,
      color: def.color,
      workers: buckets.get(tier) ?? [],
    }
  })
}

export function workerDutyKind(save: Save, worker: Worker): WorkerDutyKind {
  if (isWorkerInCombat(save, worker.id)) return 'fight'
  if (worker.assignment !== null) return 'busy'
  return 'rest'
}

export function workerDutyLabel(save: Save, worker: Worker): string {
  const kind = workerDutyKind(save, worker)
  if (kind === 'fight') return '战斗中'
  if (kind === 'busy' && worker.assignment) {
    return `在岗 · ${STATION_DEF[worker.assignment].label}`
  }
  if (kind === 'busy') return '在岗'
  return '休息'
}

export function workerShortName(worker: Worker): string {
  const name = worker.name?.trim()
  if (name) return name
  return worker.id
}

export function rosterDutyCounts(save: Save) {
  let rest = 0
  let busy = 0
  let fight = 0
  for (const worker of save.workers) {
    const kind = workerDutyKind(save, worker)
    if (kind === 'rest') rest += 1
    else if (kind === 'busy') busy += 1
    else fight += 1
  }
  return { total: save.workers.length, rest, busy, fight }
}

/** 空位灰点，对齐工坊竖签「有人亮品质色」；休息站两颗都空。 */
export const CREW_DOT_EMPTY = '#e8e0d0'

export type CrewDot = {
  empty: boolean
  color: string
}

export type WorkerAssignChoice = {
  stationId: StationId | null
  label: string
  dots: CrewDot[]
  current: boolean
  disabled: boolean
  locked: boolean
  canFuse: boolean
}

export function stationCrewDots(save: Save, stationId: StationId | null): CrewDot[] {
  const filled = stationId ? railWorkerDotColors(save, stationId) : []
  const dots: CrewDot[] = []
  for (let i = 0; i < STATION_WORKER_CAP; i += 1) {
    const color = filled[i]
    dots.push(color ? { empty: false, color } : { empty: true, color: CREW_DOT_EMPTY })
  }
  return dots
}

export function stationAssignCaption(save: Save, stationId: StationId | null): string {
  if (stationId === null) return '休息'
  const n = assignedWorkers(save, stationId).length
  return `${STATION_DEF[stationId].label} · ${n}/${STATION_WORKER_CAP}`
}

/** 图标下工坊钮：休息只写站名；在岗带该站 0/1/2。 */
export function workerShopCaption(save: Save, worker: Worker): string {
  return stationAssignCaption(save, worker.assignment)
}

/** 有派驻站才可前往工坊；休息（assignment null）置灰。出战不算派驻，同样不可点。 */
export function canGoToAssignedWorkshop(worker: Worker): boolean {
  return worker.assignment !== null
}

/** 满员不可再派；当前站 / 休息钮选中即不可点；战斗中全不可派。沿用 assignWorker。 */
export function canAssignWorkerTo(save: Save, worker: Worker, stationId: StationId | null): boolean {
  if (isWorkerInCombat(save, worker.id)) return false
  if (worker.assignment === stationId) return false
  if (stationId === null) return true
  if (!isStationUnlocked(save, stationId)) return false
  return assignedWorkers(save, stationId).length < STATION_WORKER_CAP
}

/** 现玩法站按 STATION_ORDER（工坊组上→下），末项休息。 */
export function workerAssignChoices(save: Save, worker: Worker): WorkerAssignChoice[] {
  const ids: Array<StationId | null> = [...STATION_ORDER, null]
  return ids.map((stationId) => {
    const locked = stationId != null && !isStationUnlocked(save, stationId)
    return {
      stationId,
      label: stationAssignCaption(save, stationId),
      dots: stationCrewDots(save, stationId),
      current: worker.assignment === stationId,
      disabled: !canAssignWorkerTo(save, worker, stationId),
      locked,
      canFuse: !locked && canFuseWorkerWithStation(save, worker.id, stationId),
    }
  })
}

export type WorkshopStationBoard = {
  stationId: StationId
  label: string
  filled: number
  cap: number
  slots: Array<Worker | null>
}

/** 现玩法站按 STATION_ORDER（工坊组上→下），每站固定 2 槽，空位 null 占位。 */
export function workshopStationBoards(save: Save): WorkshopStationBoard[] {
  return STATION_ORDER.map((stationId) => {
    const crew = assignedWorkers(save, stationId)
    const slots: Array<Worker | null> = []
    for (let i = 0; i < STATION_WORKER_CAP; i += 1) {
      slots.push(crew[i] ?? null)
    }
    return {
      stationId,
      label: STATION_DEF[stationId].label,
      filled: crew.length,
      cap: STATION_WORKER_CAP,
      slots,
    }
  })
}

export function rosterSlotCounts(save: Save) {
  const boards = workshopStationBoards(save)
  let filled = 0
  for (const board of boards) filled += board.filled
  return { stations: boards.length, filled, cap: boards.length * STATION_WORKER_CAP }
}

/** 未派驻工人（含出战）。名册原序。 */
export function unassignedWorkers(save: Save): Worker[] {
  return save.workers.filter((worker) => worker.assignment === null)
}

/** 主线进行中出场名单（进行中战斗的存活场上工人）。倒下回休息；工坊在岗即使被波及也不进此列。 */
export function mainlineCombatWorkers(save: Save): Worker[] {
  const fighting = fightingWorkerIds(save)
  return save.workers.filter((worker) => worker.assignment === null && fighting.has(worker.id))
}

/** 未派驻且未在主线战斗。名册原序。 */
export function restingWorkers(save: Save): Worker[] {
  return save.workers.filter((worker) => worker.assignment === null && !isWorkerInCombat(save, worker.id))
}

/** 药剂→食物→符文，站内左槽先于右槽；满员跳过。 */
export function firstEmptyDispatchStation(save: Save): StationId | null {
  for (const stationId of STATION_ORDER) {
    if (!isStationUnlocked(save, stationId)) continue
    if (assignedWorkers(save, stationId).length < STATION_WORKER_CAP) return stationId
  }
  return null
}

export function canDispatchRestingWorker(save: Save): boolean {
  return restingWorkers(save).length > 0 && firstEmptyDispatchStation(save) != null
}

/** 休息区首位派到第一空槽。沿用 assignWorker。 */
export function assignRestingToFirstEmpty(save: Save): ActionResult {
  const idle = restingWorkers(save)[0]
  if (!idle) return { ok: false, reason: '没有可派的工人' }
  const stationId = firstEmptyDispatchStation(save)
  if (!stationId) {
    const lockedEmpty = STATION_ORDER.find(
      (id) => !isStationUnlocked(save, id) && assignedWorkers(save, id).length < STATION_WORKER_CAP,
    )
    if (lockedEmpty) return { ok: false, reason: stationLockedTip(lockedEmpty) }
    return { ok: false, reason: '工位已满' }
  }
  return assignWorker(save, idle.id, stationId)
}

/** 派入扫描逆序：武器→食物→药剂，站内后派的先撤。出战不计入。 */
export function lastOccupiedDispatchStation(save: Save): StationId | null {
  for (let i = STATION_ORDER.length - 1; i >= 0; i -= 1) {
    const stationId = STATION_ORDER[i]
    const crew = assignedWorkers(save, stationId).filter((w) => !isWorkerInCombat(save, w.id))
    if (crew.length > 0) return stationId
  }
  return null
}

export function canWithdrawWorkshopWorker(save: Save): boolean {
  return lastOccupiedDispatchStation(save) != null
}

/** 在岗一人撤回休息。沿用 withdrawWorker / assignWorker。 */
export function withdrawWorkshopToRest(save: Save): ActionResult {
  const stationId = lastOccupiedDispatchStation(save)
  if (!stationId) return { ok: false, reason: '没有可撤的工人' }
  return withdrawWorker(save, stationId)
}
