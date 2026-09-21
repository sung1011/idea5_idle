import { hashString } from './combatAttrs'

/** 工人出手间隔相对底版的稳定抖动幅度。 */
export const ATK_INTERVAL_JITTER_MIN = 0.08
export const ATK_INTERVAL_JITTER_MAX = 0.12
export const ATK_INTERVAL_JITTER_FLOOR_S = 1
export const ATK_INTERVAL_JITTER_CEIL_S = 12

/** 由工人 id 哈希出 ±8%～12% 乘区，重载不改、升级仍用同一乘区。 */
export function workerAtkIntervalJitterMul(workerId: string): number {
  const h = hashString(`atk-interval:${workerId}`)
  const t = (h % 10000) / 9999
  const mag = ATK_INTERVAL_JITTER_MIN + t * (ATK_INTERVAL_JITTER_MAX - ATK_INTERVAL_JITTER_MIN)
  const sign = h % 2 === 0 ? -1 : 1
  return 1 + sign * mag
}

/** 把出手间隔叠上 id 抖动并夹到合理秒数，保留两位小数。 */
export function jitterWorkerAtkInterval(spd: number, workerId: string): number {
  if (!Number.isFinite(spd) || spd <= 0) return ATK_INTERVAL_JITTER_FLOOR_S
  const next = spd * workerAtkIntervalJitterMul(workerId)
  const clamped = Math.min(ATK_INTERVAL_JITTER_CEIL_S, Math.max(ATK_INTERVAL_JITTER_FLOOR_S, next))
  return Math.round(clamped * 100) / 100
}
