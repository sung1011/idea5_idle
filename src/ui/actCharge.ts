import { actIntervalMs } from '../sim/combat'

/**
 * 战场 / 地牢卡面的出手蓄力，只展示，不参与结算。
 *
 * 与 `stepEnemyCombat` 同一周期：某人在 `nextAt` 出手后
 * `nextActAt = nextAt + actIntervalMs(spd)`，
 * `actIntervalMs = max(1, spd) * 1000`。
 *
 * `fill = clamp(1 - (nextActAt - now) / intervalMs, 0, 1)`
 * - 距下次出手仍长于一整段间隔 → 0（例如增援延迟长于 spd）
 * - `now >= nextActAt` → 1，满条就是出手瞬间
 * - 出手后 `nextActAt` 前跳一整段，条回到 0 再蓄
 *
 * 开战首击若被先手缩短，`nextActAt` 比一整段更近，条从中段起蓄。
 * 硬直不改这条公式：`applyBreak` 已把过早的敌方 `nextActAt` 推到
 * `stunnedUntil`，满条仍落在真正出手的瞬间。硬直中条变灰。
 */
export function actChargeFill(spd: number, nextActAt: number, now: number): number {
  if (!Number.isFinite(spd) || !Number.isFinite(nextActAt) || !Number.isFinite(now)) return 0
  const interval = actIntervalMs(spd)
  if (!Number.isFinite(interval) || interval <= 0) return 0
  const fill = 1 - (nextActAt - now) / interval
  if (!Number.isFinite(fill)) return 0
  return Math.min(1, Math.max(0, fill))
}

/** 与 `isCombatStunned` 相同：`now < stunnedUntil`。友方不传硬直。 */
export function actChargeStunned(stunnedUntil: number | null | undefined, now: number): boolean {
  return typeof stunnedUntil === 'number' && Number.isFinite(now) && now < stunnedUntil
}
