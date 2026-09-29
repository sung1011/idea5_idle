import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import actButton from './actButton.vue?raw'
import { ACT_ICON_IDS, ACT_ICON_PATHS, allActIconsReady, actIconPaths } from './actIcons'
import encounter from './encounterPanel.vue?raw'
import herb from './herbPvpPanel.vue?raw'
import sheet from './combatPickSheet.vue?raw'
import { BATTLEFIELD_ACTS, MARKET_ACTS, MARKET_DONE_ACT, orderActsValid } from './orderAct'

const tokens = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')

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

function sliceKind(kind: string): string {
  const start = encounter.indexOf(`enc.kind === '${kind}'`)
  const end = encounter.indexOf('</template>', start)
  return encounter.slice(start, end)
}

describe('order action buttons', () => {
  it('gives every action icon its own path', () => {
    expect(allActIconsReady()).toBe(true)
    expect(Object.keys(ACT_ICON_PATHS).sort()).toEqual([...ACT_ICON_IDS].sort())
    const signatures = ACT_ICON_IDS.map((id) => actIconPaths(id).join('|'))
    expect(new Set(signatures).size).toBe(ACT_ICON_IDS.length)
    for (const id of ACT_ICON_IDS) {
      for (const d of actIconPaths(id)) {
        expect(d.length).toBeGreaterThan(8)
        expect(pathCommandsValid(d)).toBe(true)
      }
    }
  })

  it('classifies battlefield and market buttons, with one primary tone each', () => {
    expect(orderActsValid()).toBe(true)
    const primaries = [
      ...Object.values(BATTLEFIELD_ACTS),
      ...Object.values(MARKET_ACTS),
      ...Object.values(MARKET_DONE_ACT),
    ].filter((row) => row.kind === 'primary')
    expect(primaries.every((row) => row.tone === 'combat' || row.tone === 'gain' || row.tone === 'produce')).toBe(true)
    expect(BATTLEFIELD_ACTS.start.tone).toBe('combat')
    expect(BATTLEFIELD_ACTS.reinforce.tone).toBe('combat')
    expect(BATTLEFIELD_ACTS.loot.tone).toBe('gain')
    expect(BATTLEFIELD_ACTS.chest.tone).toBe('gain')
    expect(MARKET_ACTS.artisan.tone).toBe('gain')
    expect(BATTLEFIELD_ACTS.explore.kind).toBe('minor')
    expect(BATTLEFIELD_ACTS.explore.cost).toBe(true)
    expect(MARKET_ACTS.buy.cost).toBe(true)
    expect(encounter).not.toContain('kind="danger"')
    for (const key of Object.keys(BATTLEFIELD_ACTS)) {
      expect(encounter).toContain(`BATTLEFIELD_ACTS.${key}`)
    }
    for (const key of Object.keys(MARKET_ACTS)) {
      expect(encounter).toContain(`MARKET_ACTS.${key}`)
    }
    for (const kind of ['blackMerchant', 'passerby', 'pawn', 'artisan', 'bulkBuy']) {
      const block = sliceKind(kind)
      expect(block.match(/:kind=/g)?.length).toBe(1)
    }
    const enemy = encounter.slice(
      encounter.indexOf("enc.kind === 'enemy'"),
      encounter.indexOf('<template v-else>'),
    )
    expect(enemy).toContain("enemyCardButton(enc) === 'claimed'")
    expect(enemy).toContain('v-else-if')
    expect(enemy).toContain('v-else')
    expect(encounter).toContain('<HelpMark')
    expect(encounter).not.toContain('BATTLEFIELD_ACTS.help')
    expect(encounter).toContain('`${cost} 金`')
    expect(encounter).toContain('`${enc.buyGold} 金`')
    expect(encounter).toContain('class="affix-chip"')
    expect(encounter).toContain('BATTLEFIELD_ACTS.affix.icon')
    const tabs = encounter.slice(encounter.indexOf('aria-label="PVE分页"'), encounter.indexOf('</nav>'))
    expect(tabs).not.toContain('ActButton')
  })

  it('pins cost to the right and grays a finished primary', () => {
    expect(actButton).toContain('class="cost"')
    expect(actButton).toContain('· {{ cost }}')
    expect(tokens).toMatch(/button\.act \.cost\s*\{[^}]*margin-left:\s*auto/)
    expect(tokens).toMatch(/button\.act\.primary\.combat:disabled[\s\S]*background:\s*var\(--btn-on\)/)
    expect(tokens).toMatch(/button\.act\.danger\s*\{[^}]*#b42318/)
    expect(tokens).toMatch(/button\.act\.primary\.gain\s*\{[^}]*#3d8a34/)
  })

  it('keeps the shared pick confirm plain unless the page passes a tone', () => {
    expect(sheet).toContain('{{ sheetConfirm }}')
    expect(sheet).toContain('confirmTone ?')
    expect(encounter).toContain('confirm-tone')
    expect(herb).not.toContain('confirm-tone')
    expect(herb).not.toContain('confirm-icon')
    expect(herb).toContain('confirm-text="除草"')
  })
})
