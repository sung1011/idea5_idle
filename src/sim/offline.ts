import { cloneSave } from './clone'
import { OFFLINE_CAP_S } from './tables'
import { applyTick } from './tick'
import type { Save } from './types'

export type OfflineSummary = {
  seconds: number
}

export type OfflineResult = {
  save: Save
  summary: OfflineSummary
}

export function offlineSeconds(lastTick: number, now = Date.now(), cap = OFFLINE_CAP_S): number {
  if (!Number.isFinite(lastTick) || !Number.isFinite(now)) return 0
  return Math.max(0, Math.min(cap, Math.floor((now - lastTick) / 1000)))
}

/** 骨架：按离线秒数连跑 applyTick，上限 8 小时。 */
export function settleOffline(save: Save, now = Date.now()): OfflineResult {
  const seconds = offlineSeconds(save.lastTick, now)
  if (seconds <= 0) return { save, summary: { seconds: 0 } }

  const next = cloneSave(save)
  for (let i = 0; i < seconds; i++) applyTick(next, { now })
  next.lastTick = now
  return { save: next, summary: { seconds } }
}
