import { canAffordCosts, missingCostLabels } from './costs'
import { workshopBuffMul } from './encounters'
import { isGatherFrozen, isMiningNodeRecovering } from './gather'
import { selectedCategoryDef } from './stationProgress'
import { ITEM_DEF, miningNodeDef, STATION_DEF, STATION_IDS, stationSpeed } from './tables'
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

export function currentSpeed(save: Save, stationId: StationId, now = Date.now()): number {
  if (isGatherFrozen(save, stationId)) return 0
  const cat = selectedCategoryDef(save, stationId)
  const base = stationSpeed(assignedCount(save, stationId), cat.cycleS, stationResonating(save, stationId))
  return base * workshopBuffMul(save, now)
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
  if (def.costs.length === 0) return { kind: 'none' }
  if (canAffordCosts(save, def.costs)) return { kind: 'primary' }
  if (def.altCosts && canAffordCosts(save, def.altCosts)) return { kind: 'alt' }
  return null
}

function needLabel(save: Save, stationId: StationId): string {
  const def = selectedCategoryDef(save, stationId)
  const primary = missingCostLabels(save, def.costs)
  if (primary.length) return primary.join('、')
  if (def.altCosts) {
    const alt = missingCostLabels(save, def.altCosts)
    if (alt.length) return alt.join('、')
  }
  return '原料'
}

export function canConsume(save: Save, stationId: StationId): boolean {
  return pickConsume(save, stationId) !== null
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
    } else if (id === 'mining' && isMiningNodeRecovering(station.miningNode, save.elapsedS)) {
      const oreId = miningNodeDef(station.selectedCategory).categoryId
      const label = oreId === 'iron' ? ITEM_DEF.ironOre.label : oreId === 'mithril' ? ITEM_DEF.mithrilOre.label : ITEM_DEF.ore.label
      hints.push({ kind: 'bottleneck', text: `${label}恢复中：可换其它已解锁矿` })
    } else if (id === 'hunting' && isGatherFrozen(save, id)) {
      hints.push({ kind: 'bottleneck', text: '狩猎遇险：短暂停手' })
    }
  }
  for (const pair of resonancePairs(save)) {
    hints.push({
      kind: 'resonance',
      text: `${STATION_DEF[pair.a].label} + ${STATION_DEF[pair.b].label} 工坊共振`,
    })
  }
  return hints
}
