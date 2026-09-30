import { assignedWorkers, assignWorker, restingWorkers } from './assign'
import { canConsume } from './query'
import { addToBank } from './bank'
import { offerRestFood, sendWorkerToRestTail } from './food'
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
/** 点站卡小图标时弹出。这个标记不是排队入口。 */
export const ROUND_BADGE_TIP =
  '点站点大面板，把营地队首派上去工作一轮。还在工作时再点，排进下一轮，最多 5 轮。一轮工作完，苦工回到营地队尾。右上角数字是站里的人数加上后续轮次：空站 0，1 人在干是 1，再排 1 轮是 2，连点到 5。自动线开着时这里是 ♾️：做完一轮就回营地队尾，立刻再拉满血队首，不限轮次，不再留人常驻。点角标打开气泡，上方「自动」受名额限制，下方可以清空。点角标不会直接排队。'
export const AUTO_BADGE = '♾️'
/** ×N 说明气泡里的按钮。 */
export const CLEAR_MANUAL_QUEUE_LABEL = '清空'
/** 按钮旁的说明。 */
export const CLEAR_MANUAL_QUEUE_NOTE = '在岗苦工立刻回营地队尾，后续排队取消，自动线关闭，进度停下。'

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

/** 空着的手动排队，以及开着自动的站，按站序各拉一次当时的营地队首。 */
export function pullWaitingManualRounds(save: Save): void {
  for (const stationId of STATION_ORDER) {
    const station = save.stations[stationId]
    if (!isStationUnlocked(save, stationId)) continue
    if (assignedWorkers(save, stationId).length > 0) continue
    if (station.auto) {
      pullManualHead(save, stationId)
      continue
    }
    if (station.manualRounds <= 0) continue
    pullManualHead(save, stationId)
  }
}

/**
 * 一轮做完：人回营地队尾。
 * 手动后面还有轮次，或自动线仍开着，就再拉当时的满血队首。
 */
export function finishManualRound(save: Save, stationId: StationId): void {
  const station = save.stations[stationId]
  const worker = assignedWorkers(save, stationId)[0]
  if (!station.auto) station.manualRounds = Math.max(0, station.manualRounds - 1)
  station.progress = 0
  if (worker) {
    worker.assignment = null
    offerRestFood(save, worker.id)
  }
  if (station.auto) {
    if (isStationUnlocked(save, stationId)) pullManualHead(save, stationId)
    return
  }
  if (station.manualRounds > 0) pullManualHead(save, stationId)
}

/** 点站卡：空闲则立刻派队首工作一轮；正在工作则排队，最多 5 轮。没人可派不入队。 */
export function dispatchManualRound(save: Save, stationId: StationId): ActionResult {
  if (!isStationUnlocked(save, stationId)) return { ok: false, reason: stationLockedTip(stationId) }
  const station = save.stations[stationId]
  if (station.auto) return { ok: false, reason: '这条线已挂自动' }
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

/** 还没开始的后续轮次。正在做的这一轮不算。自动线不记轮次。 */
export function manualQueueLeft(save: Save, stationId: StationId): number {
  const station = save.stations[stationId]
  if (station.auto) return 0
  const working = assignedWorkers(save, stationId).length > 0 ? 1 : 0
  return Math.max(0, station.manualRounds - working)
}

/** 在岗人数 + 还没开始的排队轮次。空站 0，1 人在干是 1，再排 1 轮是 2。 */
export function stationOccupancyCount(save: Save, stationId: StationId): number {
  return assignedWorkers(save, stationId).length + manualQueueLeft(save, stationId)
}

/** 站卡小图标。自动线仍是 ♾️；否则是在岗人数加后续排队。 */
export function stationRoundBadge(save: Save, stationId: StationId): string {
  if (save.stations[stationId].auto) return AUTO_BADGE
  return String(stationOccupancyCount(save, stationId))
}

/** 小图标的读屏说明。 */
export function stationRoundBadgeAria(save: Save, stationId: StationId): string {
  if (save.stations[stationId].auto) return '自动，无限排队，打开自动和清空'
  const working = assignedWorkers(save, stationId).length
  const queued = manualQueueLeft(save, stationId)
  return `在岗 ${working} 人，排队 ${queued} 轮，合计 ${working + queued}，查看排队说明`
}

/** 还有排队、在岗的人、自动线或进度，才能清空。 */
export function canClearStationWork(save: Save, stationId: StationId): boolean {
  const station = save.stations[stationId]
  if (station.auto || station.manualRounds > 0 || station.progress > 0) return true
  return assignedWorkers(save, stationId).length > 0
}

/** 后续排队清 0，在岗苦工立刻回营地队尾，关掉自动线，进度归零。 */
export function clearManualQueue(save: Save, stationId: StationId): ActionResult {
  if (!isStationUnlocked(save, stationId)) return { ok: false, reason: stationLockedTip(stationId) }
  if (!canClearStationWork(save, stationId)) return { ok: false, reason: '没有可清空的工作' }
  const station = save.stations[stationId]
  const crew = assignedWorkers(save, stationId).slice()
  station.auto = false
  station.manualRounds = 0
  station.progress = 0
  station.stallReason = null
  station.wearCredited = 0
  station.wearScareHit = false
  for (const worker of crew) {
    worker.assignment = null
    offerRestFood(save, worker.id)
    sendWorkerToRestTail(save, worker.id)
  }
  return { ok: true }
}

/** 站卡右上角自动开关。超过名额开不了。 */
export function toggleStationAuto(save: Save, stationId: StationId): ActionResult {
  if (!isStationUnlocked(save, stationId)) return { ok: false, reason: stationLockedTip(stationId) }
  const station = save.stations[stationId]
  if (station.auto) {
    station.auto = false
    const crew = assignedWorkers(save, stationId)
    // 缺料卡住时关自动，人立刻回营，别占着岗让别的线拉不到人。
    if (crew.length > 0 && !canConsume(save, stationId)) {
      station.manualRounds = 0
      station.progress = 0
      station.stallReason = null
      station.wearCredited = 0
      station.wearScareHit = false
      for (const worker of crew) {
        worker.assignment = null
        offerRestFood(save, worker.id)
        sendWorkerToRestTail(save, worker.id)
      }
      return { ok: true }
    }
    // 正在做的这一轮按手动收尾，做完回营。空站不再拉人，不留常驻。
    station.manualRounds = crew.length > 0 ? 1 : 0
    return { ok: true }
  }
  const quota = autoLineQuota(save)
  if (quota <= 0) return { ok: false, reason: AUTO_QUOTA_TIP }
  if (autoLineCount(save) >= quota) return { ok: false, reason: AUTO_FULL_TIP }
  station.auto = true
  station.manualRounds = 0
  return { ok: true }
}
