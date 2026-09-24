import { EFFECT_ID, FOOD_BUFF_DEF, FOOD_HEAL_RATIO, ITEM_DEF, type FoodItemId } from '../sim/tables'
import type { ModeHelpRow } from './modeHelp'

export const REST_FOOD_HELP_TITLE = '休息区伙食'

/** 选择伙食标题栏「？」的短说明。数字在食物旁的 i 里。 */
export const REST_FOOD_HELP_ROWS: ModeHelpRow[] = [
  {
    label: '怎么玩',
    text: '休息区共用一份伙食。残血工人进入休息时，自动吃 1 份当前选中的食物。',
  },
  {
    label: '规则要点',
    text: '没选，或物资里没有这份，就不吃。已经在休息的人不再续吃。',
  },
]

export type FoodHelpCopy = {
  title: string
  effect: string
  stock: number
}

export function nextFoodHelp(current: FoodItemId | null, next: FoodItemId): FoodItemId | null {
  return current === next ? null : next
}

function durationText(durationS: number): string {
  if (durationS > 0 && durationS % 60 === 0) return `${durationS / 60} 分钟`
  return `${durationS} 秒`
}

/** 回血比例、生效的 Buff 和时长。烤肉没有额外产出，不计一段空时长。 */
export function foodHelpEffect(id: FoodItemId): string {
  const percent = Math.round(FOOD_HEAL_RATIO[id] * 100)
  const heal = `回复 ${percent}% 最大生命`
  const buff = FOOD_BUFF_DEF[id]
  if (!(buff.mul > 0)) return `${heal}。不再额外产出`
  const duration = durationText(buff.durationS)
  if (buff.effectId === EFFECT_ID.prodSpeed) return `${heal}。生产速度 ×${buff.mul}，持续 ${duration}`
  return `${heal}。额外产出 ×${buff.mul}，持续 ${duration}`
}

export function foodHelpCopy(id: FoodItemId, stock: number): FoodHelpCopy {
  return {
    title: ITEM_DEF[id].label,
    effect: foodHelpEffect(id),
    stock,
  }
}
