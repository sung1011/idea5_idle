import { describe, expect, it } from 'vitest'
import { createSave } from '../sim/createSave'
import { STATION_ORDER } from '../sim/tables'
import type { Worker } from '../sim/types'
import app from './app.vue?raw'
import { dockStationHp } from './dockStationHp'

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

describe('dock station hp', () => {
  it('draws six cells in STATION_ORDER and leaves empty stations at 0', () => {
    const cells = dockStationHp(createSave())
    expect(cells.map((cell) => cell.stationId)).toEqual([...STATION_ORDER])
    expect(cells).toHaveLength(6)
    expect(cells.every((cell) => cell.fill === 0)).toBe(true)
  })

  it('fills an occupied station from wearHp over hpMax', () => {
    const save = createSave()
    save.workers.push(
      worker({ id: 'herb', assignment: 'herbalism', hp: 20, hpMax: 20, fatigueDebt: 0 }),
      worker({ id: 'cook', assignment: 'cooking', hp: 10, hpMax: 20, fatigueDebt: 0 }),
      worker({ id: 'mine', assignment: 'mining', hp: 4, hpMax: 20, fatigueDebt: 0 }),
      worker({ id: 'hunt', assignment: 'hunting', hp: 20, hpMax: 20, fatigueDebt: 8 }),
      worker({ id: 'rest', assignment: null, hp: 20, hpMax: 20 }),
    )
    const cells = dockStationHp(save)
    const byId = Object.fromEntries(cells.map((cell) => [cell.stationId, cell]))
    expect(byId.herbalism).toMatchObject({ fill: 1, tone: 'full' })
    expect(byId.alchemy).toMatchObject({ fill: 0 })
    expect(byId.cooking).toMatchObject({ fill: 0.5, tone: 'mid' })
    expect(byId.mining).toMatchObject({ fill: 0.2, tone: 'low' })
    expect(byId.hunting).toMatchObject({ fill: 0.6, tone: 'mid' })
    expect(byId.inscription).toMatchObject({ fill: 0 })
  })

  it('keeps the strip inside the dock, above the tabs, without station labels', () => {
    const dock = app.slice(app.indexOf('<nav class="dock"'), app.indexOf('</nav>'))
    const strip = dock.slice(0, dock.indexOf('class="dock-tabs"'))
    expect(strip).toContain('class="dock-hp"')
    expect(strip).toContain('stationHp')
    expect(app).toContain('dockStationHp(game.save)')
    expect(strip).toContain('aria-hidden="true"')
    expect(strip).not.toContain('<button')
    expect(strip).not.toContain('@click')
    expect(strip).not.toContain('采药')
    expect(strip).not.toContain('炼金')
    expect(dock.indexOf('class="dock-hp"')).toBeLessThan(dock.indexOf('v-for="t in APP_TABS"'))
    expect(app).toContain('pointer-events: none')
    expect(app).toContain('height: 5px')
  })
})