import { assignedWorkers, assignWorker, restingWorkers } from './assign'
import { addToBank } from './bank'
import { offerRestFood } from './food'
import { isModuleUnlocked } from './moduleUnlock'
import { isStationUnlocked, stationLockedTip } from './stationUnlock'
import { STATION_ORDER } from './tables'
import type { ActionResult, Save, StationId } from './types'
import type { ItemLot } from './gains'
import { isFullWorkshopHp } from './workshopHp'

/** 手动站最多排 5 轮，含正在干的这一轮。 */
export const MANUAL_QUEUE_MAX = 5
export const CAMP_EMPTY_TIP = '营地没人可派'
export const AUTO_QUOTA_TIP = '炼金开放后才能挂自动'
export const AUTO_FULL_TIP = '自动线名额已满'
export const AUTO_QUEUE_TIP = '最多排 5 轮'

/**
 * 自动线名额。
 * 开局 0。主线领奖打开炼金站后 1。科技模块打开后 2。
 * 第二条跟着科技模块走，不另加科技节点：和炼金一样是领奖开模块，不用再花灵感。
 */
export function autoLineQuota(save: Save): number {
  if (isModuleUnlocked(save, 'tech')) return 2
  if (isModuleUnlocked(save, 'alchemy')) return 1
  return 0
}

export function autoLineCount(save: Save): number {
  return STATION_ORDER.filter((id) => save.stations[id].auto).length
}

export function manualQualityOutputMul(qualityTier: number): number {
  const tier = Number.isFinite(qualityTier) ? Math.max(1, Math.floor(qualityTier)) : 1
  return tier
}

/** 手动一轮的产出按在岗苦工品质相乘。白档 ×1，和自动线一样。自动线不改数量。 */
export function applyManualQualityOutput(save: Save, stationId: StationId, lots: ItemLot[]): void {
  if (save.stations[stationId].auto) return
  const worker = assignedWorkers(save, stationId)[0]
  const mul = manualQualityOutputMul(worker?.qualityTier ?? 1)
  if (mul <= 1) return
  for (const lot of lots) {
    if (lot.qty <= 0) continue
    const next = Math.max(1, Math.round(lot.qty * mul))
    const extra = next - lot.qty
    if (extra > 0) addToBank(save, lot.itemId, extra)
    lot.qty = next
  }
}

function campHeadReady(save: Save) {
  const head = restingWorkers(save)[0]
  if (!head || !isFullWorkshopHp(head)) return null
  return head
}

function pullManualHead(save: Save, stationId: StationId): boolean {
  const head = campHeadReady(save)
  if (!head) return false
  return assignWorker(save, head.id, stationId).ok
}

/** 排队还没人的手动站，按站序各拉一次当时的营地队首。 */
export function pullWaitingManualRounds(save: Save): void {
  for (const stationId of STATION_ORDER) {
    const station = save.stations[stationId]
    if (station.auto || station.manualRounds <= 0) continue
    if (!isStationUnlocked(save, stationId)) continue
    if (assignedWorkers(save, stationId).length > 0) continue
    pullManualHead(save, stationId)
  }
}

/** 手动一轮做完：人回营地队尾。后面还有轮次就再拉当时的队首。 */
export function finishManualRound(save: Save, stationId: StationId): void {
  const station = save.stations[stationId]
  if (station.auto) return
  const worker = assignedWorkers(save, stationId)[0]
  station.manualRounds = Math.max(0, station.manualRounds - 1)
  station.progress = 0
  if (worker) {
    worker.assignment = null
    offerRestFood(save, worker.id)
  }
  if (station.manualRounds > 0) pullManualHead(save, stationId)
}

/** 点站卡：空闲则立刻派队首干一轮；正在干则排队，最多 5 轮。没人可派不入队。 */
export function dispatchManualRound(save: Save, stationId: StationId): ActionResult {
  if (!isStationUnlocked(save, stationId)) return { ok: false, reason: stationLockedTip(stationId) }
  const station = save.stations[stationId]
  if (station.auto) return { ok: false, reason: '这条线在自动生产' }
  if (!campHeadReady(save)) return { ok: false, reason: CAMP_EMPTY_TIP }
  const busy = assignedWorkers(save, stationId).length > 0
  if (!busy && station.manualRounds <= 0) {
    if (!pullManualHead(save, stationId)) return { ok: false, reason: CAMP_EMPTY_TIP }
    station.manualRounds = 1
    station.progress = 0
    return { ok: true }
  }
  if (station.manualRounds >= MANUAL_QUEUE_MAX) return { ok: false, reason: AUTO_QUEUE_TIP }
  station.manualRounds += 1
  if (!busy) pullManualHead(save, stationId)
  return { ok: true }
}

/** 站卡右上角自动开关。超过名额开不了。 */
export function toggleStationAuto(save: Save, stationId: StationId): ActionResult {
  if (!isStationUnlocked(save, stationId)) return { ok: false, reason: stationLockedTip(stationId) }
  const station = save.stations[stationId]
  if (station.auto) {
    station.auto = false
    station.manualRounds = assignedWorkers(save, stationId).length > 0 ? 1 : 0
    return { ok: true }
  }
  const quota = autoLineQuota(save)
  if (quota <= 0) return { ok: false, reason: AUTO_QUOTA_TIP }
  if (autoLineCount(save) >= quota) return { ok: false, reason: AUTO_FULL_TIP }
  station.auto = true
  station.manualRounds = 0
  return { ok: true }
}
