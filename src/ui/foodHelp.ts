import {
  BONE_SOUP_DURATION_S,
  BONE_SOUP_SPEED_MUL,
  FOOD_HEAL_RATIO,
  HUNTER_SKEWER_GUARD_S,
  ITEM_DEF,
  MEAL_CYCLE_CUT,
  ROAST_EXTRA_OUTPUT,
  STEW_RESIST_S,
  type FoodItemId,
} from '../sim/tables'
import type { ModeHelpRow } from './modeHelp'

export const REST_FOOD_HELP_TITLE = '营地伙食'

/** 选择伙食标题栏「？」的短说明。数字在食物旁的 i 里。 */
export const REST_FOOD_HELP_ROWS: ModeHelpRow[] = [
  {
    label: '怎么玩',
    text: '营地共用一份伙食。残血苦工进入休息时，自动吃 1 份当前选中的食物。',
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

function healText(id: FoodItemId): string {
  return `回 ${Math.round(FOOD_HEAL_RATIO[id] * 100)}% 血`
}

/** 五道菜各一句玩家口吻：回血 + 独特规则。 */
export function foodHelpEffect(id: FoodItemId): string {
  const heal = healText(id)
  if (id === 'meal') return `${heal}。下一次派工少花 ${Math.round(MEAL_CYCLE_CUT * 100)}% 时间，就一轮`
  if (id === 'roast') return `${heal}。下一次成功出货必多带 ${ROAST_EXTRA_OUTPUT} 件`
  if (id === 'stew') return `${heal}。约 ${STEW_RESIST_S / 60} 分钟工坊掉血减半`
  if (id === 'boneSoup') return `${heal}。效率 ×${BONE_SOUP_SPEED_MUL}，持续约 ${BONE_SOUP_DURATION_S / 60} 分钟`
  return `一口气吃满。之后 ${HUNTER_SKEWER_GUARD_S / 60} 分钟在岗不掉血、不记劳损`
}

export function foodHelpCopy(id: FoodItemId, stock: number): FoodHelpCopy {
  return {
    title: ITEM_DEF[id].label,
    effect: foodHelpEffect(id),
    stock,
  }
}
