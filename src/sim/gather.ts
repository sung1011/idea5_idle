import { addToBank, bankQty, takeFromBank } from './bank'
import { roll01 } from './rng'
import { selectedCategoryDef } from './stationProgress'
import {
  asMiningCategoryId,
  categoryToFisheryTier,
  FISHERY_TIER_RANK,
  FISHING_DROP_TABLE,
  findCategory,
  HERBALISM_DROP_TABLE,
  HUNTING_HAZARD_CONSUME,
  HUNTING_HAZARD_PAUSE_S,
  huntingPreyByCategory,
  ITEM_DEF,
  miningNodeDef,
  MINING_NODE_DEF,
  type FishingDropWeight,
  type IoRule,
  type MiningCategoryId,
} from './tables'
import { cycleOutputBonus } from './tools'
import type {
  CategoryId,
  FishingCatch,
  FisheryTier,
  HazardRoll,
  ItemId,
  MiningNodeState,
  Save,
  StationId,
} from './types'

export function pickWeighted<T extends { weight: number }>(rows: T[], roll: number): T {
  const live = rows.filter((row) => row.weight > 0)
  if (!live.length) throw new Error('empty weighted table')
  const total = live.reduce((sum, row) => sum + row.weight, 0)
  let cursor = Math.min(0.999999, Math.max(0, roll)) * total
  for (const row of live) {
    cursor -= row.weight
    if (cursor < 0) return row
  }
  return live[live.length - 1]
}

export function allowedFishingDrops(tier: FisheryTier): FishingDropWeight[] {
  const rank = FISHERY_TIER_RANK[tier]
  return FISHING_DROP_TABLE[tier].filter((row) => {
    if (row.outcome === 'empty') return row.weight > 0
    if (!row.catchTier) return row.weight > 0
    return row.weight > 0 && FISHERY_TIER_RANK[row.catchTier] <= rank
  })
}

export function resolveFishingCatch(tier: FisheryTier, roll: number): FishingCatch {
  const row = pickWeighted(allowedFishingDrops(tier), roll)
  if (row.outcome === 'empty') return { outcome: 'empty' }
  const catchTier =
    row.catchTier && FISHERY_TIER_RANK[row.catchTier] <= FISHERY_TIER_RANK[tier] ? row.catchTier : tier
  return { outcome: row.outcome, catchTier }
}

export function fishingCatchItem(catchResult: FishingCatch): ItemId | null {
  if (catchResult.outcome === 'fish') return 'fish'
  if (catchResult.outcome === 'junk') return 'junk'
  return null
}

export function resolveHerbalismDrop(roll: number): ItemId {
  const row = pickWeighted(HERBALISM_DROP_TABLE, roll)
  return row.itemId === 'spice' ? 'spice' : 'herb'
}

export function resolveHazard(chance: number, roll: number): HazardRoll {
  const safe = Math.min(0.99, Math.max(0, chance))
  return { chance: safe, outcome: roll < safe ? 'hazard' : 'ok' }
}

export function refreshMiningNode(node: MiningNodeState, elapsedS: number): MiningNodeState {
  if (node.recoverAt == null || elapsedS < node.recoverAt) return node
  return { ...node, nodeHp: node.nodeHpMax, recoverAt: null }
}

export function isMiningNodeRecovering(node: MiningNodeState | null | undefined, elapsedS: number): boolean {
  if (!node || node.recoverAt == null) return false
  return elapsedS < node.recoverAt
}

export function miningRecoverRemainS(node: MiningNodeState | null | undefined, elapsedS: number): number {
  if (!isMiningNodeRecovering(node, elapsedS)) return 0
  return Math.max(0, Math.ceil((node!.recoverAt ?? 0) - elapsedS))
}

export function isHuntingPaused(save: Save): boolean {
  const until = save.stations.hunting.gatherPauseUntil
  return typeof until === 'number' && save.elapsedS < until
}

export function isGatherStation(stationId: StationId): boolean {
  return stationId === 'mining' || stationId === 'fishing' || stationId === 'herbalism' || stationId === 'hunting'
}

export function isGatherFrozen(save: Save, stationId: StationId): boolean {
  if (stationId === 'mining') return isMiningNodeRecovering(save.stations.mining.miningNode, save.elapsedS)
  if (stationId === 'hunting') return isHuntingPaused(save)
  return false
}

export function expectedGatherItemsPerSecond(stationId: StationId, categoryId: CategoryId): number {
  const cat = findCategory(stationId, categoryId)
  if (!cat || cat.cycleS <= 0) return 0
  if (stationId === 'fishing') {
    const rows = allowedFishingDrops(categoryToFisheryTier(categoryId))
    const total = rows.reduce((sum, row) => sum + row.weight, 0)
    const items = rows.reduce((sum, row) => sum + (row.outcome === 'empty' ? 0 : row.weight), 0)
    return total > 0 ? items / total / cat.cycleS : 0
  }
  if (stationId === 'hunting') {
    const prey = huntingPreyByCategory(categoryId)
    const qty = prey.outputs.reduce((sum, io) => sum + io.qty, 0)
    return ((1 - prey.hazardChance) * qty) / cat.cycleS
  }
  if (stationId === 'herbalism') return 1 / cat.cycleS
  if (stationId === 'mining') {
    const node = miningNodeDef(categoryId)
    const mineS = node.nodeHpMax * cat.cycleS
    return node.nodeHpMax / (mineS + node.recoverS)
  }
  return cat.outputs.reduce((sum, io) => sum + io.qty, 0) / cat.cycleS
}

export function gatherStatusText(save: Save, stationId: StationId): string | null {
  const station = save.stations[stationId]
  if (stationId === 'mining') {
    const node = station.miningNode
    if (!node) return null
    if (isMiningNodeRecovering(node, save.elapsedS)) {
      const label = ITEM_DEF[miningOutputItem(node.categoryId)].label
      return `${label}恢复中 · 还剩 ${miningRecoverRemainS(node, save.elapsedS)}s · 可换其它矿`
    }
    return `矿脉 ${node.nodeHp}/${node.nodeHpMax}`
  }
  if (stationId === 'herbalism') return station.gatherNotice ?? '无限稳采 · 草/香料'
  if (stationId === 'hunting' && isHuntingPaused(save)) {
    return `遇险停手 · 还剩 ${Math.max(0, (station.gatherPauseUntil ?? save.elapsedS) - save.elapsedS)}s`
  }
  return station.gatherNotice ?? null
}

function miningOutputItem(categoryId: CategoryId): ItemId {
  if (categoryId === 'iron') return 'ironOre'
  if (categoryId === 'mithril') return 'mithrilOre'
  return 'ore'
}

function emitRules(save: Save, stationId: StationId, rules: IoRule[], extraMain: boolean): boolean {
  const bonus = cycleOutputBonus(save, stationId, extraMain)
  for (const io of rules) {
    const added = addToBank(save, io.itemId, io.qty + (io === rules[0] ? bonus : 0))
    if (!added.ok) return false
  }
  return true
}

export function applyMiningRecovery(save: Save): void {
  const station = save.stations.mining
  const nodes = station.miningNodes ?? {}
  for (const id of Object.keys(MINING_NODE_DEF) as MiningCategoryId[]) {
    const node = nodes[id]
    if (node) nodes[id] = refreshMiningNode(node, save.elapsedS)
  }
  const currentId = asMiningCategoryId(station.selectedCategory)
  const fallback: MiningNodeState = {
    categoryId: currentId,
    nodeHp: miningNodeDef(currentId).nodeHpMax,
    nodeHpMax: miningNodeDef(currentId).nodeHpMax,
    recoverAt: null,
  }
  const current = refreshMiningNode(nodes[currentId] ?? station.miningNode ?? fallback, save.elapsedS)
  nodes[currentId] = current
  station.miningNodes = nodes
  station.miningNode = current
}

export function applyHuntingPauseTick(save: Save): void {
  const station = save.stations.hunting
  if (station.gatherPauseUntil != null && save.elapsedS >= station.gatherPauseUntil) {
    station.gatherPauseUntil = null
  }
}

/** 写出采集产物 / 挖空 / 遇险。调用方再记 completed 与 XP。失败则整单作废。 */
export function applyGatherOutputs(save: Save, stationId: StationId, extra: boolean): boolean {
  if (stationId === 'mining') return completeMiningCycle(save, extra)
  if (stationId === 'fishing') return completeFishingCycle(save, extra)
  if (stationId === 'herbalism') return completeHerbalismCycle(save, extra)
  if (stationId === 'hunting') return completeHuntingCycle(save, extra)
  return false
}

function completeMiningCycle(save: Save, extra: boolean): boolean {
  applyMiningRecovery(save)
  const station = save.stations.mining
  const node = station.miningNode
  if (!node || isMiningNodeRecovering(node, save.elapsedS)) return false
  const cat = selectedCategoryDef(save, 'mining')
  if (!emitRules(save, 'mining', cat.outputs, extra)) return false
  node.nodeHp = Math.max(0, node.nodeHp - 1)
  const key = asMiningCategoryId(node.categoryId)
  if (node.nodeHp <= 0) {
    node.nodeHp = 0
    node.recoverAt = save.elapsedS + miningNodeDef(key).recoverS
    station.gatherNotice = `${ITEM_DEF[miningOutputItem(key)].label}挖空，恢复中`
  } else {
    station.gatherNotice = `矿脉 ${node.nodeHp}/${node.nodeHpMax}`
  }
  if (!station.miningNodes) station.miningNodes = {}
  station.miningNodes[key] = node
  station.miningNode = node
  return true
}

function completeFishingCycle(save: Save, extra: boolean): boolean {
  const tier = categoryToFisheryTier(save.stations.fishing.selectedCategory)
  const caught = resolveFishingCatch(tier, roll01(save))
  const itemId = fishingCatchItem(caught)
  if (!itemId) {
    save.stations.fishing.gatherNotice = '空杆'
    return true
  }
  if (!emitRules(save, 'fishing', [{ itemId, qty: 1 }], extra)) return false
  save.stations.fishing.gatherNotice = itemId === 'junk' ? '钓到杂物' : `钓到${ITEM_DEF.fish.label}`
  return true
}

function completeHerbalismCycle(save: Save, extra: boolean): boolean {
  const itemId = resolveHerbalismDrop(roll01(save))
  if (!emitRules(save, 'herbalism', [{ itemId, qty: 1 }], extra)) return false
  save.stations.herbalism.gatherNotice = `采到${ITEM_DEF[itemId].label}`
  return true
}

function completeHuntingCycle(save: Save, extra: boolean): boolean {
  const prey = huntingPreyByCategory(save.stations.hunting.selectedCategory)
  const hazard = resolveHazard(prey.hazardChance, roll01(save))
  if (hazard.outcome === 'hazard') {
    const station = save.stations.hunting
    station.gatherPauseUntil = save.elapsedS + HUNTING_HAZARD_PAUSE_S
    if (bankQty(save, HUNTING_HAZARD_CONSUME.itemId) >= HUNTING_HAZARD_CONSUME.qty) {
      takeFromBank(save, HUNTING_HAZARD_CONSUME.itemId, HUNTING_HAZARD_CONSUME.qty)
      station.gatherNotice = `遇险，短暂停手并耗${ITEM_DEF[HUNTING_HAZARD_CONSUME.itemId].label}`
    } else {
      station.gatherNotice = '遇险，短暂停手'
    }
    return true
  }
  if (!emitRules(save, 'hunting', prey.outputs, extra)) return false
  save.stations.hunting.gatherNotice = `安全捕获 · ${prey.label}`
  return true
}
