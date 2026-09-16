import { bankQty, bankRoom } from './bank'
import { selectedCategoryDef } from './stationProgress'
import { ITEM_DEF, STATION_DEF, STATION_IDS, stationSpeed } from './tables'
import type { Hint, Save, StationId } from './types'

export function assignedCount(save: Save, stationId: StationId): number {
  return save.workers.filter((w) => w.assignment === stationId).length
}

export function idleCount(save: Save): number {
  return save.workers.filter((w) => w.assignment === null).length
}

export function isResonating(save: Save, a: StationId, b: StationId): boolean {
  const def = STATION_DEF[a]
  if (!def.neighbors.includes(b)) return false
  return assignedCount(save, a) > 0 && assignedCount(save, b) > 0
}

export function stationResonating(save: Save, stationId: StationId): boolean {
  return STATION_DEF[stationId].neighbors.some((n) => isResonating(save, stationId, n))
}

export function currentSpeed(save: Save, stationId: StationId): number {
  const cat = selectedCategoryDef(save, stationId)
  return stationSpeed(assignedCount(save, stationId), cat.cycleS, stationResonating(save, stationId))
}

export function resonancePairs(save: Save): Array<{ a: StationId; b: StationId }> {
  const seen = new Set<string>()
  const pairs: Array<{ a: StationId; b: StationId }> = []
  for (const id of STATION_IDS) {
    for (const n of STATION_DEF[id].neighbors) {
      const key = [id, n].sort().join('+')
      if (seen.has(key)) continue
      seen.add(key)
      if (isResonating(save, id, n)) pairs.push({ a: id, b: n })
    }
  }
  return pairs
}

export type ConsumePick = { kind: 'none' | 'primary' | 'alt' }

export function pickConsume(save: Save, stationId: StationId): ConsumePick | null {
  const def = selectedCategoryDef(save, stationId)
  if (def.inputs.length === 0) return { kind: 'none' }
  if (def.inputs.every((io) => bankQty(save, io.itemId) >= io.qty)) return { kind: 'primary' }
  if (def.altInputs && def.altInputs.every((io) => bankQty(save, io.itemId) >= io.qty)) {
    return { kind: 'alt' }
  }
  return null
}

function needLabel(save: Save, stationId: StationId): string {
  const def = selectedCategoryDef(save, stationId)
  const first = def.inputs[0] ?? def.altInputs?.[0]
  return first ? ITEM_DEF[first.itemId].label : '原料'
}

export function canConsume(save: Save, stationId: StationId): boolean {
  return pickConsume(save, stationId) !== null
}

export function canProduce(save: Save, stationId: StationId): boolean {
  return selectedCategoryDef(save, stationId).outputs.every((io) => bankRoom(save, io.itemId) >= io.qty)
}

export function collectHints(save: Save): Hint[] {
  const hints: Hint[] = []
  for (const id of STATION_IDS) {
    const station = save.stations[id]
    if (station.progressNotice) {
      hints.push({ kind: 'progress', text: station.progressNotice })
    }
    const n = assignedCount(save, id)
    if (n <= 0) continue
    const stall = station.stallReason
    if (stall === 'emptyInput') {
      hints.push({ kind: 'bottleneck', text: `${needLabel(save, id)}见底：${STATION_DEF[id].label}空转` })
    }
    if (stall === 'fullOutput') {
      const out = selectedCategoryDef(save, id).outputs[0]
      const label = out ? ITEM_DEF[out.itemId].label : '产物'
      hints.push({ kind: 'bottleneck', text: `${label}堆满：${STATION_DEF[id].label}停工` })
    }
  }
  for (const pair of resonancePairs(save)) {
    hints.push({
      kind: 'resonance',
      text: `${STATION_DEF[pair.a].label} + ${STATION_DEF[pair.b].label} 车间共振`,
    })
  }
  return hints
}
