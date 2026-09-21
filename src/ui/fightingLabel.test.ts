import { describe, expect, it } from 'vitest'
import { FIGHTING_DOT_MS, fightingButtonLabel, fightingDots } from './fightingLabel'

describe('fightingLabel', () => {
  it('cycles one to three dots every 450ms', () => {
    expect(fightingDots(0)).toBe('.')
    expect(fightingDots(FIGHTING_DOT_MS - 1)).toBe('.')
    expect(fightingDots(FIGHTING_DOT_MS)).toBe('..')
    expect(fightingDots(FIGHTING_DOT_MS * 2)).toBe('...')
    expect(fightingDots(FIGHTING_DOT_MS * 3)).toBe('.')
    expect(fightingButtonLabel(0)).toBe('战斗中.')
    expect(fightingButtonLabel(FIGHTING_DOT_MS)).toBe('战斗中..')
    expect(fightingButtonLabel(FIGHTING_DOT_MS * 2)).toBe('战斗中...')
    expect(fightingButtonLabel(FIGHTING_DOT_MS * 3)).toBe('战斗中.')
  })
})
