import { addToBank, bankQty, takeFromBank } from './bank'
import { pushLot, type ItemLot } from './gains'
import { roll01 } from './rng'
import { selectedCategoryDef } from './stationProgress'
import {
  asMiningCategoryId,
  findCategory,
  HERBALISM_DROP_TABLE,
  HUNTING_HAZARD_CONSUME,
  HUNTING_HAZARD_PAUSE_S,
  HUNTING_SIDE_DROP_TABLE,
  huntingPreyByCategory,
  ITEM_DEF,
  miningNodeDef,
  MINING_NODE_DEF,
  type HuntingSideDropWeight,
  type IoRule,
  type MiningCategoryId,
} from './tables'
import { miningOutputMul, scaleQtyByMul } from './tech'
import { cycleOutputBonus } from './tools'
import type {
  CategoryId,
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

export function resolveHuntingSideDrop(roll: number): ItemId | null {
  const row = pickWeighted(HUNTING_SIDE_DROP_TABLE as HuntingSideDropWeight[], roll)
  return row.itemId
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
  return stationId === 'mining' || stationId === 'herbalism' || stationId === 'hunting'
}

export function isGatherFrozen(save: Save, stationId: StationId): boolean {
  if (stationId === 'mining') return isMiningNodeRecovering(save.stations.mining.miningNode, save.elapsedS)
  if (stationId === 'hunting') return isHuntingPaused(save)
  return false
}

export function expectedGatherItemsPerSecond(stationId: StationId, categoryId: CategoryId): number {
  const cat = findCategory(stationId, categoryId)
  if (!cat || cat.cycleS <= 0) return 0
  if (stationId === 'hunting') {
    const prey = huntingPreyByCategory(categoryId)
    const qty = prey.outputs.reduce((sum, io) => sum + io.qty, 0)
    const sideTotal = HUNTING_SIDE_DROP_TABLE.reduce((sum, row) => sum + row.weight, 0)
    const sideQty =
      sideTotal > 0
        ? HUNTING_SIDE_DROP_TABLE.reduce((sum, row) => sum + (row.itemId ? row.weight : 0), 0) / sideTotal
        : 0
    return ((1 - prey.hazardChance) * (qty + sideQty)) / cat.cycleS
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

function emitRules(
  save: Save,
  stationId: StationId,
  rules: IoRule[],
  now: number,
  into?: ItemLot[],
): boolean {
  const bonus = cycleOutputBonus(save, stationId, now)
  const techMul = stationId === 'mining' ? miningOutputMul(save) : 1
  for (const io of rules) {
    const raw = io.qty + (io === rules[0] ? bonus : 0)
    const qty = stationId === 'mining' ? scaleQtyByMul(save, raw, techMul) : raw
    const added = addToBank(save, io.itemId, qty)
    if (!added.ok) return false
    pushLot(into, io.itemId, qty)
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
/** 狩猎真战斗本轮不做（TODO）；现遇险扣血接到劳损，不另开战斗。 */
export function applyGatherOutputs(
  save: Save,
  stationId: StationId,
  now = Date.now(),
  into?: ItemLot[],
): boolean {
  if (stationId === 'mining') return completeMiningCycle(save, now, into)
  if (stationId === 'herbalism') return completeHerbalismCycle(save, now, into)
  if (stationId === 'hunting') return completeHuntingCycle(save, now, into)
  return false
}

function completeMiningCycle(save: Save, now: number, into?: ItemLot[]): boolean {
  applyMiningRecovery(save)
  const station = save.stations.mining
  const node = station.miningNode
  if (!node || isMiningNodeRecovering(node, save.elapsedS)) return false
  const cat = selectedCategoryDef(save, 'mining')
  if (!emitRules(save, 'mining', cat.outputs, now, into)) return false
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

function completeHerbalismCycle(save: Save, now: number, into?: ItemLot[]): boolean {
  const itemId = resolveHerbalismDrop(roll01(save))
  if (!emitRules(save, 'herbalism', [{ itemId, qty: 1 }], now, into)) return false
  save.stations.herbalism.gatherNotice = `采到${ITEM_DEF[itemId].label}`
  return true
}

function completeHuntingCycle(save: Save, now: number, into?: ItemLot[]): boolean {
  const prey = huntingPreyByCategory(save.stations.hunting.selectedCategory)
  const hazard = resolveHazard(prey.hazardChance, roll01(save))
  if (hazard.outcome === 'hazard') {
    // TODO: 狩猎真战斗不做；现遇险无即时掉血，劳损由 completeCycle 按 hazard 写入。
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
  const extra = resolveHuntingSideDrop(roll01(save))
  const outputs = extra ? [...prey.outputs, { itemId: extra, qty: 1 }] : prey.outputs
  if (!emitRules(save, 'hunting', outputs, now, into)) return false
  save.stations.hunting.gatherNotice = extra
    ? `安全捕获 · ${prey.label}，顺手${ITEM_DEF[extra].label}`
    : `安全捕获 · ${prey.label}`
  return true
}
