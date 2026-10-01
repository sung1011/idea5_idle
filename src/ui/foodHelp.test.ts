import { describe, expect, it } from 'vitest'
import { FOOD_HEAL_RATIO, FOOD_ITEM_IDS } from '../sim/tables'
import sheetSource from './campSheet.vue?raw'
import {
  REST_FOOD_HELP_ROWS,
  REST_FOOD_HELP_TITLE,
  foodHelpCopy,
  foodHelpEffect,
  nextFoodHelp,
} from './foodHelp'

describe('food help bubble', () => {
  it('shows name, unique rule, and stock for each dish', () => {
    expect(foodHelpCopy('meal', 3)).toEqual({
      title: '熟食',
      effect: '回 25% 血。下一次派工少花 10% 时间，就一轮',
      stock: 3,
    })
    expect(foodHelpCopy('roast', 0)).toEqual({
      title: '烤肉',
      effect: '回 40% 血。下一次成功出货必多带 1 件',
      stock: 0,
    })
    expect(foodHelpCopy('stew', 2)).toEqual({
      title: '香料炖',
      effect: '回 55% 血。约 2 分钟工坊掉血减半',
      stock: 2,
    })
    expect(foodHelpCopy('boneSoup', 1)).toEqual({
      title: '骨汤',
      effect: '回 70% 血。效率 ×1.15，持续约 8 分钟',
      stock: 1,
    })
    expect(foodHelpCopy('hunterSkewer', 4)).toEqual({
      title: '猎人肉串',
      effect: '一口气吃满。之后 30 分钟在岗不掉血、不记劳损',
      stock: 4,
    })
    for (const id of FOOD_ITEM_IDS) {
      if (id === 'hunterSkewer') {
        expect(foodHelpEffect(id)).toContain('吃满')
        expect(foodHelpEffect(id)).toContain('不掉血')
        continue
      }
      const percent = Math.round(FOOD_HEAL_RATIO[id] * 100)
      expect(foodHelpEffect(id)).toContain(`${percent}%`)
    }
    expect(foodHelpEffect('roast')).not.toContain('生产速度')
    expect(foodHelpEffect('meal')).not.toContain('生产速度')
    expect(foodHelpEffect('stew')).not.toContain('生产速度')
  })

  it('toggles the same food info closed', () => {
    expect(nextFoodHelp(null, 'meal')).toBe('meal')
    expect(nextFoodHelp('meal', 'meal')).toBeNull()
    expect(nextFoodHelp('meal', 'stew')).toBe('stew')
  })

  it('puts i beside foods, skips 不选, and opens a short rule sheet', () => {
    const foodAt = sheetSource.indexOf('aria-label="选择伙食"')
    const food = sheetSource.slice(foodAt, sheetSource.indexOf('@close="foodRuleOpen = false"', foodAt))
    expect(food).toContain('data-food-help')
    expect(food).toContain('>i</button>')
    expect(food).toContain('aria-label="伙食说明"')
    expect(food).toContain('ModeHelpSheet')
    expect(food).toContain('REST_FOOD_HELP_TITLE')
    expect(REST_FOOD_HELP_TITLE).toBe('营地伙食')
    const noneAt = food.indexOf('>\n              不选\n            </button>')
    expect(noneAt).toBeGreaterThan(0)
    expect(food.slice(noneAt)).not.toContain('data-food-help')
    expect(food.slice(noneAt)).not.toContain('>i</button>')
    const rules = REST_FOOD_HELP_ROWS.map((row) => row.text).join('')
    expect(rules).toContain('共用一份')
    expect(rules).toContain('残血')
    expect(rules).toContain('1 份')
    expect(rules).toContain('没选')
    expect(rules).toContain('不再续吃')
    expect(rules.length).toBeLessThan(80)
  })
})
