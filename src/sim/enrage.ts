import type { ActionResult, Save, StationId } from './types'

export const ENRAGE_DURATION_MS = 60_000
export const ENRAGE_COOLDOWN_MS = 300_000
export const ENRAGE_SPEED_MUL = 2.5
export const ENRAGE_FATIGUE_MUL = 6

export type StationEnrageStatus = {
  active: boolean
  ready: boolean
  remainS: number
  cooldownS: number
}

function wall(now: number): number {
  return Number.isFinite(now) ? now : 0
}

export function isStationEnraged(save: Save, stationId: StationId, now: number): boolean {
  const until = save.stations[stationId].enrageUntil
  return typeof until === 'number' && wall(now) < until
}

export function stationEnrageSpeedMul(save: Save, stationId: StationId, now: number): number {
  return isStationEnraged(save, stationId, now) ? ENRAGE_SPEED_MUL : 1
}

export function stationEnrageFatigueMul(save: Save, stationId: StationId, now: number): number {
  return isStationEnraged(save, stationId, now) ? ENRAGE_FATIGUE_MUL : 1
}

export function stationEnrageStatus(save: Save, stationId: StationId, now: number): StationEnrageStatus {
  const t = wall(now)
  const station = save.stations[stationId]
  const until = typeof station.enrageUntil === 'number' ? station.enrageUntil : 0
  const readyAt = typeof station.enrageReadyAt === 'number' ? station.enrageReadyAt : 0
  const active = until > t
  const ready = !active && t >= readyAt
  return {
    active,
    ready,
    remainS: active ? Math.max(0, Math.ceil((until - t) / 1000)) : 0,
    cooldownS: !active && t < readyAt ? Math.max(0, Math.ceil((readyAt - t) / 1000)) : 0,
  }
}

export function startStationEnrage(save: Save, stationId: StationId, now = Date.now()): ActionResult {
  const t = wall(now)
  const status = stationEnrageStatus(save, stationId, t)
  if (status.active) return { ok: false, reason: '狂暴进行中' }
  if (!status.ready) return { ok: false, reason: `狂暴冷却 ${status.cooldownS}s` }
  const station = save.stations[stationId]
  station.enrageUntil = t + ENRAGE_DURATION_MS
  station.enrageReadyAt = t + ENRAGE_DURATION_MS + ENRAGE_COOLDOWN_MS
  return { ok: true, message: '狂暴开启' }
}
