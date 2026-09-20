import { alchemyCostLabel } from './alchemy'
import { addToBank } from './bank'
import { takeCosts } from './costs'
import { completeForgingCycle } from './forging'
import { applyGatherOutputs, applyHuntingPauseTick, applyMiningRecovery, isGatherFrozen, isGatherStation } from './gather'
import { craftGoldForLots, emitGain, mergeLots, pushLot, type GainSink, type ItemLot } from './gains'
import { tryAutoEatAssigned } from './food'
import { applyWorkshopFatigue, decayAlchemyFog, workshopHpWorkMul, type FatigueKind } from './workshopHp'
import { assignedCount, canConsume, currentSpeed, pickConsume } from './query'
import { grantStationXp, selectedCategoryDef } from './stationProgress'
import { ITEM_DEF, isPotionItemId } from './tables'
import { consumeSelectedStationTool, cycleOutputBonus, sanitizeForgeSelection } from './tools'
import type { Save, StationId } from './types'

/** 1/6、1/7 这类 cycle 累加会卡在 0.999…，差一丁点到 1。 */
const CYCLE_EPS = 1e-9

function consumeInputs(save: Save, stationId: StationId): boolean {
  const pick = pickConsume(save, stationId)
  if (!pick) return false
  return takeCosts(save, pick.rules).ok
}

function completeAlchemyCycle(save: Save, now: number, into?: ItemLot[]): boolean {
  const pick = pickConsume(save, 'alchemy')
  if (!pick) return false
  if (!takeCosts(save, pick.rules).ok) return false
  const station = save.stations.alchemy
  const def = selectedCategoryDef(save, 'alchemy')
  const bonus = cycleOutputBonus(save, 'alchemy', now)
  for (const io of def.outputs) {
    const qty = io.qty + (io === def.outputs[0] ? bonus : 0)
    if (!addToBank(save, io.itemId, qty).ok) return false
    pushLot(into, io.itemId, qty)
  }
  station.completed += 1
  grantStationXp(save, 'alchemy', def.xpPerCycle)
  const out = def.outputs[0]
  const made = out && isPotionItemId(out.itemId) ? '药剂' : out ? ITEM_DEF[out.itemId].label : '成品'
  station.craftNotice = `炼成${made}（耗${alchemyCostLabel(pick.rules)}）`
  return true
}

function emitOutputs(save: Save, stationId: StationId, now: number, into?: ItemLot[]): boolean {
  const def = selectedCategoryDef(save, stationId)
  const bonus = cycleOutputBonus(save, stationId, now)
  for (const io of def.outputs) {
    const qty = io.qty + (io === def.outputs[0] ? bonus : 0)
    const added = addToBank(save, io.itemId, qty)
    if (!added.ok) return false
    pushLot(into, io.itemId, qty)
  }
  return true
}

/** 完成一次吞吐：按当前品类扣原料、写入物资，并给站 XP。回调带 stationId；无产出也可带站内 notice。 */
export function completeCycle(
  save: Save,
  stationId: StationId,
  now = Date.now(),
  onGain?: GainSink,
): boolean {
  if (!canConsume(save, stationId)) return false
  const lots: ItemLot[] = []
  if (stationId === 'forging') {
    const ok = completeForgingCycle(save, now, lots)
    if (ok) {
      consumeSelectedStationTool(save, stationId)
      const fatigue: FatigueKind = lots.length > 0 ? 'success' : 'softFail'
      emitCycleGain(save, stationId, lots, onGain, now, fatigue)
    }
    return ok
  }
  if (stationId === 'alchemy') {
    const ok = completeAlchemyCycle(save, now, lots)
    if (ok) {
      consumeSelectedStationTool(save, stationId)
      emitCycleGain(save, stationId, lots, onGain, now, 'success')
    }
    return ok
  }
  if (!consumeInputs(save, stationId)) return false
  const station = save.stations[stationId]
  if (isGatherStation(stationId)) {
    if (!applyGatherOutputs(save, stationId, now, lots)) return false
  } else if (!emitOutputs(save, stationId, now, lots)) {
    return false
  }
  station.completed += 1
  grantStationXp(save, stationId, selectedCategoryDef(save, stationId).xpPerCycle)
  consumeSelectedStationTool(save, stationId)
  emitCycleGain(save, stationId, lots, onGain, now, gatherFatigueKind(stationId, lots, station.gatherNotice))
  return true
}

function gatherFatigueKind(stationId: StationId, lots: ItemLot[], notice: string | null | undefined): FatigueKind {
  if (stationId === 'fishing' && notice === '空杆') return 'emptyRod'
  if (stationId === 'hunting' && (notice ?? '').includes('遇险')) return 'hazard'
  if (lots.length > 0) return 'success'
  return 'none'
}

function grantCycleCraftGold(save: Save, lots: ItemLot[]): number {
  const gold = craftGoldForLots(lots)
  if (gold > 0) save.gold += gold
  return gold
}

function emitCycleGain(
  save: Save,
  stationId: StationId,
  lots: ItemLot[],
  onGain: GainSink | undefined,
  now: number,
  fatigue: FatigueKind,
): void {
  const gold = grantCycleCraftGold(save, lots)
  const station = save.stations[stationId]
  applyWorkshopFatigue(save, stationId, now, fatigue)
  tryAutoEatAssigned(save, stationId, now)
  const weak = save.workers.some((worker) => worker.assignment === stationId && workshopHpWorkMul(worker) < 1)
  emitGain(onGain, lots, stationId, station.gatherNotice ?? station.craftNotice ?? null, gold, weak)
}

export function stepStation(save: Save, stationId: StationId, now = Date.now(), onGain?: GainSink): void {
  if (stationId === 'mining') applyMiningRecovery(save)
  if (stationId === 'hunting') applyHuntingPauseTick(save)
  if (stationId === 'forging') sanitizeForgeSelection(save)

  const station = save.stations[stationId]
  const n = assignedCount(save, stationId)
  if (n <= 0) {
    station.progress = 0
    station.stallReason = null
    if (stationId === 'alchemy') decayAlchemyFog(save)
    return
  }
  if (isGatherFrozen(save, stationId)) {
    station.stallReason = null
    if (stationId === 'alchemy') decayAlchemyFog(save)
    return
  }
  if (!canConsume(save, stationId)) {
    station.stallReason = 'emptyInput'
    if (stationId === 'alchemy') decayAlchemyFog(save)
    return
  }

  station.stallReason = null
  const speed = currentSpeed(save, stationId, now)
  station.progress += speed

  while (station.progress + CYCLE_EPS >= 1) {
    if (!canConsume(save, stationId)) {
      station.stallReason = 'emptyInput'
      break
    }
    if (!completeCycle(save, stationId, now, onGain)) break
    station.progress -= 1
    if (Math.abs(station.progress) < CYCLE_EPS) station.progress = 0
  }
}
