import { afterEach, describe, expect, it } from 'vitest'
import { assignWorker } from './assign'
import { itemQty } from './bank'
import { createSave } from './createSave'
import { restHealAmount } from './workshopHp'
import { spawnWorkerWith } from './recruit'
import { keepStationsOpen } from './stationUnlock'
import { completeCycle, stepStation } from './stations'
import { ticks } from './tick'
import type { Save, StationId } from './types'
import {
  STATION_WEAR_DETAIL,
  STATION_WEAR_LABEL,
  STATION_WEAR_REROLL_S,
  applyStationWearOnComplete,
  ensureStationWear,
  pickStationWearCount,
  pinStationWear,
  rollStationWear,
  setStationWearScareOverride,
  stationWearCountWeights,
  stationWearRemainText,
  stationWearStrengthWord,
  stationWearUnit,
  stationWearView,
  stationWearWindow,
} from './stationWear'

afterEach(() => {
  setStationWearScareOverride(null)
})

function roster(): Save {
  const save = keepStationsOpen(createSave())
  spawnWorkerWith(save, 1, 'laborer')
  return save
}

function put(save: Save, stationId: StationId): Save['workers'][number] {
  const worker = save.workers[0]
  expect(assignWorker(save, worker.id, stationId).ok).toBe(true)
  return worker
}

describe('station wear affix curve', () => {
  it('rolls 0–1 affixes at level 1 and leans toward 3 at level 10', () => {
    expect(STATION_WEAR_REROLL_S).toBe(8 * 3600)
    const low = stationWearCountWeights(1)
    expect(low[2]).toBe(0)
    expect(low[3]).toBe(0)
    expect(low[0]).toBeGreaterThan(low[1])
    expect(low[0]).toBeGreaterThan(0)
    expect(low[1]).toBeGreaterThan(0)
    expect(pickStationWearCount(1, 0)).toBe(0)
    expect(pickStationWearCount(1, 0.99)).toBe(1)

    const high = stationWearCountWeights(10)
    expect(high[0]).toBe(0)
    expect(high[3]).toBeGreaterThan(high[2])
    expect(high[3]).toBeGreaterThan(high[1])
    expect(pickStationWearCount(10, 0)).toBe(1)
    expect(pickStationWearCount(10, 0.99)).toBe(3)
    expect(pickStationWearCount(12, 0.99)).toBe(3)
  })

  it('grows one affix with station level but stays within a rest heal at the top', () => {
    const low = stationWearUnit(24, 1, true)
    const mid = stationWearUnit(24, 5, true)
    const high = stationWearUnit(24, 10, true)
    expect(low).toBeGreaterThan(0)
    expect(mid).toBeGreaterThan(low)
    expect(high).toBeGreaterThan(mid)
    expect(stationWearUnit(24, 10, false)).toBeLessThan(high)
    expect(stationWearStrengthWord(1)).toBe('轻微')
    expect(stationWearStrengthWord(5)).toBe('加重')
    expect(stationWearStrengthWord(10)).toBe('狠')
    expect(Math.floor(high * 3)).toBeLessThanOrEqual(restHealAmount(24) + 1)
  })

  it('rerolls the whole station when the 8 hour window changes', () => {
    const save = roster()
    save.stations.herbalism.stationLevel = 10
    save.elapsedS = 0
    const first = rollStationWear(save, 'herbalism', 10)
    save.elapsedS = STATION_WEAR_REROLL_S
    const next = rollStationWear(save, 'herbalism', 10)
    expect(stationWearWindow(0)).toBe(0)
    expect(stationWearWindow(STATION_WEAR_REROLL_S)).toBe(1)
    expect(next.join(',')).not.toBe(first.join(','))

    pinStationWear(save, 'herbalism', ['dot'])
    save.elapsedS = 0
    pinStationWear(save, 'herbalism', ['scare'])
    expect(ensureStationWear(save, 'herbalism')).toEqual(['scare'])
    save.elapsedS = STATION_WEAR_REROLL_S
    const rolled = ensureStationWear(save, 'herbalism')
    expect(save.stations.herbalism.wearWindow).toBe(1)
    expect(rolled).not.toEqual(['scare'])
    expect(ensureStationWear(save, 'herbalism')).toEqual(rolled)
    expect(stationWearRemainText(0)).toBe('8小时0分后更换')
  })
})

describe('station wear paradigms', () => {
  it('dots herbalism and mining while the craft is still in progress', () => {
    for (const stationId of ['herbalism', 'mining'] as const) {
      for (const auto of [false, true]) {
        const save = roster()
        const worker = put(save, stationId)
        save.stations[stationId].auto = auto
        if (!auto) save.stations[stationId].manualRounds = 1
        pinStationWear(save, stationId, ['dot'])
        const after = ticks(save, 3)
        expect(after.stations[stationId].completed).toBe(0)
        expect(after.workers[0].assignment).toBe(stationId)
        expect(after.workers[0].fatigueDebt).toBeGreaterThan(0)
        expect(after.workers[0].fatigueDebt).toBeLessThan(1)
        expect(after.workers[0].hp).toBe(worker.hpMax)
      }
    }
  })

  it('can scare during a hunting cycle before the round ends', () => {
    const save = roster()
    const worker = put(save, 'hunting')
    pinStationWear(save, 'hunting', ['scare'])
    setStationWearScareOverride(() => 0)
    const after = ticks(save, 1)
    expect(after.stations.hunting.completed).toBe(0)
    expect(after.workers[0].fatigueDebt).toBeGreaterThan(0)
    expect(after.workers[0].hp).toBe(worker.hpMax)
    expect(after.stations.hunting.wearScareHit).toBe(true)
  })

  it('ships the goods before a finish drop, even if that drop sends the worker home', () => {
    const save = roster()
    const worker = put(save, 'herbalism')
    pinStationWear(save, 'herbalism', ['finish'])
    const quiet = ticks(save, 3)
    expect(quiet.stations.herbalism.completed).toBe(0)
    expect(quiet.workers[0].fatigueDebt).toBe(0)

    const before = itemQty(save, 'herb')
    worker.hp = 1
    worker.fatigueDebt = 0.95
    expect(completeCycle(save, 'herbalism')).toBe(true)
    expect(itemQty(save, 'herb')).toBeGreaterThan(before)
    expect(save.stations.herbalism.completed).toBeGreaterThan(0)
    expect(worker.assignment).toBeNull()
    expect(worker.hp).toBeGreaterThanOrEqual(0)
    const marching = save.encounters.some(
      (enc) => enc.kind === 'enemy' && enc.combat?.returning?.some((row) => row.id === worker.id),
    )
    expect(marching).toBe(false)
  })

  it('stacks dot and finish on the same station', () => {
    const dotOnly = roster()
    put(dotOnly, 'herbalism')
    pinStationWear(dotOnly, 'herbalism', ['dot'])
    expect(completeCycle(dotOnly, 'herbalism')).toBe(true)
    const dotDebt = dotOnly.workers[0].fatigueDebt

    const both = roster()
    put(both, 'herbalism')
    pinStationWear(both, 'herbalism', ['dot', 'finish'])
    expect(completeCycle(both, 'herbalism')).toBe(true)
    expect(both.workers[0].fatigueDebt).toBeGreaterThan(dotDebt * 1.5)
  })

  it('shows the live affixes on the station detail view', () => {
    const save = roster()
    pinStationWear(save, 'alchemy', ['dot', 'scare', 'finish'])
    const view = stationWearView(save, 'alchemy')
    expect(view.rows.map((row) => row.label)).toEqual([
      STATION_WEAR_LABEL.dot,
      STATION_WEAR_LABEL.scare,
      STATION_WEAR_LABEL.finish,
    ])
    expect(view.rows.map((row) => row.detail)).toEqual([
      STATION_WEAR_DETAIL.dot,
      STATION_WEAR_DETAIL.scare,
      STATION_WEAR_DETAIL.finish,
    ])
    expect(view.strength).toBe('轻微')
    expect(view.remainText).toContain('后更换')
    save.stations.alchemy.stationLevel = 10
    expect(stationWearView(save, 'alchemy').strength).toBe('狠')

    pinStationWear(save, 'cooking', [])
    const empty = stationWearView(save, 'cooking')
    expect(empty.rows).toEqual([])
    expect(empty.emptyText).toContain('没有掉血词条')
  })

  it('does not cancel a produced cycle when finish wear is applied after the bank write', () => {
    const save = roster()
    const worker = put(save, 'cooking')
    save.stations.cooking.stationLevel = 1
    save.bank.fish = 4
    pinStationWear(save, 'cooking', ['finish'])
    const before = itemQty(save, 'meal')
    worker.hp = 1
    worker.fatigueDebt = 5
    expect(completeCycle(save, 'cooking')).toBe(true)
    expect(itemQty(save, 'meal')).toBeGreaterThan(before)
    expect(worker.assignment).toBeNull()
    applyStationWearOnComplete(save, 'cooking', 0, true)
    expect(itemQty(save, 'meal')).toBeGreaterThan(before)
  })
})

describe('station wear progress hook', () => {
  it('does not wear a pinned empty station while stepping', () => {
    const save = roster()
    put(save, 'mining')
    pinStationWear(save, 'mining', [])
    stepStation(save, 'mining', 1_000)
    expect(save.workers[0].fatigueDebt).toBe(0)
  })
})
