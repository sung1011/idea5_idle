import { isWorkerInBeastPvp } from './beastPvpQuery'
import { isWorkerInHerbPvp } from './herbPvpQuery'
import { fillWorkerHp } from './combat'
import { starterGuideFuseAttr } from './encounters'
import { sendWorkerToRestTail, unloadFood } from './food'
import { clearWorkerNew, findWorker, spawnWorkerWith } from './recruit'
import { workerFromTotalXp, workerTotalXp } from './workerLevel'
import { roll01 } from './rng'
import { CLASS_LABEL, classPoolForQuality, pickClassFromPool, QUALITY_MAX, workerQualityDef } from './tables'
import { rollWorkerName, rollWorkerRace } from './workerRace'
import { applyFuseRaceUnlocks } from './workerRaceUnlock'
import type { ActionResult, QualityTier, Save, Worker } from './types'

/**
 * 同阶合成大成功：保底先升一阶，再按原料档掷一次，中了结果再高一阶。
 * 品质 1～10 为白、绿、蓝、青、紫、橙、粉、红、金、彩。十档对不齐四段，按下表：
 * - 最低两档 白、绿（1、2）→ 12%
 * - 中间 蓝、青、紫、橙（3～6）→ 8%
 * - 接近满品 粉、红（7、8）→ 3%（再跳落到金或彩）
 * - 金（9）保底已是彩，无法再高 → 不掷
 * - 彩（10）满品，合成本身会被拒绝
 */
export const FUSE_JACKPOT_RATE_LOW = 0.12
export const FUSE_JACKPOT_RATE_MID = 0.08
export const FUSE_JACKPOT_RATE_HIGH = 0.03

export const FUSE_JACKPOT_RATE_BY_TIER: Record<QualityTier, number | null> = {
  1: FUSE_JACKPOT_RATE_LOW,
  2: FUSE_JACKPOT_RATE_LOW,
  3: FUSE_JACKPOT_RATE_MID,
  4: FUSE_JACKPOT_RATE_MID,
  5: FUSE_JACKPOT_RATE_MID,
  6: FUSE_JACKPOT_RATE_MID,
  7: FUSE_JACKPOT_RATE_HIGH,
  8: FUSE_JACKPOT_RATE_HIGH,
  9: null,
  10: null,
}

/** 原料档的大成功概率。保底升一阶后已到顶则 null，调用方不再掷。 */
export function fuseJackpotRate(sourceTier: QualityTier): number | null {
  if (sourceTier + 1 >= QUALITY_MAX) return null
  return FUSE_JACKPOT_RATE_BY_TIER[sourceTier]
}

function rolledFuseTier(save: Save, sourceTier: QualityTier): { tier: QualityTier; jackpot: boolean } {
  const next = (sourceTier + 1) as QualityTier
  const rate = fuseJackpotRate(sourceTier)
  if (rate == null || roll01(save) >= rate) return { tier: next, jackpot: false }
  return { tier: (next + 1) as QualityTier, jackpot: true }
}

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
  const rolled = rolledFuseTier(save, a.qualityTier)
  const nextTier = rolled.tier
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
  applyFuseRaceUnlocks(save, race, nextTier)
  worker.level = progress.level
  worker.xp = progress.xp
  fillWorkerHp(worker, undefined, save)
  worker.assignment = null
  sendWorkerToRestTail(save, worker.id)
  const quality = workerQualityDef(nextTier)
  const job = worker.classId ? CLASS_LABEL[worker.classId] : '未标'
  save.fuseDragTipDone = true
  return {
    ok: true,
    message: `合成出${worker.name ?? worker.id}（${quality.label}·${job}）`,
    ...(rolled.jackpot ? { fuseJackpot: true } : {}),
  }
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

/** 两人都在营地、同档、未满档。消耗两人，产出 1 个至少高一档的新人，排到营地队尾。大成功再高一档。 */
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

/** 营地同档合成。新人留在营地队尾。有人在岗则拒绝。 */
export function fuseRestWorkers(save: Save, workerIdA: string, workerIdB: string): ActionResult {
  return fuseWorkers(save, workerIdA, workerIdB)
}
