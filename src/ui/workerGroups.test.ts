import { describe, expect, it } from 'vitest'
import { spawnWorkerWith } from '../sim/recruit'
import { createSave } from '../sim/createSave'
import {
  DEFAULT_WORKER_GROUP_ORDER,
  WORKER_GROUP_ORDER_KEY,
  groupWorkersByQuality,
  loadWorkerGroupOrder,
  rosterDutyCounts,
  saveWorkerGroupOrder,
  toggleWorkerGroupOrder,
  workerDutyKind,
  workerDutyLabel,
  workerGroupOrderOf,
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
