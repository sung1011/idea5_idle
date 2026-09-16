import { describe, expect, it } from 'vitest'
import { createSave, normalizeDiamonds } from './createSave'
import { START_DIAMONDS, START_GOLD } from './tables'

describe('createSave diamonds', () => {
  it('starts diamonds at 0 as a premium-token placeholder', () => {
    const save = createSave()
    expect(save.diamonds).toBe(START_DIAMONDS)
    expect(save.diamonds).toBe(0)
    expect(save.gold).toBe(START_GOLD)
  })

  it('normalizes missing or dirty diamonds back to 0', () => {
    expect(normalizeDiamonds(undefined)).toBe(0)
    expect(normalizeDiamonds(null)).toBe(0)
    expect(normalizeDiamonds(-3)).toBe(0)
    expect(normalizeDiamonds(Number.NaN)).toBe(0)
    expect(normalizeDiamonds(4.8)).toBe(4)
  })
})
