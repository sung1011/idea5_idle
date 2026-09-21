import { describe, expect, it } from 'vitest'
import { assignIdleWorker, assignWorker, clampStationAssignments } from './assign'
import { beginEnemyCombat } from './combat'
import { createSave } from './createSave'
import {
  canFuseStationWorkers,
  canFuseWorkerOntoOccupant,
  canFuseWorkerWithStation,
  fuseStationWorkers,
  fuseWorkerOntoOccupant,
  fuseWorkerWithStation,
  fuseWorkers,
  stationMergeLabel,
} from './fuse'
import { spawnWorker } from './recruit'
import { unlockPlayableStations } from './stationUnlock'
import { QUALITY_MAX, STATION_WORKER_CAP } from './tables'
import type { EnemyEncounter } from './types'

function roster(n: number) {
  const save = unlockPlayableStations(createSave())
  for (let i = 0; i < n; i++) spawnWorker(save)
  return save
}

describe('station worker cap', () => {
  it('rejects a third worker at the same station', () => {
    const save = roster(3)
    expect(assignWorker(save, save.workers[0].id, 'mining').ok).toBe(true)
    expect(assignWorker(save, save.workers[1].id, 'mining').ok).toBe(true)
    const third = assignWorker(save, save.workers[2].id, 'mining')
    expect(third).toEqual({ ok: false, reason: '该站最多 2 人' })
    expect(save.workers[2].assignment).toBeNull()
    expect(save.workers.filter((w) => w.assignment === 'mining')).toHaveLength(STATION_WORKER_CAP)
  })

  it('lets a worker stay when already at a full station', () => {
    const save = roster(2)
    assignWorker(save, save.workers[0].id, 'mining')
    assignWorker(save, save.workers[1].id, 'mining')
    expect(assignWorker(save, save.workers[0].id, 'mining').ok).toBe(true)
    expect(save.workers[0].assignment).toBe('mining')
  })

  it('blocks assigning a worker who is already fighting', () => {
    const save = roster(1)
    const worker = save.workers[0]
    save.encounters[0] = {
      kind: 'enemy',
      id: 'fight',
      label: '试敌',
      quality: 'green',
      needs: { meal: 1 },
      lootGold: 8,
      departed: true,
      combat: null,
      lootClaimed: false,
      enemyRank: 'minion',
      weaknesses: ['fire', 'sword'],
      revealedWeaknesses: [],
    } satisfies EnemyEncounter
    beginEnemyCombat(save.encounters[0] as EnemyEncounter, [worker], 1_000)
    expect(assignWorker(save, worker.id, 'mining')).toEqual({ ok: false, reason: '正在战斗' })
    expect(worker.assignment).toBeNull()
    expect(assignIdleWorker(save, 'mining')).toEqual({ ok: false, reason: '没有空闲工人' })
  })

  it('blocks assignIdle when the station is full', () => {
    const save = roster(3)
    assignWorker(save, save.workers[0].id, 'cooking')
    assignWorker(save, save.workers[1].id, 'cooking')
    expect(assignIdleWorker(save, 'cooking')).toEqual({ ok: false, reason: '该站最多 2 人' })
    expect(save.workers[2].assignment).toBeNull()
  })

  it('rests overflow workers on hydrate clamp', () => {
    const save = roster(3)
    save.workers[0].assignment = 'hunting'
    save.workers[1].assignment = 'hunting'
    save.workers[2].assignment = 'hunting'
    clampStationAssignments(save)
    expect(save.workers.map((w) => w.assignment)).toEqual(['hunting', 'hunting', null])
  })
})

describe('station merge', () => {
  it('merges two same-tier workers at one station', () => {
    const save = roster(2)
    assignWorker(save, save.workers[0].id, 'mining')
    assignWorker(save, save.workers[1].id, 'mining')
    const result = fuseStationWorkers(save, 'mining')
    expect(result.ok).toBe(true)
    expect(save.fuseDragTipDone).toBe(true)
    expect(save.workers).toHaveLength(1)
    expect(save.workers[0].qualityTier).toBe(2)
    expect(save.workers[0].assignment).toBe('mining')
  })

  it('labels the station merge button as 合成', () => {
    const save = roster(2)
    expect(stationMergeLabel(save, 'mining')).toBe('合成')
    assignWorker(save, save.workers[0].id, 'mining')
    assignWorker(save, save.workers[1].id, 'mining')
    expect(stationMergeLabel(save, 'mining')).toBe('合成')
  })

  it('fails when the station does not have two workers', () => {
    const save = roster(2)
    assignWorker(save, save.workers[0].id, 'mining')
    expect(fuseStationWorkers(save, 'mining')).toEqual({ ok: false, reason: '该站需要 2 人才可合并' })
    expect(save.workers).toHaveLength(2)
  })

  it('fails when the two workers are at different stations', () => {
    const save = roster(2)
    assignWorker(save, save.workers[0].id, 'mining')
    assignWorker(save, save.workers[1].id, 'inscription')
    expect(fuseWorkers(save, save.workers[0].id, save.workers[1].id)).toEqual({
      ok: false,
      reason: '只能合并同一工坊的两人',
    })
    expect(fuseStationWorkers(save, 'mining')).toEqual({ ok: false, reason: '该站需要 2 人才可合并' })
    expect(save.workers).toHaveLength(2)
  })

  it('shows fuse only when the current worker can merge with the station crew', () => {
    const save = roster(2)
    const [a, b] = save.workers
    expect(canFuseStationWorkers(save, 'mining')).toBe(false)
    expect(canFuseWorkerWithStation(save, a.id, null)).toBe(false)
    expect(canFuseWorkerWithStation(save, a.id, 'mining')).toBe(false)

    assignWorker(save, b.id, 'mining')
    expect(canFuseWorkerWithStation(save, a.id, 'mining')).toBe(true)
    expect(canFuseStationWorkers(save, 'mining')).toBe(false)

    assignWorker(save, a.id, 'mining')
    expect(canFuseStationWorkers(save, 'mining')).toBe(true)
    expect(canFuseWorkerWithStation(save, a.id, 'mining')).toBe(true)

    b.qualityTier = 2
    expect(canFuseStationWorkers(save, 'mining')).toBe(false)
    expect(canFuseWorkerWithStation(save, a.id, 'mining')).toBe(false)

    a.qualityTier = QUALITY_MAX
    b.qualityTier = QUALITY_MAX
    expect(canFuseStationWorkers(save, 'mining')).toBe(false)
    expect(canFuseWorkerWithStation(save, a.id, 'mining')).toBe(false)
  })

  it('assigns then fuses a matching worker into the target station', () => {
    const save = roster(2)
    const [a, b] = save.workers
    assignWorker(save, b.id, 'cooking')
    const result = fuseWorkerWithStation(save, a.id, 'cooking')
    expect(result.ok).toBe(true)
    expect(save.workers).toHaveLength(1)
    expect(save.workers[0].qualityTier).toBe(2)
    expect(save.workers[0].assignment).toBe('cooking')
  })

  it('fuses onto an occupant without assigning first, even if the station is full', () => {
    const save = roster(3)
    const [idle, left, right] = save.workers
    assignWorker(save, left.id, 'mining')
    assignWorker(save, right.id, 'mining')
    expect(canFuseWorkerWithStation(save, idle.id, 'mining')).toBe(false)
    expect(canFuseWorkerOntoOccupant(save, idle.id, left.id, 'mining')).toBe(true)
    const result = fuseWorkerOntoOccupant(save, idle.id, left.id, 'mining')
    expect(result.ok).toBe(true)
    expect(save.workers).toHaveLength(2)
    expect(save.workers.find((w) => w.id === idle.id)).toBeUndefined()
    expect(save.workers.find((w) => w.id === left.id)).toBeUndefined()
    expect(save.workers.find((w) => w.id === right.id)?.assignment).toBe('mining')
    expect(save.workers.find((w) => w.id !== right.id)?.assignment).toBe('mining')
    expect(save.workers.find((w) => w.id !== right.id)?.qualityTier).toBe(2)
  })

  it('does not assign when the target station crew cannot fuse', () => {
    const save = roster(2)
    const [a, b] = save.workers
    b.qualityTier = 3
    assignWorker(save, b.id, 'inscription')
    expect(fuseWorkerWithStation(save, a.id, 'inscription')).toEqual({
      ok: false,
      reason: '品质不同，不能合成',
    })
    expect(a.assignment).toBeNull()
    expect(save.workers).toHaveLength(2)
  })
})
