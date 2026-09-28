import type { Save } from './types'

/** 正在采药除草的工人。不进休息区，也不能开战或上岗。 */
export function isWorkerInHerbPvp(save: Save, workerId: string): boolean {
  const plots = save.herbPvp?.plots
  if (!plots) return false
  return plots.some((plot) => plot.workerId === workerId && !plot.cleared)
}

export function herbPvpBlockReason(save: Save, workerId: string): string | null {
  return isWorkerInHerbPvp(save, workerId) ? '正在采药' : null
}
