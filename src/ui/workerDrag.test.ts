import { describe, expect, it } from 'vitest'
import { assignWorker } from '../sim/assign'
import { createSave } from '../sim/createSave'
import { spawnWorkerWith } from '../sim/recruit'
import { STATION_WORKER_CAP } from '../sim/tables'
import {
  applyWorkerDrag,
  canDragWorker,
  canDropWorker,
  dropTargetFromDataset,
  isWorkerDragThreshold,
  shouldStartWorkerDrag,
  slotOccupantId,
  WORKER_DRAG_THRESHOLD_PX,
} from './workerDrag'

describe('worker drag threshold', () => {
  it('starts only after a short move, rest prefers sideways', () => {
    expect(isWorkerDragThreshold(WORKER_DRAG_THRESHOLD_PX - 1)).toBe(false)
    expect(isWorkerDragThreshold(WORKER_DRAG_THRESHOLD_PX)).toBe(true)
    const rest = { kind: 'rest' as const, workerId: 'w' }
    const slot = { kind: 'slot' as const, workerId: 'w', stationId: 'mining' as const, slotIndex: 0 }
    expect(shouldStartWorkerDrag(rest, 0, 20)).toBe(false)
    expect(shouldStartWorkerDrag(rest, -16, 4)).toBe(true)
    expect(shouldStartWorkerDrag(slot, 0, 16)).toBe(true)
    expect(shouldStartWorkerDrag(slot, 4, 4)).toBe(false)
  })
})

describe('worker drag assign', () => {
  it('drops a resting worker onto an empty slot and rejects a full station', () => {
    const save = createSave()
    const idle = spawnWorkerWith(save, 1, 'laborer')
    const a = spawnWorkerWith(save, 2, 'miner')
    const b = spawnWorkerWith(save, 2, 'artisan')
    assignWorker(save, a.id, 'mining')
    assignWorker(save, b.id, 'mining')

    const restToEmpty = { kind: 'rest' as const, workerId: idle.id }
    expect(canDropWorker(save, restToEmpty, { kind: 'slot', stationId: 'forging', slotIndex: 0 })).toBe(true)
    expect(canDropWorker(save, restToEmpty, { kind: 'slot', stationId: 'mining', slotIndex: 0 })).toBe(false)
    expect(canDropWorker(save, restToEmpty, { kind: 'slot', stationId: 'mining', slotIndex: 1 })).toBe(false)
    expect(applyWorkerDrag(save, restToEmpty, { kind: 'slot', stationId: 'forging', slotIndex: 0 })).toEqual({
      ok: true,
    })
    expect(idle.assignment).toBe('forging')

    const extra = spawnWorkerWith(save, 1, 'wanderer')
    expect(applyWorkerDrag(save, { kind: 'rest', workerId: extra.id }, { kind: 'slot', stationId: 'mining', slotIndex: 0 })).toEqual({
      ok: false,
      reason: '该站最多 2 人',
    })
    expect(extra.assignment).toBeNull()
  })

  it('withdraws a slotted worker onto the rest column', () => {
    const save = createSave()
    const busy = spawnWorkerWith(save, 1, 'laborer')
    assignWorker(save, busy.id, 'cooking')
    const source = { kind: 'slot' as const, workerId: busy.id, stationId: 'cooking' as const, slotIndex: 0 }
    expect(canDropWorker(save, source, { kind: 'rest' })).toBe(true)
    expect(applyWorkerDrag(save, source, { kind: 'rest' })).toEqual({ ok: true })
    expect(busy.assignment).toBeNull()
  })

  it('moves between stations when the target has room and swaps slots on the same station', () => {
    const save = createSave()
    const miner = spawnWorkerWith(save, 2, 'miner')
    const mate = spawnWorkerWith(save, 3, 'laborer')
    const cook = spawnWorkerWith(save, 1, 'cook')
    assignWorker(save, miner.id, 'mining')
    assignWorker(save, mate.id, 'mining')
    assignWorker(save, cook.id, 'cooking')
    expect(slotOccupantId(save, 'mining', 0)).toBe(miner.id)
    expect(slotOccupantId(save, 'mining', 1)).toBe(mate.id)

    expect(
      applyWorkerDrag(
        save,
        { kind: 'slot', workerId: miner.id, stationId: 'mining', slotIndex: 0 },
        { kind: 'slot', stationId: 'mining', slotIndex: 1 },
      ),
    ).toEqual({ ok: true })
    expect(slotOccupantId(save, 'mining', 0)).toBe(mate.id)
    expect(slotOccupantId(save, 'mining', 1)).toBe(miner.id)
    expect(miner.assignment).toBe('mining')
    expect(mate.assignment).toBe('mining')

    const fromCook = { kind: 'slot' as const, workerId: cook.id, stationId: 'cooking' as const, slotIndex: 0 }
    expect(canDropWorker(save, fromCook, { kind: 'slot', stationId: 'mining', slotIndex: 0 })).toBe(false)
    expect(applyWorkerDrag(save, fromCook, { kind: 'slot', stationId: 'forging', slotIndex: 0 })).toEqual({ ok: true })
    expect(cook.assignment).toBe('forging')
  })

  it('parses drop targets and keeps combat workers undraggable', () => {
    const save = createSave()
    const idle = spawnWorkerWith(save, 1, 'laborer')
    expect(canDragWorker(save, idle.id)).toBe(true)
    expect(dropTargetFromDataset({ drop: 'rest' })).toEqual({ kind: 'rest' })
    expect(dropTargetFromDataset({ drop: 'slot', station: 'fishing', slot: '1' })).toEqual({
      kind: 'slot',
      stationId: 'fishing',
      slotIndex: 1,
    })
    expect(dropTargetFromDataset({ drop: 'slot', station: 'nope', slot: '0' })).toBeNull()
    expect(STATION_WORKER_CAP).toBe(2)
  })
})
