import { describe, expect, it } from 'vitest'
import { spawnWorkerWith } from '../sim/recruit'
import { createSave } from '../sim/createSave'
import { WORKER_QUALITY_TABLE } from '../sim/tables'
import type { QualityTier } from '../sim/types'
import {
  qualityInk,
  qualityOf,
  workerQualityBadgeStyle,
  workerQualityCardStyle,
  workerQualityDotStyle,
  workerQualityNameStyle,
  workerQualityTileStyle,
  workerQualityToneClass,
} from './workerQuality'

function workerAt(tier: QualityTier) {
  const save = createSave()
  const worker = spawnWorkerWith(save, tier, 'laborer')
  return worker
}

describe('workerQuality', () => {
  it('uses WORKER_QUALITY_TABLE color and label for the badge', () => {
    const green = workerAt(2)
    expect(qualityOf(green)).toEqual(WORKER_QUALITY_TABLE[2])
    expect(workerQualityBadgeStyle(green)).toMatchObject({
      background: '#3e9a2a',
      borderColor: '#3e9a2a',
      color: '#fffdf8',
    })
    expect(workerQualityCardStyle(green).borderColor).toBe('#3e9a2a')
  })

  it('uses dark ink on light quality chips', () => {
    expect(qualityInk(workerAt(1))).toBe('#5a3a10')
    expect(qualityInk(workerAt(4))).toBe('#5a3a10')
    expect(qualityInk(workerAt(7))).toBe('#5a3a10')
    expect(qualityInk(workerAt(9))).toBe('#5a3a10')
    expect(qualityInk(workerAt(8))).toBe('#fffdf8')
  })

  it('marks pink and rainbow cards', () => {
    expect(workerQualityToneClass(workerAt(7))).toEqual({ rainbow: false, pink: true })
    expect(workerQualityToneClass(workerAt(10))).toEqual({ rainbow: true, pink: false })
    expect(workerQualityToneClass(workerAt(2))).toEqual({ rainbow: false, pink: false })
  })

  it('colors pick-list names with table color, dark brown on white', () => {
    expect(workerQualityNameStyle(workerAt(1))).toEqual({ color: '#5a3a10' })
    expect(workerQualityNameStyle(workerAt(2))).toEqual({ color: WORKER_QUALITY_TABLE[2].color })
    expect(workerQualityNameStyle(workerAt(7))).toEqual({ color: WORKER_QUALITY_TABLE[7].color })
    expect(workerQualityNameStyle(workerAt(9))).toEqual({ color: WORKER_QUALITY_TABLE[9].color })
    expect(workerQualityNameStyle(workerAt(10))).toEqual({ color: WORKER_QUALITY_TABLE[10].color })
  })

  it('paints roster tiles and group dots from the 10-tier table', () => {
    expect(workerQualityDotStyle(2)).toEqual({ background: WORKER_QUALITY_TABLE[2].color })
    expect(workerQualityDotStyle(10).background).toContain('linear-gradient')
    expect(workerQualityTileStyle(workerAt(6))).toMatchObject({
      borderColor: WORKER_QUALITY_TABLE[6].color,
      color: '#b85a08',
    })
    expect(workerQualityTileStyle(workerAt(10)).background).toContain('135deg')
  })
})
