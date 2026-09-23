import { describe, expect, it } from 'vitest'
import { assignWorker } from '../sim/assign'
import { createSave } from '../sim/createSave'
import { spawnWorkerWith } from '../sim/recruit'
import { applyTick } from '../sim/tick'
import { WORKER_QUALITY_TABLE } from '../sim/tables'
import { visualStationProgress } from './visualProgress'
import { WORKSHOP_GROUPS } from './workshopTabs'
import {
  railGroupSlotDots,
  railProgressHalted,
  railStationIdle,
  railStationSlotDots,
  railVisualInput,
  railVisualPct,
  railWorkerDotColors,
} from './workshopRail'

describe('workshopRail', () => {
  it('emits one quality-table color per assigned worker', () => {
    const save = createSave()
    expect(railWorkerDotColors(save, 'mining')).toEqual([])

    const green = spawnWorkerWith(save, 2, 'laborer')
    assignWorker(save, green.id, 'mining')
    expect(railWorkerDotColors(save, 'mining')).toEqual([WORKER_QUALITY_TABLE[2].color])
    expect(railWorkerDotColors(save, 'inscription')).toEqual([])

    const pink = spawnWorkerWith(save, 7, 'laborer')
    expect(assignWorker(save, pink.id, 'mining').ok).toBe(false)
    expect(railWorkerDotColors(save, 'mining')).toEqual([WORKER_QUALITY_TABLE[2].color])
    expect(pink.assignment).toBeNull()
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

  it('maps a group into one slot per station', () => {
    const save = createSave()
    const potion = WORKSHOP_GROUPS[0]
    expect(potion.stations).toEqual(['herbalism', 'alchemy'])
    expect(railGroupSlotDots(save, potion.stations)).toEqual([null, null])

    const topA = spawnWorkerWith(save, 2, 'laborer')
    const topB = spawnWorkerWith(save, 7, 'laborer')
    const bot = spawnWorkerWith(save, 5, 'laborer')
    assignWorker(save, topA.id, 'herbalism')
    expect(assignWorker(save, topB.id, 'herbalism').ok).toBe(false)
    assignWorker(save, bot.id, 'alchemy')

    expect(railStationSlotDots(save, 'herbalism')).toEqual([{ color: WORKER_QUALITY_TABLE[2].color, idle: false }])
    expect(railGroupSlotDots(save, potion.stations)).toEqual([
      { color: WORKER_QUALITY_TABLE[2].color, idle: false },
      { color: WORKER_QUALITY_TABLE[5].color, idle: false },
    ])
  })

  it('marks assigned workers idle when the cycle cannot advance', () => {
    const save = createSave()
    const worker = spawnWorkerWith(save, 3, 'laborer')
    assignWorker(save, worker.id, 'inscription')
    expect(railStationIdle(save, 'inscription')).toBe(false)

    applyTick(save)
    expect(save.stations.inscription.stallReason).toBe('emptyInput')
    expect(railStationIdle(save, 'inscription')).toBe(true)
    expect(railStationIdle(save, 'mining')).toBe(false)
    expect(railGroupSlotDots(save, ['mining', 'inscription'])).toEqual([
      null,
      { color: WORKER_QUALITY_TABLE[3].color, idle: true },
    ])
  })

  it('treats gather freeze as idle, matching currentSpeed=0', () => {
    const save = createSave()
    const hunter = spawnWorkerWith(save, 4, 'laborer')
    assignWorker(save, hunter.id, 'hunting')
    save.stations.hunting.gatherPauseUntil = save.elapsedS + 8
    expect(railProgressHalted(save, 'hunting')).toBe(true)
    expect(railStationIdle(save, 'hunting')).toBe(true)
    expect(railStationSlotDots(save, 'hunting')[0]).toEqual({
      color: WORKER_QUALITY_TABLE[4].color,
      idle: true,
    })
  })
})
