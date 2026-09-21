import { describe, expect, it } from 'vitest'
import { assignWorker } from '../sim/assign'
import { beginEnemyCombat } from '../sim/combat'
import { createSave } from '../sim/createSave'
import { spawnWorkerWith } from '../sim/recruit'
import { unlockPlayableStations } from '../sim/stationUnlock'
import { QUALITY_MAX, STATION_WORKER_CAP } from '../sim/tables'
import type { EnemyEncounter } from '../sim/types'
import {
  applyWorkerDrag,
  canDragFuseAny,
  canDragWorker,
  canDropWorker,
  dropTargetFromDataset,
  FUSE_DRAG_TIP,
  isWorkerDragThreshold,
  shouldShowFuseDragTip,
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
    const save = unlockPlayableStations(createSave())
    const idle = spawnWorkerWith(save, 1, 'laborer')
    const a = spawnWorkerWith(save, 2, 'miner')
    const b = spawnWorkerWith(save, 2, 'artisan')
    assignWorker(save, a.id, 'mining')
    assignWorker(save, b.id, 'mining')

    const restToEmpty = { kind: 'rest' as const, workerId: idle.id }
    expect(canDropWorker(save, restToEmpty, { kind: 'slot', stationId: 'inscription', slotIndex: 0 })).toBe(true)
    expect(canDropWorker(save, restToEmpty, { kind: 'slot', stationId: 'mining', slotIndex: 0 })).toBe(false)
    expect(canDropWorker(save, restToEmpty, { kind: 'slot', stationId: 'mining', slotIndex: 1 })).toBe(false)
    expect(applyWorkerDrag(save, restToEmpty, { kind: 'slot', stationId: 'inscription', slotIndex: 0 })).toEqual({
      ok: true,
    })
    expect(idle.assignment).toBe('inscription')

    const extra = spawnWorkerWith(save, 1, 'wanderer')
    expect(applyWorkerDrag(save, { kind: 'rest', workerId: extra.id }, { kind: 'slot', stationId: 'mining', slotIndex: 0 })).toEqual({
      ok: false,
      reason: '品质不同，不能合成',
    })
    expect(extra.assignment).toBeNull()
  })

  it('withdraws a slotted worker onto the rest column', () => {
    const save = unlockPlayableStations(createSave())
    const busy = spawnWorkerWith(save, 1, 'laborer')
    assignWorker(save, busy.id, 'cooking')
    const source = { kind: 'slot' as const, workerId: busy.id, stationId: 'cooking' as const, slotIndex: 0 }
    expect(canDropWorker(save, source, { kind: 'rest' })).toBe(true)
    expect(applyWorkerDrag(save, source, { kind: 'rest' })).toEqual({ ok: true })
    expect(busy.assignment).toBeNull()
  })

  it('moves onto an empty slot of another station when that station has room', () => {
    const save = unlockPlayableStations(createSave())
    const cook = spawnWorkerWith(save, 1, 'cook')
    assignWorker(save, cook.id, 'cooking')
    const fromCook = { kind: 'slot' as const, workerId: cook.id, stationId: 'cooking' as const, slotIndex: 0 }
    expect(applyWorkerDrag(save, fromCook, { kind: 'slot', stationId: 'inscription', slotIndex: 0 })).toEqual({ ok: true })
    expect(cook.assignment).toBe('inscription')
  })

  it('fuses onto a lone same-tier occupant without assigning first', () => {
    const save = unlockPlayableStations(createSave())
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
    expect(idle.assignment).toBeNull()
  })

  it('fuses onto a same-tier occupant even when the station is already full', () => {
    const save = unlockPlayableStations(createSave())
    const idle = spawnWorkerWith(save, 2, 'cook')
    const left = spawnWorkerWith(save, 2, 'miner')
    const right = spawnWorkerWith(save, 3, 'hunter')
    assignWorker(save, left.id, 'mining')
    assignWorker(save, right.id, 'mining')
    expect(canDropWorker(save, { kind: 'rest', workerId: idle.id }, { kind: 'slot', stationId: 'mining', slotIndex: 0 })).toBe(
      true,
    )
    expect(canDropWorker(save, { kind: 'rest', workerId: idle.id }, { kind: 'slot', stationId: 'mining', slotIndex: 1 })).toBe(
      false,
    )
    const fused = applyWorkerDrag(
      save,
      { kind: 'rest', workerId: idle.id },
      { kind: 'slot', stationId: 'mining', slotIndex: 0 },
    )
    expect(fused.ok).toBe(true)
    expect(save.workers).toHaveLength(2)
    expect(save.workers.find((w) => w.id === idle.id)).toBeUndefined()
    expect(save.workers.find((w) => w.id === left.id)).toBeUndefined()
    expect(save.workers.find((w) => w.id === right.id)?.assignment).toBe('mining')
    const fresh = save.workers.find((w) => w.id !== right.id)
    expect(fresh?.qualityTier).toBe(3)
    expect(fresh?.assignment).toBe('mining')
  })

  it('rejects occupied drops that cannot fuse', () => {
    const save = unlockPlayableStations(createSave())
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
    expect(dropTargetFromDataset({ drop: 'slot', station: 'hunting', slot: '1' })).toEqual({
      kind: 'slot',
      stationId: 'hunting',
      slotIndex: 1,
    })
    expect(dropTargetFromDataset({ drop: 'slot', station: 'nope', slot: '0' })).toBeNull()
    expect(STATION_WORKER_CAP).toBe(2)
  })

  it('blocks dragging a mainline fighter away until the fight settles', () => {
    const save = unlockPlayableStations(createSave())
    const fighter = spawnWorkerWith(save, 1, 'laborer')
    const enc: EnemyEncounter = {
      kind: 'enemy',
      id: 'test-enemy',
      label: '试敌',
      quality: 'green',
      needs: { meal: 1 },
      lootGold: 8,
      departed: false,
      combat: null,
      lootClaimed: false,
      enemyRank: 'minion',
      weaknesses: ['fire'],
      revealedWeaknesses: [],
    }
    save.encounters[0] = enc
    beginEnemyCombat(enc, [fighter], 1_000)
    const fromRest = { kind: 'rest' as const, workerId: fighter.id }
    expect(canDragWorker(save, fighter.id)).toBe(false)
    expect(canDropWorker(save, fromRest, { kind: 'slot', stationId: 'mining', slotIndex: 0 })).toBe(false)
    expect(applyWorkerDrag(save, fromRest, { kind: 'slot', stationId: 'mining', slotIndex: 0 })).toEqual({
      ok: false,
      reason: '正在战斗',
    })
    expect(fighter.assignment).toBeNull()

    if (enc.combat) enc.combat.outcome = 'win'
    expect(canDragWorker(save, fighter.id)).toBe(true)
    expect(canDropWorker(save, fromRest, { kind: 'slot', stationId: 'mining', slotIndex: 0 })).toBe(true)
    expect(applyWorkerDrag(save, fromRest, { kind: 'slot', stationId: 'mining', slotIndex: 0 })).toEqual({ ok: true })
    expect(fighter.assignment).toBe('mining')
  })

  it('rejects dropping onto a locked empty station', () => {
    const save = createSave()
    const idle = spawnWorkerWith(save, 1, 'laborer')
    expect(canDropWorker(save, { kind: 'rest', workerId: idle.id }, { kind: 'slot', stationId: 'mining', slotIndex: 0 })).toBe(
      false,
    )
    expect(applyWorkerDrag(save, { kind: 'rest', workerId: idle.id }, { kind: 'slot', stationId: 'mining', slotIndex: 0 })).toEqual({
      ok: false,
      reason: '骑士 9 级开放采矿',
    })
    expect(assignWorker(save, idle.id, 'herbalism').ok).toBe(true)
  })
})

describe('fuse drag tip', () => {
  it('shows only while a drag-fuse pair exists and hides after the first merge', () => {
    expect(FUSE_DRAG_TIP).toBe('拖到同品质工人上可合成')
    const resting = unlockPlayableStations(createSave())
    spawnWorkerWith(resting, 1, 'laborer')
    spawnWorkerWith(resting, 1, 'artisan')
    expect(canDragFuseAny(resting)).toBe(false)
    expect(shouldShowFuseDragTip(resting)).toBe(false)

    const mixed = unlockPlayableStations(createSave())
    const idle = spawnWorkerWith(mixed, 1, 'laborer')
    const busy = spawnWorkerWith(mixed, 1, 'artisan')
    spawnWorkerWith(mixed, 2, 'miner')
    assignWorker(mixed, busy.id, 'mining')
    expect(canDragFuseAny(mixed)).toBe(true)
    expect(shouldShowFuseDragTip(mixed)).toBe(true)

    const fused = applyWorkerDrag(mixed, { kind: 'rest', workerId: idle.id }, { kind: 'slot', stationId: 'mining', slotIndex: 0 })
    expect(fused.ok).toBe(true)
    expect(mixed.fuseDragTipDone).toBe(true)
    expect(canDragFuseAny(mixed)).toBe(false)
    expect(shouldShowFuseDragTip(mixed)).toBe(false)

    const again = spawnWorkerWith(mixed, 2, 'cook')
    expect(canDragFuseAny(mixed)).toBe(true)
    expect(shouldShowFuseDragTip(mixed)).toBe(false)
    expect(again.qualityTier).toBe(2)
  })

  it('does not treat max-tier or in-combat workers as a drag-fuse pair', () => {
    const save = unlockPlayableStations(createSave())
    const maxA = spawnWorkerWith(save, QUALITY_MAX, 'knight')
    const maxB = spawnWorkerWith(save, QUALITY_MAX, 'steward')
    assignWorker(save, maxA.id, 'mining')
    expect(canDragFuseAny(save)).toBe(false)
    expect(shouldShowFuseDragTip(save)).toBe(false)
    expect(maxB.assignment).toBeNull()
  })
})
