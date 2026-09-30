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
    expect(rows[0]).toMatchObject({ badge: REST_HEAD_BADGE, dim: false, orderMark: null, orderMuted: false })
    expect(rows[1]).toMatchObject({ badge: null, dim: false, orderMark: '2', orderMuted: false })
    expect(restZoneTitle(rows.length)).toBe('营地')
  })

  it('puts 2, 3, 4 on the avatar and leaves the head badge without a digit', () => {
    expect(restQueueRows(createSave())).toEqual([])
    expect(restZoneTitle(0)).toBe('营地')
    const restAt = sheetSource.indexOf('aria-label="营地"')
    const emptyAt = sheetSource.indexOf('class="empty"')
    const list = sheetSource.slice(restAt, emptyAt)
    expect(list).toContain('v-if="rows.length"')
    expect(list).toContain('class="badge"')
    expect(list).toContain('class="order"')
    expect(list).toContain('row.orderMark')
    expect(list).toContain('row.orderMuted')
    expect(list.indexOf('v-if="rows.length"')).toBeLessThan(list.indexOf('class="badge"'))
    expect(list.indexOf('class="face"')).toBeLessThan(list.indexOf('class="order"'))
    const styleAt = sheetSource.indexOf('<style')
    const style = sheetSource.slice(styleAt)
    expect(style).toMatch(/\.order\s*\{[^}]*border-radius:\s*4px/)
    expect(style).toMatch(/\.order\s*\{[^}]*background:\s*#24180e/)
    expect(style).toMatch(/\.order\s*\{[^}]*color:\s*#fff/)
    expect(style).toMatch(/\.order\s*\{[^}]*font-size:\s*9px/)
    expect(style).toMatch(/\.order\.muted\s*\{[^}]*color:\s*#d5cfc6/)
    expect(style).toMatch(/\.badge\s*\{[^}]*background:\s*#3f9a3a/)
  })

  it('marks a not-full head as blocking and dims the rows behind', () => {
    const wounded = saveWith(
      worker({ id: 'head', hp: 10, hpMax: 20 }),
      worker({ id: 'behind' }),
      worker({ id: 'tail', hp: 8, hpMax: 20 }),
    )
    const rows = restQueueRows(wounded)
    expect(rows.map((row) => [row.order, row.badge, row.dim, row.orderMark, row.orderMuted])).toEqual([
      [1, REST_BLOCK_BADGE, false, null, true],
      [2, null, true, '2', false],
      [3, null, true, '3', true],
    ])

    const worn = saveWith(
      worker({ id: 'head', hp: 20, hpMax: 20, fatigueDebt: 0.4 }),
      worker({ id: 'behind' }),
    )
    expect(restQueueRows(worn).map((row) => [row.badge, row.dim, row.orderMark, row.orderMuted])).toEqual([
      [REST_BLOCK_BADGE, false, null, true],
      [null, true, '2', false],
    ])

    const ready = saveWith(worker({ id: 'only', hp: 12, hpMax: 20 }))
    expect(restQueueRows(ready)[0]).toMatchObject({
      id: 'only',
      order: 1,
      badge: REST_BLOCK_BADGE,
      dim: false,
      orderMark: null,
      orderMuted: true,
    })

    const styleAt = sheetSource.indexOf('<style')
    expect(sheetSource.slice(styleAt)).toMatch(/\.row\.queue-dim\s*\{[^}]*opacity:\s*0\.5/)
    expect(sheetSource).toContain("'queue-dim': row.dim")
    expect(sheetSource).toContain("'queue-ready': row.badge === REST_HEAD_BADGE")
  })

  it('renumbers after dequeue, enqueue, and a fuse that consumes two camp workers', () => {
    const save = saveWith(
      worker({ id: 'a' }),
      worker({ id: 'b', hp: 9, hpMax: 20 }),
      worker({ id: 'c' }),
      worker({ id: 'd' }),
    )
    expect(restQueueRows(save).map((row) => [row.id, row.orderMark, row.orderMuted])).toEqual([
      ['a', null, false],
      ['b', '2', true],
      ['c', '3', false],
      ['d', '4', false],
    ])

    save.workers = save.workers.filter((row) => row.id !== 'a')
    expect(restQueueRows(save).map((row) => [row.id, row.orderMark, row.badge])).toEqual([
      ['b', null, REST_BLOCK_BADGE],
      ['c', '2', null],
      ['d', '3', null],
    ])

    save.workers.push(worker({ id: 'e', hp: 20, hpMax: 20, fatigueDebt: 0.2 }))
    expect(restQueueRows(save).map((row) => [row.id, row.orderMark, row.orderMuted])).toEqual([
      ['b', null, true],
      ['c', '2', false],
      ['d', '3', false],
      ['e', '4', true],
    ])

    save.workers = save.workers.filter((row) => row.id !== 'c' && row.id !== 'd')
    save.workers.push(worker({ id: 'fused' }))
    expect(restQueueRows(save).map((row) => [row.id, row.orderMark, row.orderMuted])).toEqual([
      ['b', null, true],
      ['e', '2', true],
      ['fused', '3', false],
    ])
  })
})
