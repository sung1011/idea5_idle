import { ref } from 'vue'
import type { Worker } from '../sim/types'
import { workerLevelUpTip } from '../sim/workerLevel'
import { pushFloatTip } from './floatTips'
import { workerShortName } from './workerGroups'

const FLASH_MS = 1400
const flashingIds = ref<string[]>([])
const timers = new Map<string, ReturnType<typeof setTimeout>>()

export function isWorkerLevelFlashing(workerId: string): boolean {
  return flashingIds.value.includes(workerId)
}

export function clearWorkerLevelFlash(): void {
  for (const timer of timers.values()) clearTimeout(timer)
  timers.clear()
  flashingIds.value = []
}

export function markWorkerLevelFlash(workerId: string): void {
  if (!flashingIds.value.includes(workerId)) {
    flashingIds.value = [...flashingIds.value, workerId]
  }
  const prev = timers.get(workerId)
  if (prev) clearTimeout(prev)
  const later = typeof window !== 'undefined' ? window.setTimeout.bind(window) : setTimeout
  timers.set(
    workerId,
    later(() => {
      timers.delete(workerId)
      flashingIds.value = flashingIds.value.filter((id) => id !== workerId)
    }, FLASH_MS),
  )
}

export function workerLevelSnapshot(workers: readonly Pick<Worker, 'id' | 'level'>[]): Map<string, number> {
  return new Map(workers.map((worker) => [worker.id, Math.max(1, Math.floor(worker.level || 1))]))
}

/** 已在名册、且本拍等级升高的工人：浮字 + 短暂闪。新 id（合成）不报。 */
export function announceWorkerLevelUps(before: ReadonlyMap<string, number>, workers: readonly Worker[]): void {
  for (const worker of workers) {
    const prev = before.get(worker.id)
    if (prev == null || worker.level <= prev) continue
    pushFloatTip(workerLevelUpTip(workerShortName(worker), worker.level), 'ok')
    markWorkerLevelFlash(worker.id)
  }
}
