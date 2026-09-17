import { describe, expect, it } from 'vitest'
import { COMBAT_ATTR_IDS } from '../sim/combatAttrs'
import { allCombatAttrIconsReady, COMBAT_ATTR_ICON_PATHS } from './combatAttrIcons'

describe('combat attr icons', () => {
  it('covers all 12 attrs with compact paths', () => {
    expect(Object.keys(COMBAT_ATTR_ICON_PATHS)).toEqual([...COMBAT_ATTR_IDS])
    expect(allCombatAttrIconsReady()).toBe(true)
    const total = Object.values(COMBAT_ATTR_ICON_PATHS).reduce(
      (sum, paths) => sum + paths.join('').length,
      0,
    )
    expect(total).toBeGreaterThan(200)
    expect(total).toBeLessThan(4000)
  })
})
