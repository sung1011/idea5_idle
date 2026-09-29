import { describe, expect, it } from 'vitest'
import { formatHudGrouped, formatHudQty } from './formatHud'

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

  it('groups capsule amounts with thousands separators', () => {
    expect(formatHudGrouped(0)).toBe('0')
    expect(formatHudGrouped(180)).toBe('180')
    expect(formatHudGrouped(2845)).toBe('2,845')
    expect(formatHudGrouped(28455)).toBe('28,455')
    expect(formatHudGrouped(1_250_000)).toBe('1,250,000')
    expect(formatHudGrouped(12.9)).toBe('12')
    expect(formatHudGrouped(-2845)).toBe('-2,845')
    expect(formatHudGrouped(Number.NaN)).toBe('0')
  })

  it('floors dirty numbers and rejects non-finite', () => {
    expect(formatHudQty(12.9)).toBe('12')
    expect(formatHudQty(-125400)).toBe('-125.4K')
    expect(formatHudQty(Number.NaN)).toBe('0')
    expect(formatHudQty(Number.POSITIVE_INFINITY)).toBe('0')
  })
})
