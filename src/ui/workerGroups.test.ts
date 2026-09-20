import { describe, expect, it } from 'vitest'
import { assignWorker } from '../sim/assign'
import { beginEnemyCombat } from '../sim/combat'
import { spawnWorkerWith } from '../sim/recruit'
import { createSave } from '../sim/createSave'
import { STATION_WORKER_CAP, WORKER_QUALITY_TABLE } from '../sim/tables'
import type { EnemyEncounter } from '../sim/types'
import { WORKSHOP_TAB_IDS } from './workshopTabs'
import {
  CREW_DOT_EMPTY,
  DEFAULT_WORKER_GROUP_ORDER,
  WORKER_GROUP_ORDER_KEY,
  canAssignWorkerTo,
  canGoToAssignedWorkshop,
  groupWorkersByQuality,
  loadWorkerGroupOrder,
  rosterDutyCounts,
  rosterSlotCounts,
  saveWorkerGroupOrder,
  stationAssignCaption,
  stationCrewDots,
  toggleWorkerGroupOrder,
  unassignedWorkers,
  mainlineCombatWorkers,
  restingWorkers,
  workerAssignChoices,
  workerDutyKind,
  workerDutyLabel,
  workerGroupOrderOf,
  workerShopCaption,
  workerShortName,
  workshopStationBoards,
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
    expect(canGoToAssignedWorkshop(rest)).toBe(false)
    expect(canGoToAssignedWorkshop(a)).toBe(true)
    expect(canGoToAssignedWorkshop(extra)).toBe(false)
    expect(choices.every((c) => c.canFuse === false)).toBe(true)
  })

  it('marks a station fusable when the picker matches an existing same-tier worker', () => {
    const save = createSave()
    const idle = spawnWorkerWith(save, 1, 'laborer')
    const mate = spawnWorkerWith(save, 1, 'artisan')
    const other = spawnWorkerWith(save, 3, 'miner')
    assignWorker(save, mate.id, 'fishing')
    assignWorker(save, other.id, 'mining')

    const idleChoices = workerAssignChoices(save, idle)
    expect(idleChoices.find((c) => c.stationId === 'fishing')?.canFuse).toBe(true)
    expect(idleChoices.find((c) => c.stationId === 'mining')?.canFuse).toBe(false)
    expect(idleChoices.find((c) => c.stationId === null)?.canFuse).toBe(false)

    assignWorker(save, idle.id, 'fishing')
    const together = workerAssignChoices(save, idle)
    expect(together.find((c) => c.stationId === 'fishing')?.canFuse).toBe(true)
    expect(together.find((c) => c.stationId === 'mining')?.canFuse).toBe(false)
  })
})

describe('workshop station boards', () => {
  it('lists seven stations with two padded slots and unassigned rest list', () => {
    const save = createSave()
    const rest = spawnWorkerWith(save, 1, 'laborer')
    const miner = spawnWorkerWith(save, 2, 'miner')
    const cook = spawnWorkerWith(save, 3, 'cook')
    assignWorker(save, miner.id, 'mining')
    assignWorker(save, cook.id, 'cooking')

    const boards = workshopStationBoards(save)
    expect(boards.map((board) => board.stationId)).toEqual([...WORKSHOP_TAB_IDS])
    expect(boards).toHaveLength(7)
    const mining = boards.find((board) => board.stationId === 'mining')
    const cooking = boards.find((board) => board.stationId === 'cooking')
    const fishing = boards.find((board) => board.stationId === 'fishing')
    expect(mining?.label).toBe('采矿')
    expect(mining?.filled).toBe(1)
    expect(mining?.cap).toBe(STATION_WORKER_CAP)
    expect(mining?.slots).toEqual([miner, null])
    expect(cooking?.slots).toEqual([cook, null])
    expect(fishing?.slots).toEqual([null, null])
    expect(rosterSlotCounts(save)).toEqual({ stations: 7, filled: 2, cap: 14 })
    expect(unassignedWorkers(save).map((worker) => worker.id)).toEqual([rest.id])
  })

  it('splits unassigned roster into mainline fighters and rest, and never duplicates workshop crew', () => {
    const save = createSave()
    const rest = spawnWorkerWith(save, 1, 'laborer')
    const fighter = spawnWorkerWith(save, 1, 'wanderer')
    const shop = spawnWorkerWith(save, 2, 'miner')
    assignWorker(save, shop.id, 'mining')
    const enc: EnemyEncounter = {
      kind: 'enemy',
      id: 'test-enemy',
      label: '试敌',
      quality: 'green',
      needs: { meal: 1 },
      lootGold: 8,
      departed: false,
      combat: null,
      lootClaimed: false,
      enemyRank: 'minion',
      weaknesses: ['fire'],
      revealedWeaknesses: [],
    }
    save.encounters[0] = enc
    beginEnemyCombat(enc, [fighter], 1_000)

    expect(mainlineCombatWorkers(save).map((worker) => worker.id)).toEqual([fighter.id])
    expect(restingWorkers(save).map((worker) => worker.id)).toEqual([rest.id])
    expect(unassignedWorkers(save).map((worker) => worker.id)).toEqual([rest.id, fighter.id])

    enc.combat?.workerIds.push(shop.id)
    expect(mainlineCombatWorkers(save).map((worker) => worker.id)).toEqual([fighter.id])
    expect(workshopStationBoards(save).find((board) => board.stationId === 'mining')?.slots[0]?.id).toBe(shop.id)

    if (enc.combat) enc.combat.outcome = 'win'
    expect(mainlineCombatWorkers(save)).toEqual([])
    expect(restingWorkers(save).map((worker) => worker.id)).toEqual([rest.id, fighter.id])
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
