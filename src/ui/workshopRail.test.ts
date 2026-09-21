import { describe, expect, it } from 'vitest'
import { assignWorker } from '../sim/assign'
import { createSave } from '../sim/createSave'
import { spawnWorkerWith } from '../sim/recruit'
import { WORKER_QUALITY_TABLE } from '../sim/tables'
import { visualStationProgress } from './visualProgress'
import { railProgressHalted, railVisualInput, railVisualPct, railWorkerDotColors } from './workshopRail'

describe('workshopRail', () => {
  it('emits one quality-table color per assigned worker', () => {
    const save = createSave()
    expect(railWorkerDotColors(save, 'mining')).toEqual([])

    const green = spawnWorkerWith(save, 2, 'laborer')
    assignWorker(save, green.id, 'mining')
    expect(railWorkerDotColors(save, 'mining')).toEqual([WORKER_QUALITY_TABLE[2].color])
    expect(railWorkerDotColors(save, 'inscription')).toEqual([])

    const pink = spawnWorkerWith(save, 7, 'laborer')
    assignWorker(save, pink.id, 'mining')
    expect(railWorkerDotColors(save, 'mining')).toEqual([
      WORKER_QUALITY_TABLE[2].color,
      WORKER_QUALITY_TABLE[7].color,
    ])
  })

  it('uses the same visual progress as the station card', () => {
    const save = createSave()
    const worker = spawnWorkerWith(save, 1, 'laborer')
    assignWorker(save, worker.id, 'mining')
    save.stations.mining.progress = 0.2
    save.lastTick = 1000
    const now = 1500
    const input = { ...railVisualInput(save, 'mining'), now }
    expect(railVisualPct(save, 'mining', now)).toBeCloseTo(visualStationProgress(input) * 100)
    expect(railProgressHalted(save, 'mining')).toBe(false)
  })

  it('freezes the fill when the station is stalled or frozen', () => {
    const save = createSave()
    const worker = spawnWorkerWith(save, 1, 'laborer')
    assignWorker(save, worker.id, 'inscription')
    save.stations.inscription.progress = 0.4
    save.stations.inscription.stallReason = 'emptyInput'
    save.lastTick = 1000
    expect(railProgressHalted(save, 'inscription')).toBe(true)
    expect(railVisualPct(save, 'inscription', 1800)).toBeCloseTo(40)
    expect(railVisualInput(save, 'inscription').stalled).toBe(true)
  })
})
