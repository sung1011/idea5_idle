import { describe, expect, it } from 'vitest'
import {
  assignIdleWorker,
  assignRestingToFirstEmpty,
  assignWorker,
  clampStationAssignments,
  toggleStationClosed,
  withdrawWorker,
} from './assign'
import { beginEnemyCombat } from './combat'
import { createSave } from './createSave'
import {
  canFuseRestWorkers,
  canFuseStationWorkers,
  canFuseWorkerWithStation,
  fuseRestWorkers,
  fuseStationWorkers,
  fuseWorkerWithStation,
  fuseWorkers,
  stationMergeLabel,
} from './fuse'
import { spawnWorker } from './recruit'
import { unlockPlayableStations } from './stationUnlock'
import { QUALITY_MAX, STATION_WORKER_CAP } from './tables'
import { ticks } from './tick'
import type { EnemyEncounter } from './types'

function roster(n: number) {
  const save = unlockPlayableStations(createSave())
  for (let i = 0; i < n; i++) spawnWorker(save)
  return save
}

describe('station worker cap', () => {
  it('rejects a second worker at the same station', () => {
    const save = roster(2)
    expect(STATION_WORKER_CAP).toBe(1)
    expect(assignWorker(save, save.workers[0].id, 'mining').ok).toBe(true)
    const second = assignWorker(save, save.workers[1].id, 'mining')
    expect(second).toEqual({ ok: false, reason: '该站最多 1 人' })
    expect(save.workers[1].assignment).toBeNull()
    expect(save.workers.filter((w) => w.assignment === 'mining')).toHaveLength(1)
  })

  it('lets a worker stay when already at a full station', () => {
    const save = roster(1)
    assignWorker(save, save.workers[0].id, 'mining')
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

  it('withdraws one station worker back to rest', () => {
    const save = roster(2)
    assignWorker(save, save.workers[0].id, 'herbalism')
    assignWorker(save, save.workers[1].id, 'alchemy')
    expect(withdrawWorker(save, 'herbalism')).toEqual({ ok: true })
    expect(save.workers[0].assignment).toBeNull()
    expect(save.workers[1].assignment).toBe('alchemy')
    expect(withdrawWorker(save, 'herbalism')).toEqual({ ok: false, reason: '该站没有工人' })
  })

  it('blocks assignIdle when the station is full', () => {
    const save = roster(3)
    assignWorker(save, save.workers[0].id, 'cooking')
    expect(assignIdleWorker(save, 'cooking')).toEqual({ ok: false, reason: '该站最多 1 人' })
    expect(save.workers[2].assignment).toBeNull()
  })

  it('rests overflow workers on hydrate clamp', () => {
    const save = roster(3)
    save.workers[0].assignment = 'hunting'
    save.workers[1].assignment = 'hunting'
    save.workers[2].assignment = 'hunting'
    clampStationAssignments(save)
    expect(save.workers.map((w) => w.assignment)).toEqual(['hunting', null, null])
  })
})

describe('rest merge', () => {
  it('merges two same-tier workers in rest and sends the result back to rest', () => {
    const save = roster(2)
    const result = fuseRestWorkers(save, save.workers[0].id, save.workers[1].id)
    expect(result.ok).toBe(true)
    expect(save.fuseDragTipDone).toBe(true)
    expect(save.workers).toHaveLength(1)
    expect(save.workers[0].qualityTier).toBe(2)
    expect(save.workers[0].assignment).toBeNull()
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

  it('fuses in rest and does not fuse across stations or onto a filled post', () => {
    const save = roster(2)
    const [a, b] = save.workers
    expect(canFuseRestWorkers(save, a.id, b.id)).toBe(true)
    expect(canFuseStationWorkers(save, 'mining')).toBe(false)
    expect(canFuseWorkerWithStation(save, a.id, 'mining')).toBe(false)
    assignWorker(save, b.id, 'mining')
    expect(canFuseRestWorkers(save, a.id, b.id)).toBe(true)
    const fused = fuseRestWorkers(save, a.id, b.id)
    expect(fused.ok).toBe(true)
    expect(save.workers).toHaveLength(1)
    expect(save.workers[0].qualityTier).toBe(2)
    expect(save.workers[0].assignment).toBeNull()
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

describe('workshop full hp gate', () => {
  it('rejects wounded or indebted workers and still allows withdraw and the closed toggle', () => {
    const save = createSave()
    const worker = spawnWorker(save)
    expect(assignWorker(save, worker.id, 'herbalism')).toEqual({ ok: true })
    worker.hp = worker.hpMax - 1
    expect(assignWorker(save, worker.id, 'alchemy')).toEqual({ ok: false, reason: '满血才能上岗' })
    expect(worker.assignment).toBe('herbalism')
    expect(withdrawWorker(save, 'herbalism')).toEqual({ ok: true })
    worker.hp = worker.hpMax
    worker.fatigueDebt = 0.2
    expect(assignWorker(save, worker.id, 'herbalism')).toEqual({ ok: false, reason: '满血才能上岗' })
    expect(toggleStationClosed(save, 'alchemy')).toEqual({ ok: true })
    expect(save.stations.alchemy.closed).toBe(true)
    expect(toggleStationClosed(save, 'alchemy')).toEqual({ ok: true })
    expect(save.stations.alchemy.closed).toBe(false)
  })

  it('blocks the queue on a wounded head and skips closed stations until they reopen', () => {
    const blocked = createSave()
    const head = spawnWorker(blocked)
    const next = spawnWorker(blocked)
    head.hp -= 1
    expect(assignRestingToFirstEmpty(blocked)).toEqual({ ok: false, reason: '满血才能上岗' })
    expect(assignIdleWorker(blocked, 'herbalism')).toEqual({ ok: false, reason: '满血才能上岗' })
    expect(head.assignment).toBeNull()
    expect(next.assignment).toBeNull()
    expect(assignWorker(blocked, next.id, 'herbalism')).toEqual({ ok: true })

    const save = createSave()
    const idle = spawnWorker(save)
    save.stations.herbalism.closed = true
    save.stations.alchemy.closed = true
    expect(assignRestingToFirstEmpty(save)).toEqual({ ok: false, reason: '骑士 5 级开放狩猎' })
    expect(assignWorker(save, idle.id, 'herbalism')).toEqual({ ok: true })
    expect(withdrawWorker(save, 'herbalism')).toEqual({ ok: true })
    save.stations.herbalism.closed = false
    expect(assignRestingToFirstEmpty(save)).toEqual({ ok: true })
    expect(idle.assignment).toBe('herbalism')
  })

  it('auto-fills one full rest head per tick and does not pass a wounded head', () => {
    const open = createSave()
    const first = spawnWorker(open)
    const second = spawnWorker(open)
    open.stations.herbalism.closed = true
    const filled = ticks(open, 1)
    expect(filled.workers.find((worker) => worker.id === first.id)?.assignment).toBe('alchemy')
    expect(filled.workers.find((worker) => worker.id === second.id)?.assignment).toBeNull()
    const still = ticks(filled, 1)
    expect(still.workers.find((worker) => worker.id === second.id)?.assignment).toBeNull()

    const wounded = createSave()
    const head = spawnWorker(wounded)
    const tail = spawnWorker(wounded)
    head.hp -= 1
    const stayed = ticks(wounded, 3)
    expect(stayed.workers.find((worker) => worker.id === head.id)?.assignment).toBeNull()
    expect(stayed.workers.find((worker) => worker.id === tail.id)?.assignment).toBeNull()
  })
})
