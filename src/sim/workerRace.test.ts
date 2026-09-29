import { describe, expect, it } from 'vitest'
import { WORKER_RACE_IDS } from './types'
import { WORKER_RACE_LABEL, WORKER_RACE_NAMES, WORKER_RACE_SHORT_LABEL } from './workerRace'

describe('worker race catalog', () => {
  it('gives every race a label, a short label, and ten unique names', () => {
    const seen = new Set<string>()
    for (const id of WORKER_RACE_IDS) {
      expect(WORKER_RACE_LABEL[id].length).toBeGreaterThan(0)
      expect(WORKER_RACE_SHORT_LABEL[id].length).toBeGreaterThan(0)
      const names = [...WORKER_RACE_NAMES[id]]
      expect(names).toHaveLength(10)
      expect(names.every((name) => name.trim().length > 0)).toBe(true)
      expect(new Set(names).size).toBe(names.length)
      for (const name of names) {
        expect(seen.has(name)).toBe(false)
        seen.add(name)
      }
    }
    expect(WORKER_RACE_SHORT_LABEL.highmountainTauren).toBe('至高岭')
    expect(WORKER_RACE_SHORT_LABEL.magharOrc).toBe('玛格汉')
    expect(WORKER_RACE_SHORT_LABEL.zandalariTroll).toBe('赞达拉')
    expect(WORKER_RACE_LABEL.highmountainTauren).toBe('至高岭牛头人')
    expect(WORKER_RACE_LABEL.magharOrc).toBe('玛格汉兽人')
    expect(WORKER_RACE_LABEL.zandalariTroll).toBe('赞达拉巨魔')
  })
})