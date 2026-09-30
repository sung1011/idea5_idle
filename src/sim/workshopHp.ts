import { offerRestFood } from './food'
import { campBandageHealAmount } from './tech'
import type { Save, StationFatigueCombo, StationId, Worker } from './types'

export const WORKSHOP_REST_HEAL_RATIO = 0.05
/** hp/hpMax ≤10%：空血，生产 ×0.5。 */
export const HP_EMPTY_RATIO = 0.1
/** hp/hpMax ≤30%：残血（含空血），生产 ×0.8。空血档优先，故 10%～30% 才是 ×0.8。 */
export const HP_WOUNDED_RATIO = 0.3
export const WORKSHOP_EMPTY_WORK_MUL = 0.5
export const WORKSHOP_WOUNDED_WORK_MUL = 0.8

export function blankFatigueCombo(): StationFatigueCombo {
  return { streak: 0, key: null, frustration: 0, fog: 0 }
}

function safeHpMax(hpMax: number): number {
  return Math.max(1, Math.floor(hpMax))
}

export function workerFatigueDebt(worker: Worker): number {
  return Number.isFinite(worker.fatigueDebt) ? Math.max(0, worker.fatigueDebt) : 0
}

export function workerHpRatio(worker: Worker): number {
  return worker.hp / safeHpMax(worker.hpMax)
}

/** 工人界面底色：整数 HP 再扣未入账劳损，成功吞吐立刻能看出缺口。 */
export function workerWearHp(worker: Worker): number {
  return Math.max(0, worker.hp - workerFatigueDebt(worker))
}

/** 工坊上岗满血：hp 不低于唯一上限，且没有未入账劳损。科技把上限抬高后，已顶到新上限的人不再被 `===` 挡在岗外。 */
export function isFullWorkshopHp(worker: Worker): boolean {
  return worker.hp >= worker.hpMax && workerFatigueDebt(worker) === 0
}

/**
 * 倒地 / 工坊力竭后的回血：HP≤0 先上绷带。
 * 伙食在进入休息后再吃。不走行军，不写入 returning。
 */
export function applyDownedRecovery(save: Save, worker: Worker, _now: number): void {
  if (worker.hp <= 0) {
    const heal = campBandageHealAmount(save, worker.hpMax)
    if (heal > 0) worker.hp = Math.min(worker.hpMax, worker.hp + heal)
  }
}

export function isEmptyHp(worker: Worker): boolean {
  return workerHpRatio(worker) <= HP_EMPTY_RATIO
}

/** 残血含空血：hp/hpMax ≤30%。 */
export function isWoundedHp(worker: Worker): boolean {
  return workerHpRatio(worker) <= HP_WOUNDED_RATIO
}

/** 空血 ×0.5 / 残血 ×0.8 / 其余 ×1。 */
export function workshopHpWorkMul(worker: Worker): number {
  const ratio = workerHpRatio(worker)
  if (ratio <= HP_EMPTY_RATIO) return WORKSHOP_EMPTY_WORK_MUL
  if (ratio <= HP_WOUNDED_RATIO) return WORKSHOP_WOUNDED_WORK_MUL
  return 1
}

/** 站卡效率：空岗 100%；两人取更低乘区。 */
export function stationHpWorkMul(save: Save, stationId: StationId): number {
  const crew = assignedOf(save, stationId)
  if (!crew.length) return 1
  return Math.min(...crew.map((worker) => workshopHpWorkMul(worker)))
}

export function stationHpEfficiencyLabel(mul: number): string {
  return `效率 ${Math.round(mul * 100)}%`
}

/** 站卡效率位按三位数预留（「效率 100%」或更高），50% / 100% 切换时宽度不变。 */
export const STATION_HP_EFFICIENCY_RESERVE = '效率 999%'

export const WORKSHOP_HP_EFFICIENCY_TIP =
  '苦工体力不足，工坊效率下降。营地选好伙食，残血回来会自动吃；紧急可用药剂。'

export function anyOnDutyHpEfficiencyDropped(save: Save): boolean {
  return save.workers.some((worker) => worker.assignment != null && workshopHpWorkMul(worker) < 1)
}

/** 账号首次在岗效率跌破 100% 时返回提示文案并落旗；已提示或仍满效率则 null。 */
export function takeWorkshopHpEfficiencyTip(save: Save): string | null {
  if (save.workshopHpEfficiencyTipShown) return null
  if (!anyOnDutyHpEfficiencyDropped(save)) return null
  save.workshopHpEfficiencyTipShown = true
  return WORKSHOP_HP_EFFICIENCY_TIP
}

export function hydrateWorkshopHpFields(save: Save): void {
  save.workshopHpEfficiencyTipShown = save.workshopHpEfficiencyTipShown === true
}

export function restHealAmount(hpMax: number): number {
  return Math.max(1, Math.floor(safeHpMax(hpMax) * WORKSHOP_REST_HEAL_RATIO))
}

function comboOf(save: Save, stationId: StationId): StationFatigueCombo {
  const combo = save.stations[stationId].fatigueCombo
  if (!combo) {
    save.stations[stationId].fatigueCombo = blankFatigueCombo()
    return save.stations[stationId].fatigueCombo
  }
  return combo
}

function addDebt(worker: Worker, amount: number): void {
  if (!(amount > 0)) return
  worker.fatigueDebt = workerFatigueDebt(worker) + amount
  const drop = Math.floor(worker.fatigueDebt)
  if (drop < 1) return
  worker.hp = Math.min(worker.hpMax, Math.max(0, worker.hp - drop))
  worker.fatigueDebt -= drop
}

/** HP 到 0：立刻回休息，清空岗进度，再绷带 + 自动吃饭。不行军。 */
export function releaseDeadWorker(save: Save, stationId: StationId, worker: Worker, now: number): void {
  if (worker.hp > 0 || worker.assignment !== stationId) return
  worker.assignment = null
  if (assignedOf(save, stationId).length <= 0) {
    const station = save.stations[stationId]
    station.progress = 0
    station.stallReason = null
    station.wearCredited = 0
    station.wearScareHit = false
  }
  applyDownedRecovery(save, worker, now)
  offerRestFood(save, worker.id, now)
}

/** 词条结算写劳损。猎人肉串护岗期间不加。到 0 立刻回营。 */
export function applyWorkerFatigue(save: Save, stationId: StationId, worker: Worker, amount: number, now: number): void {
  if (!(amount > 0) || worker.assignment !== stationId) return
  if (typeof worker.dutyGuardUntil === 'number' && save.elapsedS < worker.dutyGuardUntil) return
  addDebt(worker, amount)
  releaseDeadWorker(save, stationId, worker, now)
}

function assignedOf(save: Save, stationId: StationId): Worker[] {
  return save.workers.filter((worker) => worker.assignment === stationId)
}

/** 炼金停产：毒雾层缓慢衰减。旧档残留用，不再参与掉血。 */
export function decayAlchemyFog(save: Save): void {
  const combo = comboOf(save, 'alchemy')
  if (combo.fog <= 0) return
  combo.fog = Math.max(0, combo.fog - 0.125)
}
