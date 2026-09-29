import { describe, expect, it } from 'vitest'
import { createSave } from '../sim/createSave'
import type { Save, Worker } from '../sim/types'
import sheetSource from './campSheet.vue?raw'
import workersPanelSource from './workersPanelV2.vue?raw'
import { restFoodBand, workshopQueueHead } from './workshopQueueHead'

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

describe('workshop queue head', () => {
  it('shows the first resting worker as the queue head', () => {
    const save = saveWith(
      worker({ id: 'on-duty', name: '在岗的', assignment: 'herbalism', race: 'orc' }),
      worker({ id: 'second', name: '后排', race: 'troll' }),
      worker({ id: 'first', name: '高角', race: 'highmountainTauren' }),
    )
    const head = workshopQueueHead(save)
    expect(head.kind).toBe('worker')
    if (head.kind !== 'worker') return
    expect(head.id).toBe('second')
    expect(head.title).toBe('后排 · 巨魔')
    expect(head.hpLabel).toBe('20')
    expect(workshopQueueHead(saveWith(worker({ id: 'only', name: '高角', race: 'highmountainTauren' }))).kind).toBe('worker')
    const named = workshopQueueHead(saveWith(worker({ id: 'only', name: '高角', race: 'highmountainTauren' })))
    expect(named.kind === 'worker' && named.title).toBe('高角 · 至高岭')
  })

  it('stays on the wounded head instead of skipping to the next full worker', () => {
    const head = workshopQueueHead(
      saveWith(
        worker({ id: 'head', name: '堵着', race: 'magharOrc', hp: 10, hpMax: 20, fatigueDebt: 0.6 }),
        worker({ id: 'behind', name: '后面', race: 'zandalariTroll' }),
      ),
    )
    expect(head.kind).toBe('worker')
    if (head.kind !== 'worker') return
    expect(head.id).toBe('head')
    expect(head.title).toBe('堵着 · 玛格汉')
    expect(head.hpLabel).toBe('9')
  })

  it('is empty when nobody is waiting in the rest queue', () => {
    expect(workshopQueueHead(createSave())).toEqual({ kind: 'empty' })
    expect(
      workshopQueueHead(
        saveWith(
          worker({ id: 'a', assignment: 'mining' }),
          worker({ id: 'b', assignment: 'cooking' }),
        ),
      ),
    ).toEqual({ kind: 'empty' })
    const nameless = workshopQueueHead(saveWith(worker({ id: 'plain' })))
    expect(nameless.kind === 'worker' && nameless.title).toBe('plain')
  })

  it('turns the food caption red only when the chosen dish is almost gone', () => {
    expect(restFoodBand(null, 0)).toEqual({ itemId: null, qty: 0, caption: '未选', low: false })
    expect(restFoodBand('meal', 3)).toMatchObject({ caption: '×3', low: false })
    expect(restFoodBand('roast', 2)).toMatchObject({ caption: '×2', low: true })
    expect(restFoodBand('stew', 0)).toMatchObject({ caption: '×0', low: true })
  })
})

describe('camp sheet replaces the workshop queue bar', () => {
  it('drops the queue bar and keeps recruit, food, and the low-stock hint in the sheet', () => {
    expect(workersPanelSource).not.toContain('aria-label="工坊状态"')
    expect(workersPanelSource).not.toContain('class="band-recruit"')
    expect(workersPanelSource).not.toContain('队列空')
    expect(sheetSource).toContain('抽苦工')
    expect(sheetSource).toContain('伙食 · {{ foodLabel }}')
    expect(sheetSource).toContain('foodBand.low')
    expect(sheetSource).toContain('>详情</button>')
    const style = sheetSource.slice(sheetSource.indexOf('<style'))
    expect(style).toMatch(/\.jump\.food\.low\s*\{[^}]*color:\s*#b42318/)
  })
})
