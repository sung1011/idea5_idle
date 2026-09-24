import { describe, expect, it } from 'vitest'
import { createSave } from '../sim/createSave'
import type { Save, Worker } from '../sim/types'
import workersPanelSource from './workersPanelV2.vue?raw'
import {
  REST_BLOCK_BADGE,
  REST_HEAD_BADGE,
  restQueueRows,
  restZoneTitle,
} from './restQueue'

function worker(patch: Partial<Worker> & Pick<Worker, 'id'>): Worker {
  return {
    assignment: null,
    qualityTier: 1,
    foodSlot: null,
    fatigueDebt: 0,
    isNew: false,
    hp: 20,
    hpMax: 20,
    level: 1,
    xp: 0,
    combatAttrs: [],
    ...patch,
  }
}

function saveWith(...rows: Worker[]): Save {
  const save = createSave()
  save.workers.push(...rows)
  return save
}

describe('rest queue display', () => {
  it('numbers follow restingWorkers order, with the head marked ready', () => {
    const save = saveWith(
      worker({ id: 'on-duty', assignment: 'herbalism' }),
      worker({ id: 'second' }),
      worker({ id: 'first' }),
    )
    const rows = restQueueRows(save)
    expect(rows.map((row) => row.id)).toEqual(['second', 'first'])
    expect(rows.map((row) => row.order)).toEqual([1, 2])
    expect(rows[0]).toMatchObject({ badge: REST_HEAD_BADGE, dim: false })
    expect(rows[1]).toMatchObject({ badge: null, dim: false })
    expect(restZoneTitle(rows.length)).toBe('休息区 · 队首上工 · 2 人')
  })

  it('draws no numbers when the rest queue is empty', () => {
    expect(restQueueRows(createSave())).toEqual([])
    expect(restZoneTitle(0)).toBe('休息区 · 队首上工 · 0 人')
    const restAt = workersPanelSource.indexOf('aria-label="休息区"')
    const emptyAt = workersPanelSource.indexOf('class="empty-rest"')
    const list = workersPanelSource.slice(restAt, emptyAt)
    expect(list).toContain('v-if="restRows.length"')
    expect(list).toContain('class="rest-order"')
    expect(list.indexOf('v-if="restRows.length"')).toBeLessThan(list.indexOf('class="rest-order"'))
  })

  it('marks a not-full head as blocking and dims the rows behind', () => {
    const wounded = saveWith(
      worker({ id: 'head', hp: 10, hpMax: 20 }),
      worker({ id: 'behind' }),
      worker({ id: 'tail', hp: 8, hpMax: 20 }),
    )
    const rows = restQueueRows(wounded)
    expect(rows.map((row) => [row.order, row.badge, row.dim])).toEqual([
      [1, REST_BLOCK_BADGE, false],
      [2, null, true],
      [3, null, true],
    ])

    const worn = saveWith(
      worker({ id: 'head', hp: 20, hpMax: 20, fatigueDebt: 0.4 }),
      worker({ id: 'behind' }),
    )
    expect(restQueueRows(worn).map((row) => [row.badge, row.dim])).toEqual([
      [REST_BLOCK_BADGE, false],
      [null, true],
    ])

    const ready = saveWith(worker({ id: 'only', hp: 12, hpMax: 20 }))
    expect(restQueueRows(ready)[0]).toMatchObject({
      id: 'only',
      order: 1,
      badge: REST_BLOCK_BADGE,
      dim: false,
    })

    const styleAt = workersPanelSource.indexOf('<style')
    expect(workersPanelSource.slice(styleAt)).toMatch(/\.rest-row\.queue-dim\s*\{[^}]*opacity:\s*0\.5/)
    expect(workersPanelSource).toContain("'queue-dim': row.dim")
    expect(workersPanelSource).toContain("'queue-ready': row.badge === REST_HEAD_BADGE")
  })
})
