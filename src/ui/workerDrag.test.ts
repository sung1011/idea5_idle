import { describe, expect, it } from 'vitest'
import { assignRestingToFirstEmpty, assignWorker } from '../sim/assign'
import { beginEnemyCombat } from '../sim/combat'
import { createSave } from '../sim/createSave'
import { spawnWorkerWith } from '../sim/recruit'
import { unlockPlayableStations } from '../sim/stationUnlock'
import { QUALITY_MAX, STATION_WORKER_CAP } from '../sim/tables'
import type { EnemyEncounter } from '../sim/types'
import detailSheetSource from './stationDetailSheet.vue?raw'
import panelSource from './workersPanelV2.vue?raw'
import {
  applyWorkerDrag,
  canDragFuseAny,
  canDragWorker,
  canDropWorker,
  dropTargetFromDataset,
  FUSE_DRAG_TIP,
  MANUAL_DUTY_REASON,
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
    expect(assignWorker(save, b.id, 'mining').ok).toBe(false)

    const restToEmpty = { kind: 'rest' as const, workerId: idle.id }
    expect(canDropWorker(save, restToEmpty, { kind: 'slot', stationId: 'inscription', slotIndex: 0 })).toBe(false)
    expect(canDropWorker(save, restToEmpty, { kind: 'slot', stationId: 'mining', slotIndex: 0 })).toBe(false)
    expect(applyWorkerDrag(save, restToEmpty, { kind: 'slot', stationId: 'inscription', slotIndex: 0 })).toEqual({
      ok: false,
      reason: MANUAL_DUTY_REASON,
    })
    expect(idle.assignment).toBeNull()

    const extra = spawnWorkerWith(save, 1, 'wanderer')
    expect(applyWorkerDrag(save, { kind: 'rest', workerId: extra.id }, { kind: 'slot', stationId: 'mining', slotIndex: 0 })).toEqual({
      ok: false,
      reason: '品质不同，不能合成',
    })
    expect(extra.assignment).toBeNull()
    expect(a.assignment).toBe('mining')
  })

  it('withdraws a slotted worker onto the rest column', () => {
    const save = unlockPlayableStations(createSave())
    const busy = spawnWorkerWith(save, 1, 'laborer')
    assignWorker(save, busy.id, 'cooking')
    const source = { kind: 'slot' as const, workerId: busy.id, stationId: 'cooking' as const, slotIndex: 0 }
    expect(canDropWorker(save, source, { kind: 'rest' })).toBe(false)
    expect(applyWorkerDrag(save, source, { kind: 'rest' })).toEqual({ ok: false, reason: MANUAL_DUTY_REASON })
    expect(busy.assignment).toBe('cooking')
  })

  it('moves onto an empty slot of another station when that station has room', () => {
    const save = unlockPlayableStations(createSave())
    const cook = spawnWorkerWith(save, 1, 'cook')
    assignWorker(save, cook.id, 'cooking')
    const fromCook = { kind: 'slot' as const, workerId: cook.id, stationId: 'cooking' as const, slotIndex: 0 }
    expect(applyWorkerDrag(save, fromCook, { kind: 'slot', stationId: 'inscription', slotIndex: 0 })).toEqual({ ok: true })
    expect(cook.assignment).toBe('inscription')
  })

  it('fuses onto an occupied station of the same tier and keeps the result there', () => {
    const save = unlockPlayableStations(createSave())
    const idle = spawnWorkerWith(save, 1, 'laborer')
    const busy = spawnWorkerWith(save, 1, 'artisan')
    assignWorker(save, busy.id, 'mining')
    const restToMate = { kind: 'rest' as const, workerId: idle.id }
    expect(canDropWorker(save, restToMate, { kind: 'slot', stationId: 'mining', slotIndex: 0 })).toBe(true)
    const fused = applyWorkerDrag(save, restToMate, { kind: 'slot', stationId: 'mining', slotIndex: 0 })
    expect(fused.ok).toBe(true)
    expect(save.workers).toHaveLength(1)
    expect(save.workers[0].qualityTier).toBe(2)
    expect(save.workers[0].assignment).toBe('mining')
  })

  it('fuses two resting workers of the same tier and leaves the result in rest', () => {
    const save = unlockPlayableStations(createSave())
    const left = spawnWorkerWith(save, 2, 'cook')
    const right = spawnWorkerWith(save, 2, 'miner')
    const duty = spawnWorkerWith(save, 2, 'hunter')
    assignWorker(save, duty.id, 'mining')
    expect(canDropWorker(save, { kind: 'rest', workerId: left.id }, { kind: 'restWorker', workerId: right.id })).toBe(true)
    expect(canDropWorker(save, { kind: 'slot', workerId: duty.id, stationId: 'mining', slotIndex: 0 }, { kind: 'slot', stationId: 'cooking', slotIndex: 0 })).toBe(true)
    const fused = applyWorkerDrag(save, { kind: 'rest', workerId: left.id }, { kind: 'restWorker', workerId: right.id })
    expect(fused.ok).toBe(true)
    if (fused.ok) expect(fused.message).toMatch(/^合成出/)
    expect(save.workers.find((w) => w.id === left.id)).toBeUndefined()
    expect(save.workers.find((w) => w.id === right.id)).toBeUndefined()
    const fresh = save.workers.find((w) => w.id !== duty.id)
    expect(fresh?.qualityTier).toBe(3)
    expect(fresh?.assignment).toBeNull()
    expect(duty.assignment).toBe('mining')
  })

  it('fuses an on-duty worker onto another station mate and onto a resting mate', () => {
    const save = unlockPlayableStations(createSave())
    const miner = spawnWorkerWith(save, 1, 'miner')
    const cook = spawnWorkerWith(save, 1, 'cook')
    assignWorker(save, miner.id, 'mining')
    assignWorker(save, cook.id, 'cooking')
    const fromMine = { kind: 'slot' as const, workerId: miner.id, stationId: 'mining' as const, slotIndex: 0 }
    expect(canDropWorker(save, fromMine, { kind: 'slot', stationId: 'cooking', slotIndex: 0 })).toBe(true)
    const across = applyWorkerDrag(save, fromMine, { kind: 'slot', stationId: 'cooking', slotIndex: 0 })
    expect(across.ok).toBe(true)
    expect(save.workers).toHaveLength(1)
    expect(save.workers[0].qualityTier).toBe(2)
    expect(save.workers[0].assignment).toBe('cooking')

    const duty = spawnWorkerWith(save, 3, 'hunter')
    const resting = spawnWorkerWith(save, 3, 'artisan')
    assignWorker(save, duty.id, 'mining')
    const fromDuty = { kind: 'slot' as const, workerId: duty.id, stationId: 'mining' as const, slotIndex: 0 }
    expect(canDropWorker(save, fromDuty, { kind: 'restWorker', workerId: resting.id })).toBe(false)
    expect(applyWorkerDrag(save, fromDuty, { kind: 'restWorker', workerId: resting.id })).toEqual({
      ok: false,
      reason: MANUAL_DUTY_REASON,
    })
    expect(duty.assignment).toBe('mining')
    expect(resting.assignment).toBeNull()
  })

  it('refuses a different tier on a rest worker or an occupied slot', () => {
    const save = unlockPlayableStations(createSave())
    const idle = spawnWorkerWith(save, 1, 'laborer')
    const mate = spawnWorkerWith(save, 2, 'artisan')
    const busy = spawnWorkerWith(save, 3, 'miner')
    assignWorker(save, busy.id, 'hunting')
    expect(canDropWorker(save, { kind: 'rest', workerId: idle.id }, { kind: 'restWorker', workerId: mate.id })).toBe(false)
    expect(applyWorkerDrag(save, { kind: 'rest', workerId: idle.id }, { kind: 'restWorker', workerId: mate.id })).toEqual({
      ok: false,
      reason: '品质不同，不能合成',
    })
    expect(canDropWorker(save, { kind: 'rest', workerId: idle.id }, { kind: 'slot', stationId: 'hunting', slotIndex: 0 })).toBe(
      false,
    )
    expect(idle.assignment).toBeNull()
    expect(mate.assignment).toBeNull()
    expect(busy.assignment).toBe('hunting')
    expect(save.workers).toHaveLength(3)
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
    expect(dropTargetFromDataset({ drop: 'rest-worker', worker: 'w-rest' })).toEqual({
      kind: 'restWorker',
      workerId: 'w-rest',
    })
    expect(STATION_WORKER_CAP).toBe(1)
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
    expect(canDropWorker(save, fromRest, { kind: 'slot', stationId: 'mining', slotIndex: 0 })).toBe(false)
    expect(applyWorkerDrag(save, fromRest, { kind: 'slot', stationId: 'mining', slotIndex: 0 })).toEqual({
      ok: false,
      reason: MANUAL_DUTY_REASON,
    })
    expect(fighter.assignment).toBeNull()
  })

  it('rejects dropping onto a locked empty station', () => {
    const save = createSave()
    const idle = spawnWorkerWith(save, 1, 'laborer')
    expect(canDropWorker(save, { kind: 'rest', workerId: idle.id }, { kind: 'slot', stationId: 'mining', slotIndex: 0 })).toBe(
      false,
    )
    expect(applyWorkerDrag(save, { kind: 'rest', workerId: idle.id }, { kind: 'slot', stationId: 'mining', slotIndex: 0 })).toEqual({
      ok: false,
      reason: MANUAL_DUTY_REASON,
    })
    expect(assignWorker(save, idle.id, 'herbalism').ok).toBe(true)
  })
})

describe('fuse drag tip', () => {
  it('shows only while a drag-fuse pair exists and hides after the first merge', () => {
    expect(FUSE_DRAG_TIP).toBe('休息区同品质可合；拖到站上同品质也可合')
    const resting = unlockPlayableStations(createSave())
    const left = spawnWorkerWith(resting, 1, 'laborer')
    const right = spawnWorkerWith(resting, 1, 'artisan')
    expect(canDragFuseAny(resting)).toBe(true)
    expect(shouldShowFuseDragTip(resting)).toBe(true)

    const mixed = unlockPlayableStations(createSave())
    const idle = spawnWorkerWith(mixed, 1, 'laborer')
    const mate = spawnWorkerWith(mixed, 1, 'artisan')
    const busy = spawnWorkerWith(mixed, 2, 'miner')
    assignWorker(mixed, busy.id, 'mining')
    expect(canDragFuseAny(mixed)).toBe(true)
    expect(shouldShowFuseDragTip(mixed)).toBe(true)

    const fused = applyWorkerDrag(mixed, { kind: 'rest', workerId: idle.id }, { kind: 'restWorker', workerId: mate.id })
    expect(fused.ok).toBe(true)
    expect(mixed.fuseDragTipDone).toBe(true)
    expect(shouldShowFuseDragTip(mixed)).toBe(false)

    const again = spawnWorkerWith(mixed, 2, 'cook')
    expect(canDragFuseAny(mixed)).toBe(true)
    expect(shouldShowFuseDragTip(mixed)).toBe(false)
    expect(again.qualityTier).toBe(2)
  })

  it('still auto-fills the rest head and keeps both fuse drags', () => {
    const save = unlockPlayableStations(createSave())
    const head = spawnWorkerWith(save, 1, 'laborer')
    const mate = spawnWorkerWith(save, 1, 'artisan')
    expect(assignRestingToFirstEmpty(save)).toEqual({ ok: true })
    expect(head.assignment).toBe('herbalism')
    expect(canDropWorker(save, { kind: 'slot', workerId: head.id, stationId: 'herbalism', slotIndex: 0 }, { kind: 'rest' })).toBe(
      false,
    )

    const fused = applyWorkerDrag(save, { kind: 'rest', workerId: mate.id }, { kind: 'slot', stationId: 'herbalism', slotIndex: 0 })
    expect(fused.ok).toBe(true)
    expect(save.workers).toHaveLength(1)
    expect(save.workers[0].assignment).toBe('herbalism')
    expect(save.workers[0].qualityTier).toBe(2)

    const left = spawnWorkerWith(save, 2, 'cook')
    const right = spawnWorkerWith(save, 2, 'miner')
    const restFuse = applyWorkerDrag(save, { kind: 'rest', workerId: left.id }, { kind: 'restWorker', workerId: right.id })
    expect(restFuse.ok).toBe(true)
    expect(save.workers.find((worker) => worker.qualityTier === 3)?.assignment).toBeNull()
    expect(detailSheetSource).toContain('MANUAL_DUTY_REASON')
    expect(detailSheetSource).not.toContain('game.withdraw')
    expect(panelSource).toContain('MANUAL_DUTY_REASON')
    expect(panelSource).toContain('game.assignIdle(stationId)')
  })

  it('does not treat max-tier or in-combat workers as a drag-fuse pair', () => {
    const save = unlockPlayableStations(createSave())
    const maxA = spawnWorkerWith(save, QUALITY_MAX, 'knight')
    const maxB = spawnWorkerWith(save, QUALITY_MAX, 'steward')
    expect(canDragFuseAny(save)).toBe(false)
    expect(shouldShowFuseDragTip(save)).toBe(false)
    expect(maxA.assignment).toBeNull()
    expect(maxB.assignment).toBeNull()
  })
})
