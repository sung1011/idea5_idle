import { describe, expect, it } from 'vitest'
import { FOOD_BUFF_DEF, FOOD_HEAL_RATIO, FOOD_ITEM_IDS } from '../sim/tables'
import workersPanelSource from './workersPanelV2.vue?raw'
import {
  REST_FOOD_HELP_ROWS,
  REST_FOOD_HELP_TITLE,
  foodHelpCopy,
  foodHelpEffect,
  nextFoodHelp,
} from './foodHelp'

describe('food help bubble', () => {
  it('shows name, heal ratio, buff, duration, and stock', () => {
    expect(foodHelpCopy('meal', 3)).toEqual({
      title: '熟食',
      effect: '回复 25% 最大生命。生产速度 ×1.02，持续 3 分钟',
      stock: 3,
    })
    expect(foodHelpCopy('roast', 0)).toEqual({
      title: '烤肉',
      effect: '回复 40% 最大生命。不再额外产出',
      stock: 0,
    })
    expect(foodHelpCopy('stew', 2)).toEqual({
      title: '香料炖',
      effect: '回复 55% 最大生命。生产速度 ×1.03，持续 4 分钟',
      stock: 2,
    })
    for (const id of FOOD_ITEM_IDS) {
      const percent = Math.round(FOOD_HEAL_RATIO[id] * 100)
      expect(foodHelpEffect(id)).toContain(`${percent}%`)
      const buff = FOOD_BUFF_DEF[id]
      if (buff.mul > 0) expect(foodHelpEffect(id)).toContain(`×${buff.mul}`)
    }
    expect(foodHelpEffect('roast')).not.toContain('生产速度')
  })

  it('toggles the same food info closed', () => {
    expect(nextFoodHelp(null, 'meal')).toBe('meal')
    expect(nextFoodHelp('meal', 'meal')).toBeNull()
    expect(nextFoodHelp('meal', 'stew')).toBe('stew')
  })

  it('puts i beside foods, skips 不选, and opens a short rule sheet', () => {
    const foodAt = workersPanelSource.indexOf('aria-label="选择伙食"')
    const equipAt = workersPanelSource.indexOf('aria-label="装配药剂"')
    const food = workersPanelSource.slice(foodAt, equipAt)
    expect(food).toContain('data-food-help')
    expect(food).toContain('>i</button>')
    expect(food).toContain('aria-label="伙食说明"')
    expect(food).toContain('ModeHelpSheet')
    expect(food).toContain('REST_FOOD_HELP_TITLE')
    expect(REST_FOOD_HELP_TITLE).toBe('休息区伙食')
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