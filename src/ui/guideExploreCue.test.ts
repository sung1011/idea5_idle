import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import appSource from './app.vue?raw'
import panelSource from './encounterPanel.vue?raw'
import { guideExploreCue } from './guideExploreCue'

const tokenSource = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')

describe('guideExploreCue', () => {
  it('circles the dock until the battlefield explore button is on screen', () => {
    expect(guideExploreCue(false, false, 'battlefield')).toBeNull()
    expect(guideExploreCue(true, false, 'battlefield')).toBe('dock')
    expect(guideExploreCue(true, false, 'dungeon')).toBe('dock')
    expect(guideExploreCue(true, true, 'dungeon')).toBe('board')
    expect(guideExploreCue(true, true, 'market')).toBe('board')
    expect(guideExploreCue(true, true, 'battlefield')).toBe('explore')
  })

  it('wires the dock PVE button and the bounty explore button to one cue', () => {
    expect(appSource).toContain('guideExploreCue')
    expect(appSource).toContain("exploreCue === 'dock' && t.id === 'encounters'")
    expect(appSource).toContain('class="guide-mask"')
    expect(appSource).toContain('class="guide-finger"')
    expect(panelSource).toContain('guideExploreCue')
    expect(panelSource).toContain("exploreCue === 'board' && id === 'battlefield'")
    expect(panelSource).toContain("exploreCue === 'explore'")
    expect(panelSource).toContain('BATTLEFIELD_ACTS.explore')
  })
})

describe('guide flash chrome', () => {
  it('uses a thick bright orange ring, a dim mask, and a bobbing finger', () => {
    expect(tokenSource).toMatch(/--z-guide-dim:\s*7/)
    expect(tokenSource).toContain('outline: 5px solid #ffe08a')
    expect(tokenSource).toContain('animation: guide-flash 0.65s ease-in-out infinite')
    expect(tokenSource).toContain('rgba(255, 128, 0, 0.98)')
    expect(tokenSource).toContain('background: rgba(28, 16, 8, 0.48)')
    expect(tokenSource).toContain('pointer-events: none')
    expect(tokenSource).toContain('button.act.minor.guide-flash')
    expect(tokenSource).toContain('.dock button.guide-flash')
    expect(tokenSource).toContain('@keyframes guide-finger-bob')
    expect(tokenSource).toContain('.guide-mask')
    expect(tokenSource).toContain('.guide-finger')
    const reduced = tokenSource.slice(tokenSource.indexOf('prefers-reduced-motion'))
    expect(reduced).toContain('.guide-finger')
  })
})