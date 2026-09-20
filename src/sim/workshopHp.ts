import { stationEnrageFatigueMul } from './enrage'
import type { Save, StationFatigueCombo, StationId, Worker } from './types'

/** 每次成功产出写入的劳损比例。禁止再走 max(1, floor(hpMax*0.02))。 */
export const FATIGUE_DEBT_RATIO = 0.0015
/** 站基准乘子：把 0.0015 落到极缓日常（6h 裸采药仍 HP≥2）。 */
export const FATIGUE_STATION_MUL: Readonly<Record<StationId, number>> = {
  mining: 0.4,
  forging: 0.55,
  hunting: 0.4,
  cooking: 0.4,
  herbalism: 0.4,
  alchemy: 0.4,
  fishing: 0.4,
}
/** 6h 等价产出（裸效率单人周期次数）用此时长。 */
export const FATIGUE_SIX_HOUR_S = 6 * 3600
export const WORKSHOP_REST_HEAL_RATIO = 0.05
/** 残血：仅 HP===1 时贡献 ×0.5。 */
export const WORKSHOP_CRIT_HP = 1
export const WORKSHOP_CRIT_WORK_MUL = 0.5

export type FatigueKind = 'success' | 'softFail' | 'hazard' | 'emptyRod' | 'none'

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

/** 仅 HP===1 时 ×0.5，其余 ×1。 */
export function workshopHpWorkMul(worker: Worker): number {
  return worker.hp === WORKSHOP_CRIT_HP ? WORKSHOP_CRIT_WORK_MUL : 1
}

export function restHealAmount(hpMax: number): number {
  return Math.max(1, Math.floor(safeHpMax(hpMax) * WORKSHOP_REST_HEAL_RATIO))
}

export function equivalentCyclesIn(seconds: number, cycleS: number): number {
  if (!(cycleS > 0) || !(seconds > 0)) return 0
  return Math.floor(seconds / cycleS)
}

function kindMul(kind: FatigueKind): number {
  if (kind === 'softFail') return 0.35
  if (kind === 'hazard') return 0.5
  if (kind === 'emptyRod' || kind === 'none') return 0
  return 1
}

function comboOf(save: Save, stationId: StationId): StationFatigueCombo {
  const combo = save.stations[stationId].fatigueCombo
  if (!combo) {
    save.stations[stationId].fatigueCombo = blankFatigueCombo()
    return save.stations[stationId].fatigueCombo
  }
  return combo
}

/** 站内连招乘在劳损上，无跨站。 */
export function stationFatigueComboMul(save: Save, stationId: StationId, kind: FatigueKind): number {
  const combo = comboOf(save, stationId)
  if (stationId === 'herbalism') return 1 + 0.008 * Math.min(combo.streak, 25)
  if (stationId === 'cooking') {
    const same = 1 + 0.025 * Math.min(Math.max(0, combo.streak - 1), 12)
    const stew = combo.key === 'mithril' ? 1.25 : 1
    return same * stew
  }
  if (stationId === 'mining') return 1 + 0.02 * Math.min(combo.streak, 28)
  if (stationId === 'fishing') return 1 + 0.03 * Math.min(Math.max(0, combo.streak - 1), 15)
  if (stationId === 'forging') {
    if (kind === 'success') return 1.2 + combo.frustration * 0.12
    return 1
  }
  if (stationId === 'alchemy') return 1 + 0.06 * Math.min(combo.fog, 8)
  return 1
}

function noteCombo(save: Save, stationId: StationId, kind: FatigueKind): void {
  const combo = comboOf(save, stationId)
  const station = save.stations[stationId]
  if (stationId === 'herbalism') {
    if (kind === 'success') combo.streak += 1
    return
  }
  if (stationId === 'cooking') {
    if (kind !== 'success') return
    const dish = station.selectedCategory
    if (combo.key === dish) combo.streak += 1
    else {
      combo.key = dish
      combo.streak = 1
    }
    return
  }
  if (stationId === 'mining') {
    if (kind !== 'success') return
    const node = station.miningNode
    combo.streak = node ? Math.max(0, node.nodeHpMax - node.nodeHp) : combo.streak + 1
    return
  }
  if (stationId === 'fishing') {
    if (kind === 'emptyRod') {
      combo.streak = 0
      return
    }
    if (kind === 'success') combo.streak += 1
    return
  }
  if (stationId === 'forging') {
    if (kind === 'softFail') combo.frustration += 1
    return
  }
  if (stationId === 'alchemy' && kind === 'success') combo.fog = Math.min(12, combo.fog + 1)
}

function addDebt(worker: Worker, amount: number): void {
  if (!(amount > 0)) return
  worker.fatigueDebt = workerFatigueDebt(worker) + amount
  const drop = Math.floor(worker.fatigueDebt)
  if (drop < 1) return
  worker.hp = Math.max(1, worker.hp - drop)
  worker.fatigueDebt -= drop
}

function debtAmount(
  save: Save,
  worker: Worker,
  stationId: StationId,
  kind: FatigueKind,
  now: number,
  extraMul = 1,
): number {
  const comboMul = stationFatigueComboMul(save, stationId, kind)
  return (
    safeHpMax(worker.hpMax) *
    FATIGUE_DEBT_RATIO *
    FATIGUE_STATION_MUL[stationId] *
    comboMul *
    kindMul(kind) *
    stationEnrageFatigueMul(save, stationId, now) *
    extraMul
  )
}

function assignedOf(save: Save, stationId: StationId): Worker[] {
  return save.workers.filter((worker) => worker.assignment === stationId)
}

function markWeak(workers: Worker[]): boolean {
  return workers.some((worker) => workshopHpWorkMul(worker) < 1)
}

function miningJustEmptied(save: Save): boolean {
  const node = save.stations.mining.miningNode
  return !!node && node.nodeHp <= 0 && node.recoverAt != null
}

/** 单次成功产出的劳损增量（不含连招更新，comboMul 用当前层）。 */
export function fatigueDebtDelta(
  save: Save,
  worker: Worker,
  stationId: StationId,
  kind: FatigueKind,
  now: number,
): number {
  return debtAmount(save, worker, stationId, kind, now)
}

/**
 * 按产出结果写劳损。空转 / 空杆不扣。
 * 返回是否有人已虚弱（HP===1）。
 */
export function applyWorkshopFatigue(save: Save, stationId: StationId, now: number, kind: FatigueKind): boolean {
  const crew = assignedOf(save, stationId)
  if (kind === 'none') return markWeak(crew)
  noteCombo(save, stationId, kind)
  if (kind === 'emptyRod') return markWeak(crew)
  let weak = markWeak(crew)
  for (const worker of crew) {
    addDebt(worker, debtAmount(save, worker, stationId, kind, now))
    if (workshopHpWorkMul(worker) < 1) weak = true
  }
  if (stationId === 'mining' && kind === 'success' && miningJustEmptied(save)) {
    for (const worker of crew) {
      addDebt(worker, debtAmount(save, worker, stationId, kind, now, 1))
      if (workshopHpWorkMul(worker) < 1) weak = true
    }
  }
  if (stationId === 'forging' && kind === 'success') comboOf(save, 'forging').frustration = 0
  return weak
}

/** 旧名兼容：成功产出走劳损。 */
export function applyWorkshopCycleDrain(save: Save, stationId: StationId, now: number): boolean {
  return applyWorkshopFatigue(save, stationId, now, 'success')
}

/** 炼金停产：毒雾层缓慢衰减。 */
export function decayAlchemyFog(save: Save): void {
  const combo = comboOf(save, 'alchemy')
  if (combo.fog <= 0) return
  combo.fog = Math.max(0, combo.fog - 0.125)
}
