import { describe, expect, it } from 'vitest'
import { hpBarFill, hpBarLabel, hpBarTone, shouldShakeHpBar } from './hpBar'
import hpBarSource from './hpBar.vue?raw'

describe('hpBarFill', () => {
  it('fills by hp/hpMax and caps at 1', () => {
    expect(hpBarFill(0, 24)).toBe(0)
    expect(hpBarFill(12, 24)).toBe(0.5)
    expect(hpBarFill(24, 24)).toBe(1)
    expect(hpBarFill(30, 24)).toBe(1)
  })

  it('treats empty or dirty max as empty bar', () => {
    expect(hpBarFill(8, 0)).toBe(0)
    expect(hpBarFill(8, -4)).toBe(0)
    expect(hpBarFill(Number.NaN, 24)).toBe(0)
    expect(hpBarFill(8, Number.NaN)).toBe(0)
  })
})

describe('hpBarLabel', () => {
  it('always shows HP: hp/hpMax, even when over cap', () => {
    expect(hpBarLabel(12, 24)).toBe('HP: 12/24')
    expect(hpBarLabel(30, 24)).toBe('HP: 30/24')
    expect(hpBarLabel(0, 24)).toBe('HP: 0/24')
  })
})

describe('shouldShakeHpBar', () => {
  it('fires only when the shake key advances', () => {
    expect(shouldShakeHpBar(undefined, 1)).toBe(true)
    expect(shouldShakeHpBar(1, 2)).toBe(true)
    expect(shouldShakeHpBar(2, 2)).toBe(false)
    expect(shouldShakeHpBar(1, 0)).toBe(false)
    expect(shouldShakeHpBar(undefined, undefined)).toBe(false)
  })
})

describe('enemy hp bar skin', () => {
  it('uses a dark cool track and a bright crimson fill, leaving the ally green bar alone', () => {
    const enemy = hpBarSource.slice(hpBarSource.indexOf('.hp.enemy {'), hpBarSource.indexOf('.hp.enemy span'))
    expect(enemy).toContain('background: #2a222e')
    expect(enemy).toContain('#ff8a80')
    expect(enemy).toContain('#e84a4a')
    expect(enemy).toContain('#c62828')
    expect(enemy).toContain('clip-path: polygon')
    expect(enemy).toContain('.hp.enemy.mid .fill')
    expect(enemy).toContain('.hp.enemy.low .fill')
    expect(hpBarSource).toContain('linear-gradient(90deg, #6fc43a, #2d7a1c)')
    expect(hpBarSource).toContain('color: #fff4ea')
    const ally = hpBarSource.slice(hpBarSource.indexOf('.hp {'), hpBarSource.indexOf('.hp.enemy {'))
    expect(ally).not.toContain('#ff8a80')
    expect(ally).not.toContain('#2a222e')
  })
})

describe('hpBarTone', () => {
  it('uses green when full or over cap, red when low', () => {
    expect(hpBarTone(24, 24)).toBe('full')
    expect(hpBarTone(30, 24)).toBe('full')
    expect(hpBarTone(8, 24)).toBe('low')
    expect(hpBarTone(16, 24)).toBe('mid')
  })
})
