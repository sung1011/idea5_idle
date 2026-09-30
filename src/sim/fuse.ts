import { isWorkerInBeastPvp } from './beastPvpQuery'
import { isWorkerInHerbPvp } from './herbPvpQuery'
import { fillWorkerHp } from './combat'
import { starterGuideFuseAttr } from './encounters'
import { unloadFood } from './food'
import { clearWorkerNew, findWorker, spawnWorkerWith } from './recruit'
import { workerFromTotalXp, workerTotalXp } from './workerLevel'
import { roll01 } from './rng'
import { CLASS_LABEL, classPoolForQuality, pickClassFromPool, QUALITY_MAX, workerQualityDef } from './tables'
import { rollWorkerName, rollWorkerRace } from './workerRace'
import type { ActionResult, QualityTier, Save, Worker } from './types'

/** 站上、在岗拖到营地、拖到工位，一律用这句拒绝。 */
export const CAMP_FUSE_ONLY_REASON = '只能在营地合成'

function stripSlots(save: Save, worker: Worker): void {
  if (worker.foodSlot) unloadFood(save, worker.id)
}

function fusePairAt(save: Save, a: Worker, b: Worker): ActionResult {
  clearWorkerNew(save, a.id)
  clearWorkerNew(save, b.id)
  stripSlots(save, a)
  stripSlots(save, b)
  const nextTier = (a.qualityTier + 1) as QualityTier
  const pool = classPoolForQuality(nextTier)
  const classId = pickClassFromPool(pool, roll01(save))
  const race = rollWorkerRace(save)
  const givenName = rollWorkerName(save, race)
  const pinned = starterGuideFuseAttr(save)
  const keptAttrs = pinned ? [pinned] : a.combatAttrs
  const sumTotal = workerTotalXp(a.level, a.xp) + workerTotalXp(b.level, b.xp)
  const progress = workerFromTotalXp(sumTotal)
  save.workers = save.workers.filter((w) => w.id !== a.id && w.id !== b.id)
  const worker = spawnWorkerWith(save, nextTier, classId, keptAttrs)
  worker.race = race
  worker.name = givenName
  worker.level = progress.level
  worker.xp = progress.xp
  fillWorkerHp(worker, undefined, save)
  worker.assignment = null
  const quality = workerQualityDef(nextTier)
  const job = worker.classId ? CLASS_LABEL[worker.classId] : '未标'
  save.fuseDragTipDone = true
  return { ok: true, message: `合成出${worker.name ?? worker.id}（${quality.label}·${job}）` }
}

export function hydrateFuseDragTip(save: Save): void {
  save.fuseDragTipDone = save.fuseDragTipDone === true
}

function fusePairReady(a: Worker | undefined, b: Worker | undefined): ActionResult | null {
  if (!a || !b) return { ok: false, reason: '没有这个苦工' }
  if (a.id === b.id) return { ok: false, reason: '不能合成同一个人' }
  if (a.qualityTier !== b.qualityTier) return { ok: false, reason: '品质不同，不能合成' }
  if (a.qualityTier >= QUALITY_MAX) return { ok: false, reason: '已是最高品质' }
  return null
}

function campOnly(a: Worker, b: Worker): ActionResult | null {
  if (a.assignment != null || b.assignment != null) return { ok: false, reason: CAMP_FUSE_ONLY_REASON }
  return null
}

function fieldBlock(save: Save, a: Worker, b: Worker): ActionResult | null {
  if (isWorkerInHerbPvp(save, a.id) || isWorkerInHerbPvp(save, b.id)) return { ok: false, reason: '正在割草' }
  if (isWorkerInBeastPvp(save, a.id) || isWorkerInBeastPvp(save, b.id)) return { ok: false, reason: '正在困兽' }
  return null
}

/** 两人都在营地、同档、未满档。消耗两人，产出 1 个高一档新人，留在营地。 */
export function fuseWorkers(save: Save, workerIdA: string, workerIdB: string): ActionResult {
  if (!workerIdA || !workerIdB) return { ok: false, reason: '请选两个同品质苦工' }
  if (workerIdA === workerIdB) return { ok: false, reason: '不能合成同一个人' }
  const a = findWorker(save, workerIdA)
  const b = findWorker(save, workerIdB)
  const ready = fusePairReady(a, b)
  if (ready || !a || !b) return ready ?? { ok: false, reason: '没有这个苦工' }
  const camp = campOnly(a, b)
  if (camp) return camp
  const field = fieldBlock(save, a, b)
  if (field) return field
  return fusePairAt(save, a, b)
}

/** 两人都在营地、同档、未满档，且不在割草或困兽。 */
export function canFuseRestWorkers(save: Save, workerIdA: string, workerIdB: string): boolean {
  if (!workerIdA || !workerIdB || workerIdA === workerIdB) return false
  const a = findWorker(save, workerIdA)
  const b = findWorker(save, workerIdB)
  if (!a || !b) return false
  if (campOnly(a, b) || fieldBlock(save, a, b)) return false
  return fusePairReady(a, b) == null
}

/** 营地同档合成。新人留在营地。有人在岗则拒绝。 */
export function fuseRestWorkers(save: Save, workerIdA: string, workerIdB: string): ActionResult {
  return fuseWorkers(save, workerIdA, workerIdB)
}
