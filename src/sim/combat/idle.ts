import type { CombatAssignment, Save, Worker } from '../types'

/** 木桩战斗挂机骨架。进度与 XP 留给阶段 1。 */
export function startCombatDummy(worker: Worker): void {
  worker.assignment = { type: 'combat', target: 'dummy', progressS: 0 }
}

export function stepCombat(_save: Save, worker: Worker): void {
  if (!worker.assignment || worker.assignment.type !== 'combat') return
  const job: CombatAssignment = worker.assignment
  job.progressS += 1
}
