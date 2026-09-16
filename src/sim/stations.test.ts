import { afterEach, describe, expect, it } from 'vitest'
import { assignWorker } from './assign'
import { bankQty } from './bank'
import { createSave } from './createSave'
import { collectHints, isResonating } from './query'
import { recruitWorker } from './recruit'
import { setRollOverride } from './rng'
import { PLAYABLE_STATION_IDS, STATION_DEF, STATION_IDS, stationSpeed } from './tables'
import { ticks } from './tick'
import type { Save } from './types'

afterEach(() => {
  setRollOverride(null)
})

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

describe('woodcutting hidden', () => {
  it('is not a playable or ticking station', () => {
    expect((STATION_DEF as Record<string, unknown>).woodcutting).toBeUndefined()
    expect(STATION_IDS.includes('woodcutting' as never)).toBe(false)
    expect(PLAYABLE_STATION_IDS.includes('woodcutting' as never)).toBe(false)
  })

  it('rejects assigning to the deprecated station', () => {
    const save = roster(1)
    const result = assignWorker(save, save.workers[0].id, 'woodcutting' as never)
    expect(result.ok).toBe(false)
    expect(save.workers[0].assignment).toBeNull()
    expect(bankQty(ticks(save, 20), 'wood')).toBe(0)
  })
})

describe('hunting / herbalism / alchemy', () => {
  it('one hunter deposits meat after one cycle', () => {
    setRollOverride(() => 0.9)
    const save = roster(1)
    assignWorker(save, save.workers[0].id, 'hunting')
    const next = ticks(save, 24)
    expect(bankQty(next, 'meat')).toBe(1)
    expect(next.stations.hunting.completed).toBe(1)
  })

  it('one herbalist deposits herb after one cycle', () => {
    setRollOverride(() => 0.1)
    const save = roster(1)
    assignWorker(save, save.workers[0].id, 'herbalism')
    const next = ticks(save, 20)
    expect(bankQty(next, 'herb')).toBe(1)
    expect(next.stations.herbalism.completed).toBe(1)
  })

  it('alchemy consumes herb and deposits a potion placeholder', () => {
    const save = roster(1)
    save.bank.herb = 1
    assignWorker(save, save.workers[0].id, 'alchemy')
    const next = ticks(save, 40)
    expect(bankQty(next, 'herb')).toBe(0)
    expect(bankQty(next, 'potion')).toBe(1)
    expect(next.stations.alchemy.completed).toBe(1)
    expect(next.stations.alchemy.craftNotice).toContain('草')
  })
})

describe('fishing → bank', () => {
  it('one fisher deposits fish after one cycle', () => {
    setRollOverride(() => 0.5)
    const save = roster(1)
    assignWorker(save, save.workers[0].id, 'fishing')
    const next = ticks(save, 28)
    expect(bankQty(next, 'fish')).toBe(1)
    expect(next.stations.fishing.completed).toBe(1)
    expect(next.stations.fishing.progress).toBeCloseTo(0)
  })

  it('three fishers produce 3x fish in the same time', () => {
    setRollOverride(() => 0.5)
    const one = roster(1)
    assignWorker(one, one.workers[0].id, 'fishing')
    const three = roster(3)
    for (const w of three.workers) assignWorker(three, w.id, 'fishing')

    const a = ticks(one, 28)
    const b = ticks(three, 28)
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

  it('consumes meat and deposits roast', () => {
    const save = roster(1)
    save.stations.cooking.selectedCategory = 'iron'
    save.bank.meat = 1
    assignWorker(save, save.workers[0].id, 'cooking')
    const next = ticks(save, 28)
    expect(bankQty(next, 'meat')).toBe(0)
    expect(bankQty(next, 'roast')).toBe(1)
    expect(next.stations.cooking.completed).toBe(1)
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
  it('consumes ore and deposits a tool', () => {
    setRollOverride(() => 0.99)
    const save = roster(1)
    save.bank.ore = 1
    assignWorker(save, save.workers[0].id, 'forging')
    const next = ticks(save, 32)
    expect(bankQty(next, 'ore')).toBe(0)
    expect(bankQty(next, 'tool')).toBe(1)
    expect(bankQty(next, 'weapon')).toBe(0)
    expect(next.stations.forging.completed).toBe(1)
    expect(next.stations.forging.stallReason).toBeNull()
  })

  it('idles with a hint when there is no ore', () => {
    const save = roster(1)
    assignWorker(save, save.workers[0].id, 'forging')
    const next = ticks(save, 32)
    expect(bankQty(next, 'tool')).toBe(0)
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

  it('detects hunting + cooking when both have workers', () => {
    const save = roster(2)
    assignWorker(save, save.workers[0].id, 'hunting')
    expect(isResonating(save, 'hunting', 'cooking')).toBe(false)
    assignWorker(save, save.workers[1].id, 'cooking')
    expect(isResonating(save, 'hunting', 'cooking')).toBe(true)
    expect(collectHints(save).some((h) => h.kind === 'resonance' && h.text.includes('狩猎'))).toBe(true)
  })

  it('detects herbalism + alchemy when both have workers', () => {
    const save = roster(2)
    assignWorker(save, save.workers[0].id, 'herbalism')
    assignWorker(save, save.workers[1].id, 'alchemy')
    expect(isResonating(save, 'herbalism', 'alchemy')).toBe(true)
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
    setRollOverride(() => 0.5)
    const alone = roster(1)
    assignWorker(alone, alone.workers[0].id, 'fishing')
    const pair = roster(2)
    assignWorker(pair, pair.workers[0].id, 'fishing')
    assignWorker(pair, pair.workers[1].id, 'cooking')

    const a = ticks(alone, 24)
    const b = ticks(pair, 24)
    expect(a.stations.fishing.completed).toBe(0)
    expect(a.stations.fishing.progress).toBeCloseTo(24 / 28)
    expect(bankQty(b, 'fish')).toBe(1)
    expect(b.stations.fishing.completed).toBe(1)
  })
})
