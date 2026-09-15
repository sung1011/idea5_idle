import { addToBank } from '../../bank'
import { findWorker } from '../../createWorker'
import type { ActionResult, MineNodeId, MiningAssignment, Save, Worker } from '../../types'
import { MINE_NODE_DEF } from './tables'

/** 采矿连续挖骨架。与伐木同型、独立表；完整玩法后做。 */
export function startMining(save: Save, workerId: string, nodeId: MineNodeId): ActionResult {
  const worker = findWorker(save, workerId)
  if (!worker) return { ok: false, reason: '没有这个 worker' }
  const node = MINE_NODE_DEF[nodeId]
  if (!node) return { ok: false, reason: '没有这种矿' }
  if (save.life.mining.lifeLevel < node.needMineLevel) {
    return { ok: false, reason: '采矿等级不足' }
  }
  worker.assignment = {
    type: 'life',
    lifeId: 'mining',
    nodeId,
    progressS: 0,
  }
  return { ok: true }
}

export function stepMining(save: Save, worker: Worker): void {
  if (!worker.assignment || worker.assignment.type !== 'life') return
  if (worker.assignment.lifeId !== 'mining') return
  const job: MiningAssignment = worker.assignment
  const node = MINE_NODE_DEF[job.nodeId]
  if (!node) {
    worker.assignment = null
    return
  }
  job.progressS += 1
  if (job.progressS < node.mineS) return
  addToBank(save, node.itemId, 1)
  save.life.mining.lifeXp += node.xp
  job.progressS = 0
}
