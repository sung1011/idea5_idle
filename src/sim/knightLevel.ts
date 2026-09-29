import { pushMessage } from './messages'
import { PLAYABLE_STATION_IDS } from './tables'
import type { Save } from './types'

type UnlockQueue = (save: Save, from: number | null, to: number) => void
let unlockQueue: UnlockQueue | null = null

/** 由玩法解锁模块挂上，避免和站入口互相引用。 */
export function bindKnightUnlockQueue(fn: UnlockQueue): void {
  unlockQueue = fn
}

/** 每提升 1 酋长等级给的灵感。 */
export const KNIGHT_LEVEL_TECH_POINTS = 1

export const KNIGHT_XP_STATION_LEVEL = 30
export const KNIGHT_XP_GUIDE_STEP = 20
export const KNIGHT_XP_ENEMY = 5
export const KNIGHT_XP_CHAPTER_BOSS_EXTRA = 60
export const KNIGHT_XP_MARKET = 10
export const KNIGHT_XP_MARKET_TIMED = 20
export const KNIGHT_XP_CHEST = 15
export const KNIGHT_XP_CHEST_SILVER = 5
export const KNIGHT_XP_CHEST_GOLD = 10
export const KNIGHT_XP_BEAST_CORE = 50
export const KNIGHT_XP_RANK_MIN = 20
export const KNIGHT_XP_RANK_SPAN = 60

/**
 * 离开当前级所需经验。下标 0 是 1 级。
 * 1～9 级合计 690，按前期约 1 小时的产出估到 10 级。
 * 10～19 级合计 2720，按挂机加日结估到约 1～2 天升到 20 级。
 * 20 级之后沿用末档再按 1.12 变贵，经验仍能涨。
 */
export const KNIGHT_XP_TO_NEXT = [
  50, 55, 60, 70, 75, 80, 90, 100, 110, 130, 150, 170, 200, 230, 270, 310, 360, 420, 480,
] as const

const KNIGHT_XP_AFTER_GROWTH = 1.12

export function xpToNextKnightLevel(level: number): number {
  const current = Math.max(1, Math.floor(level))
  if (current <= KNIGHT_XP_TO_NEXT.length) return KNIGHT_XP_TO_NEXT[current - 1]!
  const last = KNIGHT_XP_TO_NEXT[KNIGHT_XP_TO_NEXT.length - 1]!
  const steps = current - KNIGHT_XP_TO_NEXT.length
  return Math.max(last, Math.round(last * Math.pow(KNIGHT_XP_AFTER_GROWTH, steps)))
}

/** 从 1 级升到 target 的累计经验。升到 10 级是 690，升到 20 级是 3410。 */
export function knightXpToReachLevel(level: number): number {
  const target = Math.max(1, Math.floor(level))
  let total = 0
  for (let current = 1; current < target; current += 1) total += xpToNextKnightLevel(current)
  return total
}

/**
 * 日结名次换经验。第 1 名 80，最后一名 20，中间按名次线性下降。
 * boardSize 是本组人数（含玩家）。
 */
export function knightXpForRank(rank: number, boardSize: number): number {
  const size = Math.max(2, Math.floor(boardSize))
  const safe = Math.min(size, Math.max(1, Math.floor(rank) || 1))
  return KNIGHT_XP_RANK_MIN + Math.round((KNIGHT_XP_RANK_SPAN * (size - safe)) / (size - 1))
}

export function normalizeKnightLevel(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) return 1
  return Math.floor(value)
}

export function normalizeKnightXp(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return Math.floor(value)
}

/**
 * 旧算法：`1 + sum(stationLevel - 1)`。
 * 只在老档没有酋长经验、也没有合法等级快照时用来定一次等级。之后不再跟站等级走。
 */
export function computeKnightLevel(save: Save): number {
  let extra = 0
  for (const id of PLAYABLE_STATION_IDS) {
    extra += stationLevelOf(save, id) - 1
  }
  return 1 + extra
}

function stationLevelOf(save: Save, id: (typeof PLAYABLE_STATION_IDS)[number]): number {
  const raw = save.stations[id]?.stationLevel
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1
}

function normalizePoints(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return Math.floor(value)
}

const xpFloats: number[] = []

export function takeKnightXpFloats(): number[] {
  return xpFloats.splice(0, xpFloats.length)
}

function noteKnightXpFloat(amount: number): void {
  if (amount <= 0) return
  xpFloats.push(amount)
  if (xpFloats.length > 8) xpFloats.splice(0, xpFloats.length - 8)
}

export type KnightXpGrant = {
  amount: number
  from: number
  to: number
  xp: number
  gained: number
  inspiration: number
}

/** 加上酋长经验。跨级时每级 1 灵感，并排进「新玩法开放」。等级不会回落。 */
export function grantKnightXp(save: Save, amount: number): KnightXpGrant {
  const gain = Math.floor(amount)
  const from = normalizeKnightLevel(save.knightLevel)
  let xp = normalizeKnightXp(save.knightXp)
  if (gain <= 0) {
    save.knightLevel = from
    save.knightXp = xp
    return { amount: 0, from, to: from, xp, gained: 0, inspiration: 0 }
  }
  xp += gain
  let level = from
  let gained = 0
  while (gained < 40 && xp >= xpToNextKnightLevel(level)) {
    xp -= xpToNextKnightLevel(level)
    level += 1
    gained += 1
  }
  save.knightLevel = level
  save.knightXp = xp
  const inspiration = gained * KNIGHT_LEVEL_TECH_POINTS
  if (inspiration > 0) {
    save.techPoints = normalizePoints(save.techPoints) + inspiration
    pushMessage(save, {
      title: '酋长升级',
      body: `酋长等级升到 ${level}，灵感 +${inspiration}`,
    })
    unlockQueue?.(save, from, level)
  }
  noteKnightXpFloat(gain)
  return { amount: gain, from, to: level, xp, gained, inspiration }
}

/**
 * 老档没有 `knightXp`：留下已有等级；没有等级快照时按旧站等级公式定一次。
 * 经验从该级 0 开始。不补发灵感，等级不回落。
 * 已经带经验的档只校正数字，不按站等级重算。
 */
export function hydrateKnightXp(save: Save): void {
  const hasXp = typeof save.knightXp === 'number' && Number.isFinite(save.knightXp)
  const recorded =
    typeof save.knightLevel === 'number' && Number.isFinite(save.knightLevel) && save.knightLevel >= 1
      ? Math.floor(save.knightLevel)
      : null
  if (!hasXp) {
    save.knightLevel = recorded ?? computeKnightLevel(save)
    save.knightXp = 0
    return
  }
  save.knightXp = normalizeKnightXp(save.knightXp)
  save.knightLevel = recorded ?? computeKnightLevel(save)
}
