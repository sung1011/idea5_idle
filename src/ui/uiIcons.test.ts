import { describe, expect, it } from 'vitest'
import { WORKSHOP_TAB_IDS } from './workshopTabs'
import {
  DOCK_ICON_IDS,
  STATION_ICON_IDS,
  UI_ICON_PATHS,
  allUiIconsReady,
  hasUiIcon,
} from './uiIcons'

describe('ui icons', () => {
  it('covers dock tabs and workshop stations with compact paths', () => {
    expect([...DOCK_ICON_IDS]).toEqual(['encounters', 'workshop', 'workers', 'tech'])
    expect([...STATION_ICON_IDS]).toEqual([...WORKSHOP_TAB_IDS])
    expect(allUiIconsReady()).toBe(true)
    for (const id of [...DOCK_ICON_IDS, ...STATION_ICON_IDS]) {
      expect(hasUiIcon(id)).toBe(true)
    }
    const total = Object.values(UI_ICON_PATHS).reduce((sum, paths) => sum + paths.join('').length, 0)
    expect(total).toBeGreaterThan(200)
    expect(total).toBeLessThan(4000)
  })
})
