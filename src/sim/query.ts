import { assignedWorkers } from './assign'
import { isWorkerInCombat } from './combat'
import { itemQty } from './bank'
import { canAffordCosts, collapseCosts, missingCostLabels } from './costs'
import { workshopBuffMul } from './encounters'
import { isGatherFrozen, isMiningNodeRecovering } from './gather'
import { selectedCategoryDef } from './stationProgress'
import {
  ALCHEMY_COST_OPTIONS,
  ITEM_DEF,
  miningNodeDef,
  leftoverStockItems,
  STATION_DEF,
  STATION_IDS,
  stationSpeed,
  type IoRule,
} from './tables'
import { rushSpeedMul, stimSpeedMul } from './potions'
import {
  forgeCycleMul,
  groupStaffSpeedMul,
  knightCycleMul,
  slagCopperValue,
  soloStaffMul,
  stationConflictMul,
  stationTechSpeedMul,
  workshopRulesCycleMul,
} from './tech'
import { assignedToolWeight } from './tools'
import { inscriptionRecipes } from './tables'
import type { Hint, ItemId, Save, StationId } from './types'

export { assignedWorkers }

export function assignedCount(save: Save, stationId: StationId): number {
  return assignedWorkers(save, stationId).length
}

export function idleCount(save: Save): number {
  return save.workers.filter((w) => w.assignment === null && !isWorkerInCombat(save, w.id)).length
}

export function stationCycleS(save: Save, stationId: StationId): number {
  const cycleS = selectedCategoryDef(save, stationId).cycleS
  let mul = knightCycleMul(save) * workshopRulesCycleMul(save)
  if (stationId === 'inscription') mul *= forgeCycleMul(save)
  return Math.max(1, cycleS * mul)
}

export function currentSpeed(save: Save, stationId: StationId, now = Date.now()): number {
  if (isGatherFrozen(save, stationId)) return 0
  const weight = assignedToolWeight(save, stationId, now)
  const base = stationSpeed(weight, stationCycleS(save, stationId))
  return (
    base *
    workshopBuffMul(save, now) *
    stationTechSpeedMul(save, stationId) *
    stationConflictMul(save, stationId) *
    stimSpeedMul(save) *
    rushSpeedMul(save, stationId) *
    soloStaffMul(save, stationId) *
    groupStaffSpeedMul(save, stationId)
  )
}

export type ConsumePick = { kind: 'none' | 'primary' | 'alt'; rules: IoRule[] }

/** 当前站可扣的配方组。炼金走草 / 猎副产表，铭刻走已解锁符文成本，其它站 costs + 可选 altCosts。 */
export function consumeRuleSets(save: Save, stationId: StationId): IoRule[][] {
  if (stationId === 'alchemy') return ALCHEMY_COST_OPTIONS
  if (stationId === 'inscription') {
    const recipes = inscriptionRecipes(save.stations.inscription?.stationLevel ?? 1)
    const sets: IoRule[][] = []
    for (const recipe of recipes) {
      if (!sets.some((rules) => sameCostSet(rules, recipe.costs))) sets.push(recipe.costs)
    }
    return sets
  }
  const def = selectedCategoryDef(save, stationId)
  const sets: IoRule[][] = [def.costs]
  if (def.altCosts?.length) sets.push(def.altCosts)
  const slagSet = slagCopperCostSet(save, def.costs)
  if (slagSet && !sets.some((rules) => sameCostSet(rules, slagSet))) sets.push(slagSet)
  return sets
}

function sameCostSet(a: IoRule[], b: IoRule[]): boolean {
  if (a.length !== b.length) return false
  return a.every((io, i) => io.itemId === b[i]?.itemId && io.qty === b[i]?.qty)
}

/** 渣滓回炉：把铜矿按 0.5 铜等价换成渣滓（2 渣滓 = 1 铜矿）。 */
export function slagCopperCostSet(save: Save, rules: IoRule[]): IoRule[] | null {
  const value = slagCopperValue(save)
  if (value <= 0) return null
  if (!rules.some((io) => io.itemId === 'ore')) return null
  return rules.map((io) =>
    io.itemId === 'ore' ? { itemId: 'slag', qty: Math.max(1, Math.ceil(io.qty / value)) } : io,
  )
}

export function pickConsume(save: Save, stationId: StationId): ConsumePick | null {
  const sets = consumeRuleSets(save, stationId)
  if (sets.length === 0) return null
  if (sets.length === 1 && sets[0].length === 0) return { kind: 'none', rules: [] }
  for (let i = 0; i < sets.length; i++) {
    const rules = sets[i]
    if (rules.length === 0) return { kind: 'none', rules }
    if (canAffordCosts(save, rules)) return { kind: i === 0 ? 'primary' : 'alt', rules }
  }
  return null
}

export function needLabel(save: Save, stationId: StationId): string {
  if (stationId === 'inscription' && !inscriptionRecipes(save.stations.inscription?.stationLevel ?? 1).length) {
    return '未解锁符文'
  }
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
    if (stationId === 'inscription' && !inscriptionRecipes(station.stationLevel).length) {
      return `未解锁符文：${STATION_DEF.inscription.label}空转`
    }
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
}

export type StationConsumeToken = {
  itemId: ItemId
  label: string
  need: number
  have: number
  short: boolean
}

/** 工坊「消耗」行：配方组之间用 /，组内物品带 ×需求 / 拥有，缺的标 short。 */
export function stationConsumeGroups(save: Save, stationId: StationId): StationConsumeToken[][] {
  return consumeRuleSets(save, stationId)
    .map((rules) =>
      collapseCosts(rules).map((io) => {
        const have = itemQty(save, io.itemId)
        return {
          itemId: io.itemId,
          label: ITEM_DEF[io.itemId].label,
          need: io.qty,
          have,
          short: have < io.qty,
        }
      }),
    )
    .filter((group) => group.length > 0)
}

function currentConsumeItemIds(save: Save, stationId: StationId): ItemId[] {
  const ids: ItemId[] = []
  const push = (itemId: ItemId) => {
    if (!ids.includes(itemId)) ids.push(itemId)
  }
  if (stationId === 'alchemy') {
    const pick = pickConsume(save, stationId)
    if (!pick || pick.kind === 'none') return []
    for (const io of pick.rules) push(io.itemId)
    return ids
  }
  for (const rules of consumeRuleSets(save, stationId)) {
    for (const io of rules) push(io.itemId)
  }
  return ids
}

/** 工坊卡片「消耗库存」：只列当前这次制造会扣的物品。采集无消耗则空。 */
export function stationStockRows(save: Save, stationId: StationId): {
  costs: StationStockRow[]
} {
  return {
    costs: currentConsumeItemIds(save, stationId).map((itemId) => ({
      itemId,
      label: ITEM_DEF[itemId].label,
      qty: itemQty(save, itemId),
    })),
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
  return hints
}
