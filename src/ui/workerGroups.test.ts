import { describe, expect, it } from 'vitest'
import { assignWorker } from '../sim/assign'
import { spawnWorkerWith } from '../sim/recruit'
import { createSave } from '../sim/createSave'
import { STATION_WORKER_CAP, WORKER_QUALITY_TABLE } from '../sim/tables'
import { WORKSHOP_TAB_IDS } from './workshopTabs'
import {
  CREW_DOT_EMPTY,
  DEFAULT_WORKER_GROUP_ORDER,
  WORKER_GROUP_ORDER_KEY,
  canAssignWorkerTo,
  groupWorkersByQuality,
  loadWorkerGroupOrder,
  rosterDutyCounts,
  saveWorkerGroupOrder,
  stationAssignCaption,
  stationCrewDots,
  toggleWorkerGroupOrder,
  workerAssignChoices,
  workerDutyKind,
  workerDutyLabel,
  workerGroupOrderOf,
  workerShopCaption,
  workerShortName,
} from './workerGroups'

function memory(): Storage {
  const bag = new Map<string, string>()
  return {
    get length() {
      return bag.size
    },
    clear() {
      bag.clear()
    },
    getItem(key: string) {
      return bag.has(key) ? bag.get(key)! : null
    },
    key(index: number) {
      return [...bag.keys()][index] ?? null
    },
    removeItem(key: string) {
      bag.delete(key)
    },
    setItem(key: string, value: string) {
      bag.set(key, value)
    },
  }
}

describe('groupWorkersByQuality', () => {
  it('skips empty tiers and keeps roster order inside a group', () => {
    const save = createSave()
    const whiteA = spawnWorkerWith(save, 1, 'laborer')
    const orange = spawnWorkerWith(save, 6, 'hunter')
    const whiteB = spawnWorkerWith(save, 1, 'artisan')
    const groups = groupWorkersByQuality(save.workers, 'highFirst')
    expect(groups.map((g) => g.id)).toEqual(['orange', 'white'])
    expect(groups[0]?.workers.map((w) => w.id)).toEqual([orange.id])
    expect(groups[1]?.workers.map((w) => w.id)).toEqual([whiteA.id, whiteB.id])
  })

  it('can flip to low-first segments', () => {
    const save = createSave()
    spawnWorkerWith(save, 10, 'knight')
    spawnWorkerWith(save, 2, 'miner')
    expect(groupWorkersByQuality(save.workers, 'lowFirst').map((g) => g.id)).toEqual([
      'green',
      'rainbow',
    ])
    expect(groupWorkersByQuality(save.workers).map((g) => g.id)).toEqual(['rainbow', 'green'])
  })
})

describe('worker duty and names', () => {
  it('labels rest, station duty, and combat', () => {
    const save = createSave()
    const rest = spawnWorkerWith(save, 1, 'laborer')
    const busy = spawnWorkerWith(save, 2, 'miner')
    busy.assignment = 'mining'
    expect(workerDutyKind(save, rest)).toBe('rest')
    expect(workerDutyKind(save, busy)).toBe('busy')
    expect(workerDutyLabel(save, rest)).toBe('休息')
    expect(workerDutyLabel(save, busy)).toBe('在岗 · 采矿')
    expect(workerShortName(rest)).toBe(rest.name)
    expect(workerShortName({ ...rest, name: undefined })).toBe(rest.id)
  })

  it('counts rest and on-duty separately', () => {
    const save = createSave()
    spawnWorkerWith(save, 1, 'laborer')
    const busy = spawnWorkerWith(save, 1, 'artisan')
    busy.assignment = 'forging'
    expect(rosterDutyCounts(save)).toEqual({ total: 2, rest: 1, busy: 1, fight: 0 })
  })
})

describe('station crew dots and assign choices', () => {
  it('pads two slots: quality color when occupied, gray when empty', () => {
    const save = createSave()
    expect(stationCrewDots(save, null)).toEqual([
      { empty: true, color: CREW_DOT_EMPTY },
      { empty: true, color: CREW_DOT_EMPTY },
    ])
    expect(stationAssignCaption(save, null)).toBe('休息')

    const orange = spawnWorkerWith(save, 6, 'hunter')
    const blue = spawnWorkerWith(save, 3, 'laborer')
    assignWorker(save, orange.id, 'hunting')
    expect(stationCrewDots(save, 'hunting')).toEqual([
      { empty: false, color: WORKER_QUALITY_TABLE[6].color },
      { empty: true, color: CREW_DOT_EMPTY },
    ])
    expect(stationAssignCaption(save, 'hunting')).toBe(`狩猎 · 1/${STATION_WORKER_CAP}`)
    expect(workerShopCaption(save, orange)).toBe(`狩猎 · 1/${STATION_WORKER_CAP}`)
    expect(workerShopCaption(save, blue)).toBe('休息')

    assignWorker(save, blue.id, 'hunting')
    expect(stationCrewDots(save, 'hunting')).toEqual([
      { empty: false, color: WORKER_QUALITY_TABLE[6].color },
      { empty: false, color: WORKER_QUALITY_TABLE[3].color },
    ])
    expect(stationAssignCaption(save, 'hunting')).toBe(`狩猎 · 2/${STATION_WORKER_CAP}`)
  })

  it('lists seven workshop tabs plus rest; full stations cannot take another worker', () => {
    const save = createSave()
    const rest = spawnWorkerWith(save, 1, 'laborer')
    const a = spawnWorkerWith(save, 2, 'miner')
    const b = spawnWorkerWith(save, 3, 'artisan')
    assignWorker(save, a.id, 'mining')
    assignWorker(save, b.id, 'mining')
    const extra = spawnWorkerWith(save, 1, 'wanderer')

    expect(canAssignWorkerTo(save, extra, 'mining')).toBe(false)
    expect(canAssignWorkerTo(save, a, 'mining')).toBe(false)
    expect(canAssignWorkerTo(save, extra, 'forging')).toBe(true)
    expect(canAssignWorkerTo(save, extra, null)).toBe(false)
    expect(canAssignWorkerTo(save, a, null)).toBe(true)

    const choices = workerAssignChoices(save, extra)
    expect(choices.map((c) => c.stationId)).toEqual([...WORKSHOP_TAB_IDS, null])
    expect(choices).toHaveLength(8)
    const mining = choices.find((c) => c.stationId === 'mining')
    const restChoice = choices.find((c) => c.stationId === null)
    expect(mining?.disabled).toBe(true)
    expect(mining?.current).toBe(false)
    expect(restChoice?.current).toBe(true)
    expect(restChoice?.disabled).toBe(true)
    expect(restChoice?.label).toBe('休息')
    expect(choices.find((c) => c.stationId === 'forging')?.disabled).toBe(false)
    expect(canAssignWorkerTo(save, rest, 'forging')).toBe(true)
  })
})

describe('worker group order prefs', () => {
  it('defaults high-first and persists a flip', () => {
    expect(DEFAULT_WORKER_GROUP_ORDER).toBe('highFirst')
    expect(workerGroupOrderOf('nope')).toBe('highFirst')
    expect(toggleWorkerGroupOrder('highFirst')).toBe('lowFirst')
    const store = memory()
    expect(loadWorkerGroupOrder(store)).toBe('highFirst')
    expect(saveWorkerGroupOrder('lowFirst', store)).toBe('lowFirst')
    expect(store.getItem(WORKER_GROUP_ORDER_KEY)).toBe('lowFirst')
    expect(loadWorkerGroupOrder(store)).toBe('lowFirst')
  })
})
