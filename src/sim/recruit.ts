import { CLASS_PLACEHOLDERS, RECRUIT_COST, WORKER_NAME_POOL } from './tables'
import type { ActionResult, Save, Worker } from './types'

export function findWorker(save: Save, workerId: string): Worker | undefined {
  return save.workers.find((w) => w.id === workerId)
}

/** 表驱动抽工人。扣账号金币，写入花名册。 */
export function recruitWorker(save: Save): ActionResult {
  if (save.gold < RECRUIT_COST) return { ok: false, reason: '金币不足' }
  const idx = save.nextWorkerId - 1
  const worker: Worker = {
    id: `w-${save.nextWorkerId}`,
    name: WORKER_NAME_POOL[idx % WORKER_NAME_POOL.length],
    classId: CLASS_PLACEHOLDERS[idx % CLASS_PLACEHOLDERS.length],
    assignment: null,
  }
  save.gold -= RECRUIT_COST
  save.nextWorkerId += 1
  save.workers.push(worker)
  return { ok: true }
}
