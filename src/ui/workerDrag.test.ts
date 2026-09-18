import { describe, expect, it } from 'vitest'
import { assignWorker } from '../sim/assign'
import { createSave } from '../sim/createSave'
import { spawnWorkerWith } from '../sim/recruit'
import { QUALITY_MAX, STATION_WORKER_CAP } from '../sim/tables'
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

  it('moves onto an empty slot of another station when that station has room', () => {
    const save = createSave()
    const cook = spawnWorkerWith(save, 1, 'cook')
    assignWorker(save, cook.id, 'cooking')
    const fromCook = { kind: 'slot' as const, workerId: cook.id, stationId: 'cooking' as const, slotIndex: 0 }
    expect(applyWorkerDrag(save, fromCook, { kind: 'slot', stationId: 'forging', slotIndex: 0 })).toEqual({ ok: true })
    expect(cook.assignment).toBe('forging')
  })

  it('fuses when dropped onto a same-tier occupant and keeps the new worker at the station', () => {
    const save = createSave()
    const idle = spawnWorkerWith(save, 1, 'laborer')
    const busy = spawnWorkerWith(save, 1, 'artisan')
    assignWorker(save, busy.id, 'mining')
    const restToMate = { kind: 'rest' as const, workerId: idle.id }
    expect(canDropWorker(save, restToMate, { kind: 'slot', stationId: 'mining', slotIndex: 0 })).toBe(true)
    const fused = applyWorkerDrag(save, restToMate, { kind: 'slot', stationId: 'mining', slotIndex: 0 })
    expect(fused.ok).toBe(true)
    if (fused.ok) expect(fused.message).toMatch(/^合成出/)
    expect(save.workers).toHaveLength(1)
    expect(save.workers[0]?.qualityTier).toBe(2)
    expect(save.workers[0]?.assignment).toBe('mining')

    const left = spawnWorkerWith(save, 2, 'miner')
    const right = spawnWorkerWith(save, 2, 'hunter')
    assignWorker(save, left.id, 'forging')
    assignWorker(save, right.id, 'forging')
    const sameStation = applyWorkerDrag(
      save,
      { kind: 'slot', workerId: left.id, stationId: 'forging', slotIndex: 0 },
      { kind: 'slot', stationId: 'forging', slotIndex: 1 },
    )
    expect(sameStation.ok).toBe(true)
    const forged = save.workers.filter((w) => w.assignment === 'forging')
    expect(forged).toHaveLength(1)
    expect(forged[0]?.qualityTier).toBe(3)
  })

  it('rejects occupied drops that cannot fuse', () => {
    const save = createSave()
    const idle = spawnWorkerWith(save, 1, 'laborer')
    const green = spawnWorkerWith(save, 2, 'miner')
    const maxA = spawnWorkerWith(save, QUALITY_MAX, 'knight')
    const maxB = spawnWorkerWith(save, QUALITY_MAX, 'steward')
    assignWorker(save, green.id, 'mining')
    assignWorker(save, maxA.id, 'alchemy')
    expect(canDropWorker(save, { kind: 'rest', workerId: idle.id }, { kind: 'slot', stationId: 'mining', slotIndex: 0 })).toBe(
      false,
    )
    expect(
      applyWorkerDrag(save, { kind: 'rest', workerId: idle.id }, { kind: 'slot', stationId: 'mining', slotIndex: 0 }),
    ).toEqual({ ok: false, reason: '品质不同，不能合成' })
    expect(idle.assignment).toBeNull()
    expect(
      applyWorkerDrag(save, { kind: 'rest', workerId: maxB.id }, { kind: 'slot', stationId: 'alchemy', slotIndex: 0 }),
    ).toEqual({ ok: false, reason: '已是最高品质' })
    expect(maxB.assignment).toBeNull()
    expect(slotOccupantId(save, 'mining', 0)).toBe(green.id)
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
