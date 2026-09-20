import { ITEM_DEF, POTION_EFFECT_TEXT } from '../sim/tables'
import type { PotionItemId } from '../sim/types'

export const POTION_EQUIP_HINT = '点选安装到空槽；装好后点槽使用，点？看效果'

export type PotionHelpKey = {
  source: 'slot' | 'pick'
  id: PotionItemId
}

export type PotionHelpCopy = {
  title: string
  effect: string
  stock?: number
}

/** 再点同一个？关闭；换一个则打开新气泡。 */
export function nextPotionHelp(current: PotionHelpKey | null, next: PotionHelpKey): PotionHelpKey | null {
  if (current && current.source === next.source && current.id === next.id) return null
  return next
}

export function potionHelpCopy(id: PotionItemId, stock?: number): PotionHelpCopy {
  return {
    title: ITEM_DEF[id].label,
    effect: POTION_EFFECT_TEXT[id],
    ...(stock != null ? { stock } : {}),
  }
}

export function isPotionHelpOpen(current: PotionHelpKey | null, source: PotionHelpKey['source'], id: PotionItemId): boolean {
  return !!current && current.source === source && current.id === id
}
