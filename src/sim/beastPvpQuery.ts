import type { Save } from './types'

/** 正在打困兽的苦工。不进休息区，也不能开战、割草或上岗。 */
export function isWorkerInBeastPvp(save: Save, workerId: string): boolean {
  const workers = save.beastPvp?.fight?.workers
  if (!workers) return false
  return workers.some((row) => row.id === workerId)
}

export function beastPvpBlockReason(save: Save, workerId: string): string | null {
  return isWorkerInBeastPvp(save, workerId) ? '正在打困兽' : null
}
