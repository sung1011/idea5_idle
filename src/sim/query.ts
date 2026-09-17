import { assignedWorkers } from './assign'
import { itemQty } from './bank'
import { canAffordCosts, missingCostLabels } from './costs'
import { workshopBuffMul } from './encounters'
import { isGatherFrozen, isMiningNodeRecovering } from './gather'
import { selectedCategoryDef } from './stationProgress'
import {
  ALCHEMY_COST_OPTIONS,
  categoryToFisheryTier,
  FISHING_DROP_TABLE,
  HERBALISM_DROP_TABLE,
  ITEM_DEF,
  miningNodeDef,
  leftoverStockItems,
  STATION_DEF,
  STATION_IDS,
  stationRelatedItems,
  stationSpeed,
  type IoRule,
} from './tables'
import { assignedToolWeight } from './tools'
import type { Hint, ItemId, Save, StationId } from './types'

export { assignedWorkers }

export function assignedCount(save: Save, stationId: StationId): number {
  return assignedWorkers(save, stationId).length
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

export type StationStockRow = {
  itemId: ItemId
  label: string
  qty: number
  role: 'cost' | 'output'
  current: boolean
}

function currentRelatedItemIds(save: Save, stationId: StationId): Set<ItemId> {
  const ids = new Set<ItemId>()
  for (const rules of consumeRuleSets(save, stationId)) {
    for (const io of rules) ids.add(io.itemId)
  }
  for (const io of selectedCategoryDef(save, stationId).outputs) ids.add(io.itemId)
  if (stationId === 'fishing') {
    const tier = categoryToFisheryTier(selectedCategoryDef(save, stationId).id)
    for (const row of FISHING_DROP_TABLE[tier]) {
      if (row.itemId) ids.add(row.itemId)
    }
  }
  if (stationId === 'herbalism') {
    for (const row of HERBALISM_DROP_TABLE) ids.add(row.itemId)
  }
  if (stationId === 'forging') ids.add('blueprint')
  return ids
}

/** 工坊卡片就近展示：该站 costs / outputs 对应的 bank 数量。 */
export function stationStockRows(save: Save, stationId: StationId): {
  costs: StationStockRow[]
  outputs: StationStockRow[]
} {
  const related = stationRelatedItems(stationId)
  const current = currentRelatedItemIds(save, stationId)
  const toRow = (itemId: ItemId, role: 'cost' | 'output'): StationStockRow => ({
    itemId,
    label: ITEM_DEF[itemId].label,
    qty: itemQty(save, itemId),
    role,
    current: current.has(itemId),
  })
  return {
    costs: related.costs.map((id) => toRow(id, 'cost')),
    outputs: related.outputs.map((id) => toRow(id, 'output')),
  }
}

/** 旧档木头 / 搁置武器等：只在有货时给工坊页脚看，不带卖货。 */
export function leftoverStockRows(save: Save): Array<{ itemId: ItemId; label: string; qty: number }> {
  return leftoverStockItems()
    .map((itemId) => ({ itemId, label: ITEM_DEF[itemId].label, qty: itemQty(save, itemId) }))
    .filter((row) => row.qty > 0)
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
