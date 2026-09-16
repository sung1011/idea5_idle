import { canAffordCosts, missingCostLabels } from './costs'
import { workshopBuffMul } from './encounters'
import { isGatherFrozen, isMiningNodeRecovering } from './gather'
import { selectedCategoryDef } from './stationProgress'
import {
  ALCHEMY_COST_OPTIONS,
  ITEM_DEF,
  miningNodeDef,
  STATION_DEF,
  STATION_IDS,
  stationSpeed,
  type IoRule,
} from './tables'
import { assignedToolWeight } from './tools'
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
  const weight = assignedToolWeight(save, stationId, now)
  const base = stationSpeed(weight, cat.cycleS, stationResonating(save, stationId))
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

export type ConsumePick = { kind: 'none' | 'primary' | 'alt'; rules: IoRule[] }

/** 当前站可扣的配方组。炼金走草 / 猎副产表，其它站 costs + 可选 altCosts。 */
export function consumeRuleSets(save: Save, stationId: StationId): IoRule[][] {
  if (stationId === 'alchemy') return ALCHEMY_COST_OPTIONS
  const def = selectedCategoryDef(save, stationId)
  const sets: IoRule[][] = [def.costs]
  if (def.altCosts?.length) sets.push(def.altCosts)
  return sets
}

export function pickConsume(save: Save, stationId: StationId): ConsumePick | null {
  const sets = consumeRuleSets(save, stationId)
  if (sets.length === 1 && sets[0].length === 0) return { kind: 'none', rules: [] }
  for (let i = 0; i < sets.length; i++) {
    const rules = sets[i]
    if (rules.length === 0) return { kind: 'none', rules }
    if (canAffordCosts(save, rules)) return { kind: i === 0 ? 'primary' : 'alt', rules }
  }
  return null
}

export function needLabel(save: Save, stationId: StationId): string {
  const labels = new Set<string>()
  for (const rules of consumeRuleSets(save, stationId)) {
    for (const label of missingCostLabels(save, rules)) labels.add(label)
  }
  if (labels.size) return [...labels].join(' / ')
  return '原料'
}

export function stationBottleneckText(save: Save, stationId: StationId): string | null {
  const station = save.stations[stationId]
  if (station.stallReason === 'emptyInput') {
    return `${needLabel(save, stationId)}见底：${STATION_DEF[stationId].label}空转`
  }
  if (stationId === 'mining' && isMiningNodeRecovering(station.miningNode, save.elapsedS)) {
    const oreId = miningNodeDef(station.selectedCategory).categoryId
    const label =
      oreId === 'iron' ? ITEM_DEF.ironOre.label : oreId === 'mithril' ? ITEM_DEF.mithrilOre.label : ITEM_DEF.ore.label
    return `${label}恢复中：可换其它已解锁矿`
  }
  if (stationId === 'hunting' && isGatherFrozen(save, stationId)) return '狩猎遇险：短暂停手'
  return null
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
    const stallText = stationBottleneckText(save, id)
    if (stallText) hints.push({ kind: 'bottleneck', text: stallText })
  }
  for (const pair of resonancePairs(save)) {
    hints.push({
      kind: 'resonance',
      text: `${STATION_DEF[pair.a].label} + ${STATION_DEF[pair.b].label} 工坊共振`,
    })
  }
  return hints
}
