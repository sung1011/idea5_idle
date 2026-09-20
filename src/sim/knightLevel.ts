import { PLAYABLE_STATION_IDS } from './tables'
import type { Save } from './types'

/** 每提升 1 骑士等级给的灵感。 */
export const KNIGHT_LEVEL_TECH_POINTS = 1

/**
 * 骑士等级 = 各可玩工坊 `stationLevel` 之和的换算结果，初始显示 1 级。
 * 六站开局都是 Lv1，裸求和=6，因此不用裸加：
 *   knightLevel = 1 + sum(stationLevel - 1)
 * 等价于 `sum(level) - (站数 - 1)`。
 */
export function computeKnightLevel(save: Save): number {
  let extra = 0
  for (const id of PLAYABLE_STATION_IDS) {
    extra += stationLevelOf(save, id) - 1
  }
  return 1 + extra
}

export function normalizeKnightLevel(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) return 1
  return Math.floor(value)
}

function normalizePoints(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return Math.floor(value)
}

export type KnightLevelSync = {
  from: number | null
  to: number
  gained: number
}

/**
 * 按当前站等级重算骑士等级。
 * 只在存档已有合法快照、且算出值更高时补发差额灵感，避免 tick 重复发放。
 * 旧档缺 `knightLevel` 时只写入算出值，不把缺字段当成 1 去灌点；也不把已有灵感重置成 1。
 */
export function syncKnightLevel(save: Save): KnightLevelSync {
  const current = computeKnightLevel(save)
  const recorded =
    typeof save.knightLevel === 'number' && Number.isFinite(save.knightLevel) && save.knightLevel >= 1
      ? Math.floor(save.knightLevel)
      : null
  const gained =
    recorded !== null && current > recorded ? (current - recorded) * KNIGHT_LEVEL_TECH_POINTS : 0
  if (gained > 0) {
    save.techPoints = normalizePoints(save.techPoints) + gained
  }
  save.knightLevel = current
  return { from: recorded, to: current, gained }
}

function stationLevelOf(save: Save, id: (typeof PLAYABLE_STATION_IDS)[number]): number {
  const raw = save.stations[id]?.stationLevel
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1
}
