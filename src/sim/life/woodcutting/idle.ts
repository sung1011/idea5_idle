import { addToBank } from '../../bank'
import { findWorker } from '../../createWorker'
import type { ActionResult, Save, TreeId, Worker, WoodcuttingAssignment } from '../../types'
import { TREE_DEF } from './tables'

/** 派遣 worker 连续砍：每 chopS 出 1 件进账号银行，进度清零后继续。 */
export function startWoodcutting(save: Save, workerId: string, treeId: TreeId): ActionResult {
  const worker = findWorker(save, workerId)
  if (!worker) return { ok: false, reason: '没有这个 worker' }
  const tree = TREE_DEF[treeId]
  if (!tree) return { ok: false, reason: '没有这种树' }
  if (save.life.woodcutting.lifeLevel < tree.needWoodcutLevel) {
    return { ok: false, reason: '伐木等级不足' }
  }
  worker.assignment = {
    type: 'life',
    lifeId: 'woodcutting',
    treeId,
    progressS: 0,
  }
  return { ok: true }
}

export function stopLifeJob(worker: Worker): void {
  worker.assignment = null
}

export function stepWoodcutting(save: Save, worker: Worker): void {
  if (!worker.assignment || worker.assignment.type !== 'life') return
  if (worker.assignment.lifeId !== 'woodcutting') return
  const job: WoodcuttingAssignment = worker.assignment
  const tree = TREE_DEF[job.treeId]
  if (!tree) {
    worker.assignment = null
    return
  }
  job.progressS += 1
  if (job.progressS < tree.chopS) return
  addToBank(save, tree.itemId, 1)
  save.life.woodcutting.lifeXp += tree.xp
  job.progressS = 0
}
