import { ref } from 'vue'
import type { RestEatNotice } from '../sim/food'
import { pushFloatTip } from './floatTips'

/** 休息行进食反馈时长。 */
export const WORKER_EAT_MS = 700

const flashing = ref<Record<string, string>>({})
const timers = new Map<string, ReturnType<typeof setTimeout>>()

export function isWorkerEatFlashing(workerId: string): boolean {
  return Object.prototype.hasOwnProperty.call(flashing.value, workerId)
}

export function workerEatFlashText(workerId: string): string {
  return flashing.value[workerId] ?? ''
}

export function clearWorkerEatFlash(): void {
  for (const timer of timers.values()) clearTimeout(timer)
  timers.clear()
  flashing.value = {}
}

export function markWorkerEatFlash(workerId: string, message: string): void {
  const text = message.trim()
  if (!workerId || !text) return
  flashing.value = { ...flashing.value, [workerId]: text }
  const prev = timers.get(workerId)
  if (prev) clearTimeout(prev)
  const later = typeof window !== 'undefined' ? window.setTimeout.bind(window) : setTimeout
  timers.set(
    workerId,
    later(() => {
      timers.delete(workerId)
      if (!Object.prototype.hasOwnProperty.call(flashing.value, workerId)) return
      const next = { ...flashing.value }
      delete next[workerId]
      flashing.value = next
    }, WORKER_EAT_MS),
  )
}

/** 进食成功：全局漂字，并让该工人休息行亮一下。可与升级闪叠在一起。 */
export function announceWorkerEats(notices: readonly RestEatNotice[]): void {
  for (const notice of notices) {
    const text = notice.message.trim()
    if (!notice.workerId || !text) continue
    pushFloatTip(text, 'ok')
    markWorkerEatFlash(notice.workerId, text)
  }
}
