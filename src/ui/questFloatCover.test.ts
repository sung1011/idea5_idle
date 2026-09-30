import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import floatSource from './guideQuestFloat.vue?raw'
import settingsSource from './settingsPanel.vue?raw'
import detailSource from './stationDetailSheet.vue?raw'
import workersSource from './workersPanelV2.vue?raw'

const tokenSource = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')
import { questHeadPadPx, type Box } from './questFloatCover'

function box(partial: Partial<Box> & Pick<Box, 'left' | 'top' | 'width' | 'height'>): Box {
  return {
    right: partial.left + partial.width,
    bottom: partial.top + partial.height,
    ...partial,
  }
}

describe('quest head clearance', () => {
  const quest = box({ left: 8, top: 480, width: 210, height: 96 })

  it('leaves the panel alone when the quest bar misses the header buttons', () => {
    const close = box({ left: 320, top: 120, width: 32, height: 32 })
    expect(questHeadPadPx({ quest, buttons: [close], appliedPad: 0, growsUp: true })).toBe(0)
  })

  it('reserves the quest bar height when a top button sits under it', () => {
    const close = box({ left: 40, top: 500, width: 32, height: 32 })
    expect(questHeadPadPx({ quest, buttons: [close], appliedPad: 0, growsUp: true })).toBe(quest.height)
  })

  it('keeps the pad after a bottom sheet grows upward and the button clears the bar', () => {
    const close = box({ left: 40, top: 500 - quest.height, width: 32, height: 32 })
    expect(questHeadPadPx({ quest, buttons: [close], appliedPad: quest.height, growsUp: true })).toBe(quest.height)
  })

  it('keeps the pad after a top-aligned header is pushed down clear of the bar', () => {
    const close = box({ left: 40, top: 500 + quest.height, width: 32, height: 32 })
    expect(questHeadPadPx({ quest, buttons: [close], appliedPad: quest.height, growsUp: false })).toBe(quest.height)
  })

  it('drops the pad once the button would miss the bar without it', () => {
    const close = box({ left: 40, top: 200, width: 32, height: 32 })
    expect(questHeadPadPx({ quest, buttons: [close], appliedPad: quest.height, growsUp: true })).toBe(0)
  })
})

describe('quest float layer', () => {
  it('stacks the quest bar above panels and keeps confirms and guide hints above it', () => {
    expect(tokenSource).toMatch(/--z-sheet:\s*30/)
    expect(tokenSource).toMatch(/--z-quest:\s*60/)
    expect(tokenSource).toMatch(/--z-confirm:\s*80/)
    expect(tokenSource).toMatch(/--z-guide:\s*90/)
    expect(tokenSource.indexOf('--z-quest:')).toBeLessThan(tokenSource.indexOf('--z-confirm:'))
    expect(tokenSource.indexOf('--z-confirm:')).toBeLessThan(tokenSource.indexOf('--z-guide:'))
    expect(tokenSource).toContain('.guide-mask')
    expect(tokenSource).toContain('.guide-finger')
    expect(floatSource).toContain('z-index: var(--z-quest)')
    expect(floatSource).toContain('bindQuestHeadPad')
    expect(settingsSource).toContain('z-index: var(--z-confirm)')
    expect(settingsSource).toContain('Teleport to="body"')
    expect(detailSource).not.toContain('class="seal-ask-layer"')
    expect(detailSource).toContain('z-index: var(--z-sheet)')
    expect(workersSource).toContain('z-index: calc(var(--z-quest) - 1)')
    expect(workersSource).not.toContain('z-index: 80')
  })
})
