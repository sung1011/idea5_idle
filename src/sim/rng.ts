import type { Save } from './types'

let rollOverride: (() => number) | null = null

/** 测试用：固定采集掷骰。测完必须 `setRollOverride(null)`。 */
export function setRollOverride(fn: (() => number) | null): void {
  rollOverride = fn
}

export function normalizeRngState(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1
  const n = value >>> 0
  return n === 0 ? 1 : n
}

/** mulberry32。每次推进 save.rngState。 */
export function roll01(save: Save): number {
  if (rollOverride) return clamp01(rollOverride())
  let seed = normalizeRngState(save.rngState)
  seed += 0x6d2b79f5
  let t = seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  save.rngState = seed >>> 0
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value <= 0) return 0
  if (value >= 1) return 0.999999
  return value
}
