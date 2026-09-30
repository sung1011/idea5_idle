import { describe, expect, it } from 'vitest'
import { pvpRankDiamonds } from './pvpRankDiamonds'

describe('pvp rank diamonds', () => {
  it('pays the four bands and nothing outside the board', () => {
    expect(pvpRankDiamonds(1)).toBe(20)
    expect(pvpRankDiamonds(2)).toBe(12)
    expect(pvpRankDiamonds(3)).toBe(12)
    expect(pvpRankDiamonds(4)).toBe(8)
    expect(pvpRankDiamonds(10)).toBe(8)
    expect(pvpRankDiamonds(11)).toBe(4)
    expect(pvpRankDiamonds(50)).toBe(4)
    expect(pvpRankDiamonds(51)).toBe(0)
    expect(pvpRankDiamonds(0)).toBe(0)
  })
})
