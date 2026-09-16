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
    expect(stationSpeed(1, 20)).toBeCloseTo(0.05)
    expect(stationSpeed(3, 20)).toBeCloseTo(0.15)
    expect(stationSpeed(3, 20)).toBeCloseTo(stationSpeed(1, 20) * 3)
  })
})

describe('mining → bank', () => {
  it('one miner deposits ore after one cycle', () => {
    const save = roster(1)
    assignWorker(save, save.workers[0].id, 'mining')
    const next = ticks(save, 20)
    expect(bankQty(next, 'ore')).toBe(1)
    expect(next.stations.mining.completed).toBe(1)
    expect(next.stations.mining.progress).toBeCloseTo(0)
  })

  it('three miners produce 3x ore in the same time', () => {
    const one = roster(1)
    assignWorker(one, one.workers[0].id, 'mining')
    const three = roster(3)
    for (const w of three.workers) assignWorker(three, w.id, 'mining')

    const a = ticks(one, 20)
    const b = ticks(three, 20)
    expect(bankQty(a, 'ore')).toBe(1)
    expect(bankQty(b, 'ore')).toBe(3)
    expect(b.stations.mining.completed).toBe(3)
  })

  it('keeps mining after stock exceeds the old bank cap', () => {
    const save = roster(1)
    save.bank.ore = 200
    assignWorker(save, save.workers[0].id, 'mining')
    const next = ticks(save, 20)
    expect(bankQty(next, 'ore')).toBe(201)
    expect(next.stations.mining.completed).toBe(1)
    expect(next.stations.mining.stallReason).toBeNull()
    expect(collectHints(next).some((h) => h.text.includes('堆满'))).toBe(false)
  })
})

describe('woodcutting → bank', () => {
  it('one woodcutter deposits wood after one cycle', () => {
    const save = roster(1)
    assignWorker(save, save.workers[0].id, 'woodcutting')
    const next = ticks(save, 20)
    expect(bankQty(next, 'wood')).toBe(1)
    expect(next.stations.woodcutting.completed).toBe(1)
    expect(next.stations.woodcutting.progress).toBeCloseTo(0)
  })

  it('three woodcutters produce 3x wood in the same time', () => {
    const one = roster(1)
    assignWorker(one, one.workers[0].id, 'woodcutting')
    const three = roster(3)
    for (const w of three.workers) assignWorker(three, w.id, 'woodcutting')

    const a = ticks(one, 20)
    const b = ticks(three, 20)
    expect(bankQty(a, 'wood')).toBe(1)
    expect(bankQty(b, 'wood')).toBe(3)
    expect(b.stations.woodcutting.completed).toBe(3)
  })
})

describe('fishing → bank', () => {
  it('one fisher deposits fish after one cycle', () => {
    const save = roster(1)
    assignWorker(save, save.workers[0].id, 'fishing')
    const next = ticks(save, 24)
    expect(bankQty(next, 'fish')).toBe(1)
    expect(next.stations.fishing.completed).toBe(1)
    expect(next.stations.fishing.progress).toBeCloseTo(0)
  })

  it('three fishers produce 3x fish in the same time', () => {
    const one = roster(1)
    assignWorker(one, one.workers[0].id, 'fishing')
    const three = roster(3)
    for (const w of three.workers) assignWorker(three, w.id, 'fishing')

    const a = ticks(one, 24)
    const b = ticks(three, 24)
    expect(bankQty(a, 'fish')).toBe(1)
    expect(bankQty(b, 'fish')).toBe(3)
    expect(b.stations.fishing.completed).toBe(3)
  })
})

describe('cooking pipeline', () => {
  it('consumes fish and deposits a meal', () => {
    const save = roster(1)
    save.bank.fish = 1
    assignWorker(save, save.workers[0].id, 'cooking')
    const next = ticks(save, 28)
    expect(bankQty(next, 'fish')).toBe(0)
    expect(bankQty(next, 'meal')).toBe(1)
    expect(next.stations.cooking.completed).toBe(1)
    expect(next.stations.cooking.stallReason).toBeNull()
  })

  it('idles with a hint when there is no fish', () => {
    const save = roster(1)
    assignWorker(save, save.workers[0].id, 'cooking')
    const next = ticks(save, 28)
    expect(bankQty(next, 'meal')).toBe(0)
    expect(next.stations.cooking.completed).toBe(0)
    expect(next.stations.cooking.progress).toBe(0)
    expect(next.stations.cooking.stallReason).toBe('emptyInput')
    const hints = collectHints(next)
    expect(hints.some((h) => h.kind === 'bottleneck' && h.text.includes('见底'))).toBe(true)
  })
})

describe('forging pipeline', () => {
  it('consumes ore and deposits a weapon', () => {
    const save = roster(1)
    save.bank.ore = 1
    assignWorker(save, save.workers[0].id, 'forging')
    const next = ticks(save, 32)
    expect(bankQty(next, 'ore')).toBe(0)
    expect(bankQty(next, 'weapon')).toBe(1)
    expect(next.stations.forging.completed).toBe(1)
    expect(next.stations.forging.stallReason).toBeNull()
  })

  it('idles with a hint when there is no ore', () => {
    const save = roster(1)
    assignWorker(save, save.workers[0].id, 'forging')
    const next = ticks(save, 32)
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

  it('detects fishing + cooking when both have workers', () => {
    const save = roster(2)
    assignWorker(save, save.workers[0].id, 'fishing')
    expect(isResonating(save, 'fishing', 'cooking')).toBe(false)
    assignWorker(save, save.workers[1].id, 'cooking')
    expect(isResonating(save, 'fishing', 'cooking')).toBe(true)
    expect(collectHints(save).some((h) => h.kind === 'resonance' && h.text.includes('钓鱼'))).toBe(true)
  })

  it('speeds fishing when cooking also has a worker', () => {
    const alone = roster(1)
    assignWorker(alone, alone.workers[0].id, 'fishing')
    const pair = roster(2)
    assignWorker(pair, pair.workers[0].id, 'fishing')
    assignWorker(pair, pair.workers[1].id, 'cooking')

    const a = ticks(alone, 20)
    const b = ticks(pair, 20)
    expect(a.stations.fishing.completed).toBe(0)
    expect(a.stations.fishing.progress).toBeCloseTo(20 / 24)
    expect(bankQty(b, 'fish')).toBe(1)
    expect(b.stations.fishing.completed).toBe(1)
  })
})
