import { describe, expect, it } from 'vitest'
import { formatHudQty } from './formatHud'

describe('formatHudQty', () => {
  it('keeps small counts raw so diamonds and workers stay readable', () => {
    expect(formatHudQty(0)).toBe('0')
    expect(formatHudQty(18)).toBe('18')
    expect(formatHudQty(37)).toBe('37')
    expect(formatHudQty(28455)).toBe('28455')
    expect(formatHudQty(99999)).toBe('99999')
  })

  it('compacts large gold-style counts with one decimal K/M/B', () => {
    expect(formatHudQty(100000)).toBe('100K')
    expect(formatHudQty(125400)).toBe('125.4K')
    expect(formatHudQty(1_250_000)).toBe('1.3M')
    expect(formatHudQty(1_000_000_000)).toBe('1B')
  })

  it('floors dirty numbers and rejects non-finite', () => {
    expect(formatHudQty(12.9)).toBe('12')
    expect(formatHudQty(-125400)).toBe('-125.4K')
    expect(formatHudQty(Number.NaN)).toBe('0')
    expect(formatHudQty(Number.POSITIVE_INFINITY)).toBe('0')
  })
})
