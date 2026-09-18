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

  it('does not map fire to the ice snowflake or a shared drop path', () => {
    expect(COMBAT_ATTR_ICON_PATHS.fire).not.toEqual(COMBAT_ATTR_ICON_PATHS.ice)
    expect(COMBAT_ATTR_ICON_PATHS.ice.length).toBeGreaterThan(1)
    expect(COMBAT_ATTR_ICON_PATHS.fire.join('')).not.toBe(COMBAT_ATTR_ICON_PATHS.ice.join(''))
  })
})
