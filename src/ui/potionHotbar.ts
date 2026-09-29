import {
  BEAST_OIL_DURATION_S,
  ITEM_DEF,
  RENEW_DURATION_S,
  STIM_DURATION_S,
} from '../sim/tables'
import type { PotionBuffs, PotionItemId } from '../sim/types'

/** 两拍之间光环最多补 1 秒。切页或后台回来后，存档已经追上墙钟。 */
export const POTION_HALO_DT_CAP_S = 1

export type PotionHaloBuffs = Pick<
  PotionBuffs,
  'stimUntil' | 'renewUntil' | 'beastOilUntil' | 'rushStation' | 'doubleMist'
>

export type PotionHaloInput = {
  itemId: PotionItemId | null
  elapsedS: number
  lastTick: number
  now: number
  buffs: PotionHaloBuffs
}

function finiteOr(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  if (value >= 1) return 1
  return value
}

/** 显示用经过秒。权威仍是 sim 的 elapsedS，这里只补上一次 tick 之后的短空档。 */
export function potionVisualElapsedS(elapsedS: number, lastTick: number, now: number): number {
  const base = finiteOr(elapsedS)
  const wall = finiteOr(now, finiteOr(lastTick))
  const last = finiteOr(lastTick, wall)
  const dt = Math.max(0, (wall - last) / 1000)
  return base + Math.min(POTION_HALO_DT_CAP_S, dt)
}

function clockRatio(until: number | null, elapsed: number, duration: number): number {
  if (until == null || !Number.isFinite(until) || duration <= 0) return 0
  const remain = until - elapsed
  if (remain <= 0) return 0
  return clamp01(remain / duration)
}

/**
 * 槽位外圈剩余比例，0～1。
 * 嗜血、先祖续命汤、狂兽油按剩余时长缩小。
 * 赶工粉、双份雾在标记还在时保持整圈，用掉就灭。
 * 立刻生效的药剂没有光环。
 */
export function potionEffectRemainRatio(input: PotionHaloInput): number {
  const id = input.itemId
  if (!id) return 0
  const t = potionVisualElapsedS(input.elapsedS, input.lastTick, input.now)
  const buffs = input.buffs
  if (id === 'stim') return clockRatio(buffs.stimUntil, t, STIM_DURATION_S)
  if (id === 'renewSoup') return clockRatio(buffs.renewUntil, t, RENEW_DURATION_S)
  if (id === 'beastOil') return clockRatio(buffs.beastOilUntil, t, BEAST_OIL_DURATION_S)
  if (id === 'rushPowder') return buffs.rushStation ? 1 : 0
  if (id === 'doubleMist') return buffs.doubleMist ? 1 : 0
  return 0
}

/** 数量为 0 时的获取提示。只给界面用，不改扣瓶。 */
export function potionEmptyAcquireTip(itemId: PotionItemId): string {
  const label = ITEM_DEF[itemId].label
  if (itemId === 'beastOil') return `${label}见底，到炼金站详情做一瓶`
  return `${label}见底，到炼金站做`
}

/** 同一瓶从没有变成有，槽位才呼吸。换一种药、或第一次记快照，都不算。 */
export function potionQtyRestocked(prevQty: number, nextQty: number, sameItem: boolean): boolean {
  return sameItem && prevQty <= 0 && nextQty > 0
}
