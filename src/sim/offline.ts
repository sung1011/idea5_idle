import { bankQty } from './bank'
import { cloneSave } from './clone'
import { pushMessage } from './messages'
import { ITEM_DEF, ITEM_IDS, OFFLINE_CAP_S, STATION_DEF, STATION_IDS } from './tables'
import { applyTick } from './tick'
import type { ItemId, Save, StallReason, StationId } from './types'

export type OfflineBankDelta = {
  itemId: ItemId
  label: string
  before: number
  after: number
  delta: number
}

export type OfflineStationLine = {
  stationId: StationId
  label: string
  completed: number
  stallReason: StallReason | null
}

export type OfflineSummary = {
  seconds: number
  capped: boolean
  goldBefore: number
  goldAfter: number
  goldDelta: number
  bank: OfflineBankDelta[]
  stations: OfflineStationLine[]
  lines: string[]
}

export type OfflineResult = {
  save: Save
  summary: OfflineSummary
}

export function rawOfflineSeconds(lastTick: number, now = Date.now()): number {
  if (!Number.isFinite(lastTick) || !Number.isFinite(now)) return 0
  return Math.max(0, Math.floor((now - lastTick) / 1000))
}

export function offlineSeconds(lastTick: number, now = Date.now(), cap = OFFLINE_CAP_S): number {
  return Math.min(cap, rawOfflineSeconds(lastTick, now))
}

export function formatOfflineDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60
  const parts: string[] = []
  if (h > 0) parts.push(`${h} 小时`)
  if (m > 0) parts.push(`${m} 分钟`)
  if (s > 0 || parts.length === 0) parts.push(`${s} 秒`)
  return parts.join(' ')
}

function emptySummary(gold: number, seconds = 0, capped = false): OfflineSummary {
  return {
    seconds,
    capped,
    goldBefore: gold,
    goldAfter: gold,
    goldDelta: 0,
    bank: [],
    stations: [],
    lines: [],
  }
}

function bankDeltas(before: Save, after: Save): OfflineBankDelta[] {
  const deltas: OfflineBankDelta[] = []
  for (const itemId of ITEM_IDS) {
    const prev = bankQty(before, itemId)
    const next = bankQty(after, itemId)
    const delta = next - prev
    if (delta === 0) continue
    deltas.push({
      itemId,
      label: ITEM_DEF[itemId].label,
      before: prev,
      after: next,
      delta,
    })
  }
  return deltas
}

function stationLines(before: Save, after: Save): OfflineStationLine[] {
  const lines: OfflineStationLine[] = []
  for (const stationId of STATION_IDS) {
    const completed = after.stations[stationId].completed - before.stations[stationId].completed
    const stallReason = after.stations[stationId].stallReason
    if (completed <= 0 && !stallReason) continue
    lines.push({
      stationId,
      label: STATION_DEF[stationId].label,
      completed,
      stallReason,
    })
  }
  return lines
}

function buildLines(summary: Omit<OfflineSummary, 'lines'>): string[] {
  const lines: string[] = []
  let time = `离线 ${formatOfflineDuration(summary.seconds)}`
  if (summary.capped) time += '（已达 8 小时上限）'
  lines.push(time)

  for (const st of summary.stations) {
    const bits = [st.label]
    if (st.completed > 0) bits.push(`完成 ${st.completed} 次`)
    if (st.stallReason === 'emptyInput') bits.push('原料见底')
    if (st.stallReason === 'fullOutput') bits.push('产物堆满')
    if (bits.length > 1) lines.push(bits.join(' · '))
  }

  if (summary.bank.length) {
    const parts = summary.bank.map((b) => {
      const sign = b.delta > 0 ? '+' : ''
      return `${b.label} ${sign}${b.delta}`
    })
    lines.push(`银行 ${parts.join(' · ')}`)
  }

  if (summary.goldDelta !== 0) {
    const sign = summary.goldDelta > 0 ? '+' : ''
    lines.push(`金币 ${sign}${summary.goldDelta}`)
  }

  return lines
}

export function buildOfflineSummary(before: Save, after: Save, seconds: number, capped: boolean): OfflineSummary {
  const draft: Omit<OfflineSummary, 'lines'> = {
    seconds,
    capped,
    goldBefore: before.gold,
    goldAfter: after.gold,
    goldDelta: after.gold - before.gold,
    bank: bankDeltas(before, after),
    stations: stationLines(before, after),
  }
  return { ...draft, lines: buildLines(draft) }
}

export function offlineSummaryHasChange(summary: OfflineSummary): boolean {
  return (
    summary.goldDelta !== 0 ||
    summary.bank.length > 0 ||
    summary.stations.some((st) => st.completed > 0)
  )
}

export function pushOfflineMessage(save: Save, summary: OfflineSummary, now = Date.now()) {
  if (summary.seconds <= 0 || !offlineSummaryHasChange(summary)) return null
  return pushMessage(save, {
    title: '离线收益',
    body: summary.lines.join('\n'),
    createdAt: now,
  })
}

/** 按离线秒数连跑 applyTick，上限 8 小时；有变化则写入消息箱，不弹顶栏。 */
export function settleOffline(save: Save, now = Date.now()): OfflineResult {
  const raw = rawOfflineSeconds(save.lastTick, now)
  const seconds = Math.min(OFFLINE_CAP_S, raw)
  const capped = raw > OFFLINE_CAP_S
  if (seconds <= 0) return { save, summary: emptySummary(save.gold) }

  const before = cloneSave(save)
  const next = cloneSave(save)
  for (let i = 0; i < seconds; i++) applyTick(next, { now })
  next.lastTick = now
  next.offlineCount = (Number.isFinite(next.offlineCount) ? Math.max(0, Math.floor(next.offlineCount)) : 0) + 1
  const summary = buildOfflineSummary(before, next, seconds, capped)
  pushOfflineMessage(next, summary, now)
  return { save: next, summary }
}
