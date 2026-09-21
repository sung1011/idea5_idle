import { describe, expect, it } from 'vitest'
import { formatAtkSpeed } from './formatAtkSpeed'

describe('formatAtkSpeed', () => {
  it('shows interval seconds with an s suffix', () => {
    expect(formatAtkSpeed(1)).toBe('1s')
    expect(formatAtkSpeed(3)).toBe('3s')
    expect(formatAtkSpeed(5)).toBe('5s')
    expect(formatAtkSpeed(10)).toBe('10s')
    expect(formatAtkSpeed(20)).toBe('20s')
    expect(formatAtkSpeed(30)).toBe('30s')
    expect(formatAtkSpeed(1.5)).toBe('1.5s')
    expect(formatAtkSpeed(4.56)).toBe('4.6s')
  })

  it('rejects non-positive or dirty intervals', () => {
    expect(formatAtkSpeed(0)).toBe('0s')
    expect(formatAtkSpeed(-4)).toBe('0s')
    expect(formatAtkSpeed(Number.NaN)).toBe('0s')
    expect(formatAtkSpeed(Number.POSITIVE_INFINITY)).toBe('0s')
  })
})
