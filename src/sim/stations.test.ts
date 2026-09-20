import { afterEach, describe, expect, it } from 'vitest'
import { assignWorker } from './assign'
import { bankQty } from './bank'
import { createSave } from './createSave'
import { collectHints } from './query'
import { recruitWorker } from './recruit'
import { setRollOverride } from './rng'
import { PLAYABLE_STATION_IDS, STATION_DEF, STATION_IDS, stationSpeed } from './tables'
import { ticks } from './tick'
import { selectForgeOutput } from './tools'
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

  it('two miners without conflict tech produce like one miner', () => {
    const one = roster(1)
    assignWorker(one, one.workers[0].id, 'mining')
    const two = roster(2)
    for (const w of two.workers) assignWorker(two, w.id, 'mining')

    const a = ticks(one, 20)
    const b = ticks(two, 20)
    expect(bankQty(a, 'ore')).toBe(1)
    expect(bankQty(b, 'ore')).toBe(1)
    expect(b.stations.mining.completed).toBe(1)
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
    expect(bankQty(next, 'fish')).toBe(1)
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

  it('alchemy consumes herb and deposits a random potion batch', () => {
    setRollOverride(() => 0)
    const save = roster(1)
    save.bank.herb = 1
    assignWorker(save, save.workers[0].id, 'alchemy')
    const next = ticks(save, 40)
    expect(bankQty(next, 'herb')).toBe(0)
    expect(bankQty(next, 'stim')).toBe(4)
    expect(bankQty(next, 'potion')).toBe(0)
    expect(next.stations.alchemy.completed).toBe(1)
    expect(next.stations.alchemy.craftNotice).toContain('草')
    expect(next.stations.alchemy.craftNotice).toContain('兴奋剂')
  })
})

describe('fishing hidden', () => {
  it('is not a playable or ticking station', () => {
    expect((STATION_DEF as Record<string, unknown>).fishing).toBeUndefined()
    expect(STATION_IDS.includes('fishing' as never)).toBe(false)
    expect(PLAYABLE_STATION_IDS.includes('fishing' as never)).toBe(false)
  })

  it('rejects assigning to the deprecated station', () => {
    const save = roster(1)
    const result = assignWorker(save, save.workers[0].id, 'fishing' as never)
    expect(result.ok).toBe(false)
    expect(save.workers[0].assignment).toBeNull()
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

describe('empty station progress', () => {
  it('zeros progress as soon as nobody is assigned', () => {
    const save = roster(1)
    assignWorker(save, save.workers[0].id, 'mining')
    const mid = ticks(save, 10)
    expect(mid.stations.mining.progress).toBeGreaterThan(0.4)
    expect(assignWorker(mid, mid.workers[0].id, null).ok).toBe(true)
    expect(mid.stations.mining.progress).toBe(0)
    const next = ticks(mid, 5)
    expect(next.stations.mining.progress).toBe(0)
    expect(next.stations.mining.completed).toBe(0)
    expect(next.stations.mining.stallReason).toBeNull()
  })

  it('keeps leftover progress at 0 on later empty ticks', () => {
    const save = roster(1)
    save.stations.mining.progress = 0.7
    expect(save.workers[0].assignment).toBeNull()
    const next = ticks(save, 3)
    expect(next.stations.mining.progress).toBe(0)
  })
})

describe('forging pipeline', () => {
  it('consumes ore and deposits an exclusive tool', () => {
    setRollOverride(() => 0.99)
    const save = roster(1)
    expect(selectForgeOutput(save, 'miningTool01').ok).toBe(true)
    save.bank.ore = 1
    assignWorker(save, save.workers[0].id, 'forging')
    const next = ticks(save, 32)
    expect(bankQty(next, 'ore')).toBe(0)
    expect(bankQty(next, 'miningTool01')).toBe(1)
    expect(bankQty(next, 'tool')).toBe(0)
    expect(bankQty(next, 'weapon')).toBe(0)
    expect(next.stations.forging.completed).toBe(1)
    expect(next.stations.forging.stallReason).toBeNull()
  })

  it('idles when forging station has no craft tier', () => {
    const save = roster(1)
    save.stations.forging.stationLevel = 0
    assignWorker(save, save.workers[0].id, 'forging')
    const next = ticks(save, 32)
    expect(bankQty(next, 'miningTool01')).toBe(0)
    expect(bankQty(next, 'tool')).toBe(0)
    expect(next.stations.forging.completed).toBe(0)
    expect(next.stations.forging.progress).toBe(0)
    expect(next.stations.forging.stallReason).toBe('emptyInput')
    const hints = collectHints(next)
    expect(hints.some((h) => h.kind === 'bottleneck' && h.text.includes('未解锁工具'))).toBe(true)
  })

  it('idles with a hint when a tool is selected but there is no ore', () => {
    const save = roster(1)
    expect(selectForgeOutput(save, 'miningTool01').ok).toBe(true)
    assignWorker(save, save.workers[0].id, 'forging')
    const next = ticks(save, 32)
    expect(bankQty(next, 'miningTool01')).toBe(0)
    expect(next.stations.forging.completed).toBe(0)
    expect(next.stations.forging.progress).toBe(0)
    expect(next.stations.forging.stallReason).toBe('emptyInput')
    const hints = collectHints(next)
    expect(hints.some((h) => h.kind === 'bottleneck' && h.text.includes('见底'))).toBe(true)
  })
})
