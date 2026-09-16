import { addToBank } from './bank'
import { takeCosts } from './costs'
import { completeForgingCycle } from './forging'
import { applyGatherOutputs, applyHuntingPauseTick, applyMiningRecovery, isGatherFrozen, isGatherStation } from './gather'
import { assignedCount, canConsume, currentSpeed, pickConsume, stationResonating } from './query'
import { grantStationXp, selectedCategoryDef } from './stationProgress'
import { RESONANCE_BONUS_EVERY } from './tables'
import { cycleOutputBonus } from './tools'
import type { Save, StationId } from './types'

/** 1/6、1/7 这类 cycle 累加会卡在 0.999…，差一丁点到 1。 */
const CYCLE_EPS = 1e-9

function consumeInputs(save: Save, stationId: StationId): boolean {
  const pick = pickConsume(save, stationId)
  if (!pick) return false
  const def = selectedCategoryDef(save, stationId)
  const rules = pick.kind === 'alt' ? (def.altCosts ?? []) : def.costs
  return takeCosts(save, rules).ok
}

function emitOutputs(save: Save, stationId: StationId, extra: boolean, now: number): boolean {
  const def = selectedCategoryDef(save, stationId)
  const bonus = cycleOutputBonus(save, stationId, extra, now)
  for (const io of def.outputs) {
    const added = addToBank(save, io.itemId, io.qty + (io === def.outputs[0] ? bonus : 0))
    if (!added.ok) return false
  }
  if (extra && stationId === 'forging') {
    addToBank(save, 'blueprint', 1)
  }
  return true
}

/** 完成一次吞吐：按当前品类扣原料、写入物资，并给站 XP。共振满 streak 时额外产出。 */
export function completeCycle(save: Save, stationId: StationId, now = Date.now()): boolean {
  if (!canConsume(save, stationId)) return false
  if (stationId === 'forging') return completeForgingCycle(save, now)
  if (!consumeInputs(save, stationId)) return false
  const station = save.stations[stationId]
  const resonating = stationResonating(save, stationId)
  if (resonating) station.resonanceStreak += 1
  else station.resonanceStreak = 0
  const extra = resonating && station.resonanceStreak % RESONANCE_BONUS_EVERY === 0
  if (isGatherStation(stationId)) {
    if (!applyGatherOutputs(save, stationId, extra, now)) return false
  } else if (!emitOutputs(save, stationId, extra, now)) {
    return false
  }
  station.completed += 1
  grantStationXp(save, stationId, selectedCategoryDef(save, stationId).xpPerCycle)
  return true
}

export function stepStation(save: Save, stationId: StationId, now = Date.now()): void {
  if (stationId === 'mining') applyMiningRecovery(save)
  if (stationId === 'hunting') applyHuntingPauseTick(save)

  const station = save.stations[stationId]
  const n = assignedCount(save, stationId)
  if (n <= 0) {
    station.stallReason = null
    return
  }
  if (isGatherFrozen(save, stationId)) {
    station.stallReason = null
    return
  }
  if (!canConsume(save, stationId)) {
    station.stallReason = 'emptyInput'
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
    if (!completeCycle(save, stationId, now)) break
    station.progress -= 1
    if (Math.abs(station.progress) < CYCLE_EPS) station.progress = 0
  }
}
