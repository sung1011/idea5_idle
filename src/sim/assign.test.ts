import { describe, expect, it } from 'vitest'
import { assignIdleWorker, assignWorker, clampStationAssignments } from './assign'
import { beginEnemyCombat } from './combat'
import { createSave } from './createSave'
import { fuseStationWorkers, fuseWorkers } from './fuse'
import { spawnWorker } from './recruit'
import { STATION_WORKER_CAP } from './tables'
import type { EnemyEncounter } from './types'

function roster(n: number) {
  const save = createSave()
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
    save.workers[0].assignment = 'fishing'
    save.workers[1].assignment = 'fishing'
    save.workers[2].assignment = 'fishing'
    clampStationAssignments(save)
    expect(save.workers.map((w) => w.assignment)).toEqual(['fishing', 'fishing', null])
  })
})

describe('station merge', () => {
  it('merges two same-tier workers at one station', () => {
    const save = roster(2)
    assignWorker(save, save.workers[0].id, 'mining')
    assignWorker(save, save.workers[1].id, 'mining')
    const result = fuseStationWorkers(save, 'mining')
    expect(result.ok).toBe(true)
    expect(save.workers).toHaveLength(1)
    expect(save.workers[0].qualityTier).toBe(2)
    expect(save.workers[0].assignment).toBeNull()
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
    assignWorker(save, save.workers[1].id, 'forging')
    expect(fuseWorkers(save, save.workers[0].id, save.workers[1].id)).toEqual({
      ok: false,
      reason: '只能合并同一工坊的两人',
    })
    expect(fuseStationWorkers(save, 'mining')).toEqual({ ok: false, reason: '该站需要 2 人才可合并' })
    expect(save.workers).toHaveLength(2)
  })
})
