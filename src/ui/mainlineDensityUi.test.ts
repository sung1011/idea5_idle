import { describe, expect, it } from 'vitest'
import source from './encounterPanel.vue?raw'

function sliceBetween(text: string, start: string, end: string): string {
  const from = text.indexOf(start)
  const to = text.indexOf(end, from + start.length)
  expect(from).toBeGreaterThanOrEqual(0)
  expect(to).toBeGreaterThan(from)
  return text.slice(from, to)
}

describe('mainline density control placement', () => {
  const template = sliceBetween(source, '<template>', '</template>')

  it('keeps 简/详 on the mainline tab row', () => {
    const boardNav = sliceBetween(template, 'class="board-nav"', 'class="chapter-head"')
    expect(boardNav).toContain('aria-label="主线分页"')
    expect(boardNav).toContain('aria-label="主线详略"')
    expect(boardNav).toContain('MAINLINE_DENSITY_LABELS')
  })

  it('does not repeat the density control inside the refresh row', () => {
    const refresh = sliceBetween(template, 'class="row refresh"', 'v-if="buffOn"')
    expect(refresh).not.toContain('density')
    expect(refresh).not.toContain('MAINLINE_DENSITY')
    expect(refresh).not.toContain('订单详略')
    expect(refresh).not.toContain('主线详略')
  })
})
