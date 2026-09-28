import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import panel from './treasureMinePanel.vue?raw'
import {
  TREASURE_ACT_ICON_IDS,
  TREASURE_ACT_ICON_PATHS,
  allTreasureActIconsReady,
  treasureActIconPaths,
} from './treasureActIcons'

const PATH_ARG: Record<string, number> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
}

function pathCommandsValid(d: string): boolean {
  const tokens = d.match(/[MLHVCSQTAZ]|-?\d*\.?\d+/gi)
  if (!tokens?.length) return false
  let i = 0
  let cmd = ''
  while (i < tokens.length) {
    const token = tokens[i]
    if (/[MLHVCSQTAZ]/i.test(token) && !/^-?\d/.test(token)) {
      cmd = token.toUpperCase()
      i += 1
      if (cmd === 'Z') continue
    }
    const need = PATH_ARG[cmd]
    if (need == null || need === 0) return false
    for (let n = 0; n < need; n += 1) {
      if (i >= tokens.length || !/^-?\d/.test(tokens[i])) return false
      i += 1
    }
  }
  return true
}

describe('treasure act icons', () => {
  it('gives scout, raid and dig their own icons', () => {
    expect([...TREASURE_ACT_ICON_IDS]).toEqual(['scout', 'raid', 'dig'])
    expect(Object.keys(TREASURE_ACT_ICON_PATHS).sort()).toEqual([...TREASURE_ACT_ICON_IDS].sort())
    expect(allTreasureActIconsReady()).toBe(true)
    const signatures = TREASURE_ACT_ICON_IDS.map((id) => treasureActIconPaths(id).join('|'))
    expect(new Set(signatures).size).toBe(TREASURE_ACT_ICON_IDS.length)
    for (const id of TREASURE_ACT_ICON_IDS) {
      for (const d of treasureActIconPaths(id)) {
        expect(d.length).toBeGreaterThan(8)
        expect(pathCommandsValid(d)).toBe(true)
      }
    }
  })

  it('puts scout on the card head, raid at the bottom, and dig only on an empty hole', () => {
    const headerAt = panel.indexOf('<header>')
    const rowAt = panel.indexOf('<div class="row">')
    const header = panel.slice(headerAt, panel.indexOf('</header>', headerAt))
    const row = panel.slice(rowAt, panel.indexOf('</div>', rowAt))
    expect(header).toContain('icon="scout"')
    expect(header).toContain('kind="minor"')
    expect(header).toContain('>侦察</ActButton>')
    expect(header).toContain('`${TREASURE_SCOUT_COST} 砂金`')
    expect(header).not.toContain('icon="raid"')
    expect(header).not.toContain('icon="dig"')
    expect(row).toContain('icon="raid"')
    expect(row).toContain('tone="combat"')
    expect(row).toContain('>抢夺</ActButton>')
    expect(row).toContain('`${stakeOf(mine)} 砂金`')
    expect(row).toContain("mine.owner === 'shadow'")
    expect(row).toContain('icon="dig"')
    expect(row).toContain('tone="produce"')
    expect(row).toContain('>开采</ActButton>')
    expect(row).toContain("mine.owner === 'empty'")
    expect(row).toContain('kind="danger"')
    expect(row).toContain('>撤出</ActButton>')
    expect(row).not.toContain('icon="scout"')
    expect(headerAt).toBeLessThan(rowAt)
    const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')
    expect(css).toMatch(/button\.act\.minor\s*\{[^}]*border:[^;]*#9a9286/)
    expect(css).toMatch(/button\.act\.primary\.combat\s*\{[^}]*#c43228/)
    expect(css).toMatch(/button\.act\.primary\.produce\s*\{[^}]*#d4891a/)
    expect(css).toMatch(/button\.act\.minor\s*\{[^}]*min-height:\s*26px/)
    expect(css).toMatch(/button\.act\.primary\s*\{[^}]*min-height:\s*48px/)
    expect(css).toMatch(/button\.act\.primary\.produce\s*\{[^}]*min-height:\s*46px/)
  })
})