import { describe, expect, it } from 'vitest'
import { assignWorker } from './assign'
import { bankQty } from './bank'
import { createSave } from './createSave'
import { collectHints, isResonating } from './query'
import { recruitWorker } from './recruit'
import { stationSpeed } from './tables'
import { ticks } from './tick'
import type { Save } from './types'

function roster(n: number): Save {
  const save = createSave()
  save.gold = 15 * n
  for (let i = 0; i < n; i++) {
    const result = recruitWorker(save)
    expect(result.ok).toBe(true)
  }
  return save
}

describe('stackFactor / stationSpeed', () => {
  it('3 workers are 3x as fast as 1 worker', () => {
    expect(stationSpeed(1, 5)).toBeCloseTo(0.2)
    expect(stationSpeed(3, 5)).toBeCloseTo(0.6)
    expect(stationSpeed(3, 5)).toBeCloseTo(stationSpeed(1, 5) * 3)
  })
})

describe('mining → bank', () => {
  it('one miner deposits ore after one cycle', () => {
    const save = roster(1)
    assignWorker(save, save.workers[0].id, 'mining')
    const next = ticks(save, 5)
    expect(bankQty(next, 'ore')).toBe(1)
    expect(next.stations.mining.completed).toBe(1)
    expect(next.stations.mining.progress).toBeCloseTo(0)
  })

  it('three miners produce 3x ore in the same time', () => {
    const one = roster(1)
    assignWorker(one, one.workers[0].id, 'mining')
    const three = roster(3)
    for (const w of three.workers) assignWorker(three, w.id, 'mining')

    const a = ticks(one, 5)
    const b = ticks(three, 5)
    expect(bankQty(a, 'ore')).toBe(1)
    expect(bankQty(b, 'ore')).toBe(3)
    expect(b.stations.mining.completed).toBe(3)
  })
})

describe('forging pipeline', () => {
  it('consumes ore and deposits a weapon', () => {
    const save = roster(1)
    save.bank.ore = 1
    assignWorker(save, save.workers[0].id, 'forging')
    const next = ticks(save, 8)
    expect(bankQty(next, 'ore')).toBe(0)
    expect(bankQty(next, 'weapon')).toBe(1)
    expect(next.stations.forging.completed).toBe(1)
    expect(next.stations.forging.stallReason).toBeNull()
  })

  it('idles with a hint when there is no ore', () => {
    const save = roster(1)
    assignWorker(save, save.workers[0].id, 'forging')
    const next = ticks(save, 8)
    expect(bankQty(next, 'weapon')).toBe(0)
    expect(next.stations.forging.completed).toBe(0)
    expect(next.stations.forging.progress).toBe(0)
    expect(next.stations.forging.stallReason).toBe('emptyInput')
    const hints = collectHints(next)
    expect(hints.some((h) => h.kind === 'bottleneck' && h.text.includes('见底'))).toBe(true)
  })
})

describe('resonance', () => {
  it('detects mining + forging when both have workers', () => {
    const save = roster(2)
    assignWorker(save, save.workers[0].id, 'mining')
    expect(isResonating(save, 'mining', 'forging')).toBe(false)
    assignWorker(save, save.workers[1].id, 'forging')
    expect(isResonating(save, 'mining', 'forging')).toBe(true)
    expect(collectHints(save).some((h) => h.kind === 'resonance')).toBe(true)
  })
})
