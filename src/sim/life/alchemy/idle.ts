import { addToBank, takeFromBank } from '../../bank'
import { findWorker } from '../../createWorker'
import type { ActionResult, AlchemyAssignment, AlchemyRecipeId, Save, Worker } from '../../types'
import { ALCHEMY_RECIPE_DEF } from './tables'

function inputNeed(recipeId: AlchemyRecipeId, batchQty: number) {
  return ALCHEMY_RECIPE_DEF[recipeId].inputs.map((row) => ({
    itemId: row.itemId,
    qty: row.qty * batchQty,
  }))
}

/** 派遣 worker 看批次釜：投料后整批倒计时，到期一次进账号银行。不是连续单件。 */
export function startAlchemyBatch(
  save: Save,
  workerId: string,
  recipeId: AlchemyRecipeId,
  batchQty: number,
): ActionResult {
  const worker = findWorker(save, workerId)
  if (!worker) return { ok: false, reason: '没有这个 worker' }
  if (worker.assignment) return { ok: false, reason: '该 worker 已有派遣' }
  const recipe = ALCHEMY_RECIPE_DEF[recipeId]
  if (!recipe) return { ok: false, reason: '没有这个配方' }
  if (batchQty < 1) return { ok: false, reason: '批次数量无效' }
  if (save.life.alchemy.lifeLevel < recipe.needAlchemyLevel) {
    return { ok: false, reason: '炼金等级不足' }
  }
  for (const row of inputNeed(recipeId, batchQty)) {
    const took = takeFromBank(save, row.itemId, row.qty)
    if (!took.ok) return took
  }
  worker.assignment = {
    type: 'life',
    lifeId: 'alchemy',
    recipeId,
    batchQty,
    batchRemainS: recipe.batchS,
  }
  return { ok: true }
}

export function stepAlchemy(save: Save, worker: Worker): void {
  if (!worker.assignment || worker.assignment.type !== 'life') return
  if (worker.assignment.lifeId !== 'alchemy') return
  const job: AlchemyAssignment = worker.assignment
  const recipe = ALCHEMY_RECIPE_DEF[job.recipeId]
  if (!recipe) {
    worker.assignment = null
    return
  }
  job.batchRemainS -= 1
  if (job.batchRemainS > 0) return
  addToBank(save, recipe.output.itemId, recipe.output.qty * job.batchQty)
  save.life.alchemy.lifeXp += recipe.xp * job.batchQty
  worker.assignment = null
}
