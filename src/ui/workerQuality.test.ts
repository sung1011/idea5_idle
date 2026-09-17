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
})
