import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { STATION_ORDER } from '../sim/tables'
import uiIconSource from './uiIcon.vue?raw'
import appSource from './app.vue?raw'
import workersSource from './workersPanelV2.vue?raw'
import {
  DOCK_ICON_IDS,
  STATION_ICON_IDS,
  UI_ICON_PATHS,
  allUiIconsReady,
  hasUiIcon,
  uiIconSprite,
} from './uiIcons'

const iconsCss = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'icons.css'), 'utf8')

function spritePosition(css: string, sheet: 'tab' | 'station', name: string): string {
  const rule = new RegExp(
    `\\.sprite-${sheet}(?:\\.[\\w-]+|,\\s*\\.sprite-${sheet}\\.[\\w-]+)*\\.${name}[^{]*\\{[^}]*background-position:\\s*([^;]+);`,
  )
  const hit = css.match(rule)
  if (!hit?.[1]) throw new Error(`missing .sprite-${sheet}.${name}`)
  return hit[1].trim().replace(/\s+/g, ' ')
}

describe('ui icons', () => {
  it('挂上六站与底栏彩色 sprite，格序按图集', () => {
    expect([...DOCK_ICON_IDS]).toEqual(['workshop', 'encounters', 'pvp', 'tech'])
    expect([...STATION_ICON_IDS]).toEqual([...STATION_ORDER])
    expect(uiIconSource).toContain('sprite-tab')
    expect(uiIconSource).toContain('sprite-station')
    expect(appSource).toContain('<UiIcon :name="t.id" />')
    expect(workersSource).toContain('<UiIcon :name="board.stationId" />')

    for (const id of DOCK_ICON_IDS) expect(uiIconSprite(id)).toBe('tab')
    expect(uiIconSprite('workers')).toBe('tab')
    for (const id of STATION_ICON_IDS) expect(uiIconSprite(id)).toBe('station')
    expect(uiIconSprite('fishing')).toBeNull()
    expect(uiIconSprite('forging')).toBeNull()

    expect(iconsCss).toMatch(/\.sprite-tab\s*\{[^}]*background-size:\s*200%\s+200%/)
    expect(iconsCss).toMatch(/\.sprite-station\s*\{[^}]*background-size:\s*300%\s+200%/)
    expect(iconsCss).not.toContain('400% 200%')

    expect(spritePosition(iconsCss, 'tab', 'workshop')).toBe('0% 0%')
    expect(spritePosition(iconsCss, 'tab', 'workers')).toBe('0% 0%')
    expect(spritePosition(iconsCss, 'tab', 'encounters')).toBe('100% 0%')
    expect(spritePosition(iconsCss, 'tab', 'pvp')).toBe('0% 100%')
    expect(spritePosition(iconsCss, 'tab', 'tech')).toBe('100% 100%')

    expect(spritePosition(iconsCss, 'station', 'herbalism')).toBe('0% 0%')
    expect(spritePosition(iconsCss, 'station', 'alchemy')).toBe('50% 0%')
    expect(spritePosition(iconsCss, 'station', 'hunting')).toBe('100% 0%')
    expect(spritePosition(iconsCss, 'station', 'cooking')).toBe('0% 100%')
    expect(spritePosition(iconsCss, 'station', 'mining')).toBe('50% 100%')
    expect(spritePosition(iconsCss, 'station', 'inscription')).toBe('100% 100%')
  })

  it('职业小图标仍可复用单色 path', () => {
    expect(allUiIconsReady()).toBe(true)
    for (const id of [...DOCK_ICON_IDS, ...STATION_ICON_IDS]) {
      expect(hasUiIcon(id)).toBe(true)
    }
    const total = Object.values(UI_ICON_PATHS).reduce((sum, paths) => sum + paths.join('').length, 0)
    expect(total).toBeGreaterThan(200)
    expect(total).toBeLessThan(4000)
  })
})