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
    expect(header).toContain('class="act scout"')
    expect(header).toContain('<TreasureActIcon name="scout" />')
    expect(header).toContain('>侦察</span>')
    expect(header).toContain('{{ TREASURE_SCOUT_COST }} 砂金')
    expect(header).not.toContain('class="act raid"')
    expect(header).not.toContain('class="act dig"')
    expect(row).toContain('class="act raid"')
    expect(row).toContain('<TreasureActIcon name="raid" />')
    expect(row).toContain('>抢夺</span>')
    expect(row).toContain('{{ stakeOf(mine) }} 砂金')
    expect(row).toContain("mine.owner === 'shadow'")
    expect(row).toContain('class="act dig"')
    expect(row).toContain('<TreasureActIcon name="dig" />')
    expect(row).toContain('>开采</span>')
    expect(row).toContain("mine.owner === 'empty'")
    expect(row).not.toContain('class="act scout"')
    expect(headerAt).toBeLessThan(rowAt)
    const css = panel.slice(panel.indexOf('<style'))
    expect(css).toMatch(/\.act\.scout\s*\{[^}]*border:[^;]*#9a9286/)
    expect(css).toMatch(/\.row \.act\.raid\s*\{[^}]*#c43228/)
    expect(css).toMatch(/\.row \.act\.dig\s*\{[^}]*#d4891a/)
    expect(css).toMatch(/\.act\.scout\s*\{[^}]*min-height:\s*26px/)
    expect(css).toMatch(/\.row \.act\.raid\s*\{[^}]*min-height:\s*48px/)
    expect(css).toMatch(/\.row \.act\.dig\s*\{[^}]*min-height:\s*46px/)
  })
})