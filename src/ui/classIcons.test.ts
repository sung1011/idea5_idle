import { describe, expect, it } from 'vitest'
import { CLASS_IDS } from '../sim/tables'
import { CLASS_ICON_PATHS, allClassIconsReady, hasClassIcon } from './classIcons'

describe('class icons', () => {
  it('covers every living class with compact paths', () => {
    expect(allClassIconsReady()).toBe(true)
    for (const id of CLASS_IDS) {
      expect(hasClassIcon(id)).toBe(true)
    }
    const total = Object.values(CLASS_ICON_PATHS).reduce((sum, paths) => sum + paths.join('').length, 0)
    expect(total).toBeGreaterThan(200)
    expect(total).toBeLessThan(4000)
  })
})
