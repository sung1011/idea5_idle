import { describe, expect, it } from 'vitest'
import { formatAtkSpeed } from './formatAtkSpeed'

describe('formatAtkSpeed', () => {
  it('turns interval seconds into a higher-is-better integer', () => {
    expect(formatAtkSpeed(1)).toBe(1000)
    expect(formatAtkSpeed(2)).toBe(500)
    expect(formatAtkSpeed(5)).toBe(200)
    expect(formatAtkSpeed(10)).toBe(100)
    expect(formatAtkSpeed(20)).toBe(50)
    expect(formatAtkSpeed(30)).toBe(33)
  })

  it('rejects non-positive or dirty intervals', () => {
    expect(formatAtkSpeed(0)).toBe(0)
    expect(formatAtkSpeed(-4)).toBe(0)
    expect(formatAtkSpeed(Number.NaN)).toBe(0)
    expect(formatAtkSpeed(Number.POSITIVE_INFINITY)).toBe(0)
  })
})
