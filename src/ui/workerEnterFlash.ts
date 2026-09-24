import { ref } from 'vue'

/** 头像放大落地的时长。 */
export const WORKER_ENTER_MS = 450
/** 同一帧里连续上岗时，后一个人再晚这么久。 */
export const WORKER_ENTER_STAGGER_MS = 80

export type AssignSnap = ReadonlyMap<string, string | null>

const entering = ref<Record<string, number>>({})
const timers = new Map<string, ReturnType<typeof setTimeout>>()

export function workerAssignSnapshot(
  workers: readonly { id: string; assignment: string | null }[],
): Map<string, string | null> {
  return new Map(workers.map((worker) => [worker.id, worker.assignment]))
}

export function isWorkerEntering(workerId: string): boolean {
  return Object.prototype.hasOwnProperty.call(entering.value, workerId)
}

export function workerEnterDelayMs(workerId: string): number {
  return entering.value[workerId] ?? 0
}

export function clearWorkerEnterFlash(): void {
  for (const timer of timers.values()) clearTimeout(timer)
  timers.clear()
  entering.value = {}
}

export function markWorkerEnter(workerId: string, delayMs = 0): void {
  const delay = Math.max(0, Math.floor(delayMs))
  entering.value = { ...entering.value, [workerId]: delay }
  const prev = timers.get(workerId)
  if (prev) clearTimeout(prev)
  const later = typeof window !== 'undefined' ? window.setTimeout.bind(window) : setTimeout
  timers.set(
    workerId,
    later(() => {
      timers.delete(workerId)
      if (!Object.prototype.hasOwnProperty.call(entering.value, workerId)) return
      const next = { ...entering.value }
      delete next[workerId]
      entering.value = next
    }, WORKER_ENTER_MS + delay),
  )
}

/**
 * 本帧 assignment 从 null 变成站 id 才标记。
 * 换站、撤岗、刚出现的新人都不算。同一帧按名册顺序错开。
 */
export function announceWorkerStationEnters(
  before: AssignSnap,
  workers: readonly { id: string; assignment: string | null }[],
): string[] {
  const entered: string[] = []
  for (const worker of workers) {
    if (!before.has(worker.id)) continue
    if (before.get(worker.id) != null) continue
    if (worker.assignment == null) continue
    entered.push(worker.id)
  }
  entered.forEach((id, index) => markWorkerEnter(id, index * WORKER_ENTER_STAGGER_MS))
  return entered
}
