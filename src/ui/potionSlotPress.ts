export const POTION_SLOT_HOLD_MS = 400
export const POTION_SLOT_HOLD_MOVE_PX = 10
export const POTION_EQUIP_HINT = '点选安装到空槽；装好后短按使用，按住可看效果'
export const POTION_EMPTY_HOLD_TIP = '点空槽选择要装的药剂'

export type PotionSlotPressAction = 'use' | 'install' | 'detail' | 'emptyHint' | 'ignore'

export function potionSlotHoldReached(heldMs: number, holdMs = POTION_SLOT_HOLD_MS): boolean {
  return heldMs >= holdMs
}

export function potionSlotPressMoved(dx: number, dy: number, threshold = POTION_SLOT_HOLD_MOVE_PX): boolean {
  return Math.hypot(dx, dy) >= threshold
}

/** 长按看说明，短按用药或打开装配；位移过大则忽略。 */
export function resolvePotionSlotRelease(opts: {
  filled: boolean
  held: boolean
  moved: boolean
}): PotionSlotPressAction {
  if (opts.moved) return 'ignore'
  if (opts.held) return opts.filled ? 'detail' : 'emptyHint'
  return opts.filled ? 'use' : 'install'
}
