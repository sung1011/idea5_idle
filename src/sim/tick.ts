import { cloneSave } from './clone'
import { stepCombat } from './combat/idle'
import { stepAlchemy } from './life/alchemy/idle'
import { stepMining } from './life/mining/idle'
import { stepWoodcutting } from './life/woodcutting/idle'
import type { Save, Worker } from './types'

export type TickOpts = {
  now?: number
}

function stepAssignment(save: Save, worker: Worker): void {
  const job = worker.assignment
  if (!job) return
  if (job.type === 'combat') {
    stepCombat(save, worker)
    return
  }
  if (job.lifeId === 'woodcutting') stepWoodcutting(save, worker)
  else if (job.lifeId === 'alchemy') stepAlchemy(save, worker)
  else if (job.lifeId === 'mining') stepMining(save, worker)
}

/** 在线与离线共用。按 worker 并行结算各自 assignment。 */
export function applyTick(save: Save, opts: TickOpts = {}): void {
  save.elapsedS += 1
  save.lastTick = opts.now ?? Date.now()
  for (const worker of save.workers) stepAssignment(save, worker)
}

export function tick(save: Save, opts?: TickOpts): Save {
  const next = cloneSave(save)
  applyTick(next, opts)
  return next
}

export function ticks(save: Save, n: number, opts?: TickOpts): Save {
  const next = cloneSave(save)
  for (let i = 0; i < n; i++) applyTick(next, opts)
  return next
}
