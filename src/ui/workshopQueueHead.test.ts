import { describe, expect, it } from 'vitest'
import { createSave } from '../sim/createSave'
import type { Save, Worker } from '../sim/types'
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

describe('workshop status band', () => {
  it('puts the queue head on the left and keeps recruit at the right', () => {
    const bandAt = workersPanelSource.indexOf('aria-label="工坊状态"')
    const bandEnd = workersPanelSource.indexOf('</section>', bandAt)
    const band = workersPanelSource.slice(bandAt, bandEnd)
    expect(band).toContain('队列空')
    expect(band).toContain('queueHead.title')
    expect(band).toContain('queueHead.hpLabel')
    expect(band).not.toContain('在岗')
    expect(band).not.toContain('restHeadLine')
    expect(band.indexOf('队列空')).toBeLessThan(band.indexOf('band-rest'))
    expect(band.indexOf('band-rest')).toBeLessThan(band.indexOf('band-food'))
    expect(band.indexOf('band-food')).toBeLessThan(band.indexOf('band-recruit'))
    expect(band).toContain('休息')
    expect(band).not.toContain('营地 {{ restRows.length }}')
    expect(band).not.toContain('tile-badge')
    expect(band).toContain('抽苦工')
    const styleAt = workersPanelSource.indexOf('<style')
    const style = workersPanelSource.slice(styleAt)
    expect(style).toMatch(/\.status-band\s*\{[^}]*flex-wrap:\s*nowrap/)
    expect(style).toMatch(/\.queue-name\s*\{[^}]*text-overflow:\s*ellipsis/)
    expect(style).toMatch(/\.band-food\.low \.cap\s*\{[^}]*color:\s*#b42318/)
  })
})
