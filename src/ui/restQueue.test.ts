import { describe, expect, it } from 'vitest'
import { createSave } from '../sim/createSave'
import type { Save, Worker } from '../sim/types'
import sheetSource from './campSheet.vue?raw'
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
    expect(restZoneTitle(rows.length)).toBe('营地')
  })

  it('draws no numbers when the rest queue is empty', () => {
    expect(restQueueRows(createSave())).toEqual([])
    expect(restZoneTitle(0)).toBe('营地')
    const restAt = sheetSource.indexOf('aria-label="营地"')
    const emptyAt = sheetSource.indexOf('class="empty"')
    const list = sheetSource.slice(restAt, emptyAt)
    expect(list).toContain('v-if="rows.length"')
    expect(list).toContain('class="order"')
    expect(list.indexOf('v-if="rows.length"')).toBeLessThan(list.indexOf('class="order"'))
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

    const styleAt = sheetSource.indexOf('<style')
    expect(sheetSource.slice(styleAt)).toMatch(/\.row\.queue-dim\s*\{[^}]*opacity:\s*0\.5/)
    expect(sheetSource).toContain("'queue-dim': row.dim")
    expect(sheetSource).toContain("'queue-ready': row.badge === REST_HEAD_BADGE")
  })
})
