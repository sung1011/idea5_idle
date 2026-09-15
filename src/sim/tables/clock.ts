/** 1 tick = 1 秒。1 游戏日 = 1440 秒（24 分钟现实时间，1 秒 ≈ 1 游戏分钟）。 */
export const DAY_LENGTH_S = 24 * 60

/** 离线追 tick 上限建议：8 小时。在线与离线共用 applyTick。 */
export const OFFLINE_CAP_S = 8 * 60 * 60

export function gameDay(elapsedS: number): number {
  return Math.floor(Math.max(0, elapsedS) / DAY_LENGTH_S) + 1
}

export function timeOfDayS(elapsedS: number): number {
  return Math.max(0, elapsedS) % DAY_LENGTH_S
}

export function formatClock(totalS: number): string {
  const safe = Math.max(0, Math.floor(totalS))
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}
