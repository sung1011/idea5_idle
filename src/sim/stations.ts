import { addToBank } from './bank'
import { takeCosts } from './costs'
import { assignedCount, canConsume, canProduce, pickConsume, stationResonating } from './query'
import { grantStationXp, selectedCategoryDef } from './stationProgress'
import { RESONANCE_BONUS_EVERY, stationSpeed } from './tables'
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

function emitOutputs(save: Save, stationId: StationId, extra: boolean): boolean {
  const def = selectedCategoryDef(save, stationId)
  const bonus = extra ? 1 : 0
  for (const io of def.outputs) {
    const added = addToBank(save, io.itemId, io.qty + (io === def.outputs[0] ? bonus : 0))
    if (!added.ok) return false
  }
  if (extra && stationId === 'forging') {
    addToBank(save, 'blueprint', 1)
  }
  return true
}

/** 完成一次吞吐：按当前品类扣原料、写入银行，并给站 XP。共振满 streak 时额外产出。 */
export function completeCycle(save: Save, stationId: StationId): boolean {
  if (!canConsume(save, stationId) || !canProduce(save, stationId)) return false
  if (!consumeInputs(save, stationId)) return false
  const station = save.stations[stationId]
  const resonating = stationResonating(save, stationId)
  if (resonating) station.resonanceStreak += 1
  else station.resonanceStreak = 0
  const extra = resonating && station.resonanceStreak % RESONANCE_BONUS_EVERY === 0
  if (!emitOutputs(save, stationId, extra)) return false
  station.completed += 1
  grantStationXp(save, stationId, selectedCategoryDef(save, stationId).xpPerCycle)
  return true
}

export function stepStation(save: Save, stationId: StationId): void {
  const station = save.stations[stationId]
  const n = assignedCount(save, stationId)
  if (n <= 0) {
    station.stallReason = null
    return
  }
  if (!canConsume(save, stationId)) {
    station.stallReason = 'emptyInput'
    return
  }
  if (!canProduce(save, stationId)) {
    station.stallReason = 'fullOutput'
    return
  }

  station.stallReason = null
  const cat = selectedCategoryDef(save, stationId)
  const speed = stationSpeed(n, cat.cycleS, stationResonating(save, stationId))
  station.progress += speed

  while (station.progress + CYCLE_EPS >= 1) {
    if (!canConsume(save, stationId) || !canProduce(save, stationId)) {
      station.stallReason = !canConsume(save, stationId) ? 'emptyInput' : 'fullOutput'
      break
    }
    if (!completeCycle(save, stationId)) break
    station.progress -= 1
    if (Math.abs(station.progress) < CYCLE_EPS) station.progress = 0
  }
}
