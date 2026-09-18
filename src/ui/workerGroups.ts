import { isWorkerInCombat } from '../sim/combat'
import { QUALITY_TIERS, STATION_DEF, WORKER_QUALITY_TABLE } from '../sim/tables'
import type { QualityTier, Save, Worker, WorkerQualityId } from '../sim/types'

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
