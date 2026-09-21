import { describe, expect, it } from 'vitest'
import { assignWorker } from '../sim/assign'
import { beginEnemyCombat } from '../sim/combat'
import { spawnWorkerWith } from '../sim/recruit'
import { createSave } from '../sim/createSave'
import { unlockPlayableStations } from '../sim/stationUnlock'
import { STATION_ORDER, STATION_WORKER_CAP, WORKER_QUALITY_TABLE } from '../sim/tables'
import type { EnemyEncounter } from '../sim/types'
import { DISPATCH_STATION_IDS, WORKSHOP_GROUPS } from './workshopTabs'
import {
  CREW_DOT_EMPTY,
  DEFAULT_WORKER_GROUP_ORDER,
  WORKER_GROUP_ORDER_KEY,
  assignRestingToFirstEmpty,
  canAssignWorkerTo,
  canDispatchRestingWorker,
  canGoToAssignedWorkshop,
  canWithdrawWorkshopWorker,
  firstEmptyDispatchStation,
  lastOccupiedDispatchStation,
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
  withdrawWorkshopToRest,
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
    const save = unlockPlayableStations(createSave())
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
    const save = unlockPlayableStations(createSave())
    spawnWorkerWith(save, 1, 'laborer')
    const busy = spawnWorkerWith(save, 1, 'artisan')
    busy.assignment = 'inscription'
    expect(rosterDutyCounts(save)).toEqual({ total: 2, rest: 1, busy: 1, fight: 0 })
  })
})

describe('station crew dots and assign choices', () => {
  it('pads two slots: quality color when occupied, gray when empty', () => {
    const save = unlockPlayableStations(createSave())
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

  it('lists workshop tabs plus rest; full stations cannot take another worker', () => {
    const save = unlockPlayableStations(createSave())
    const rest = spawnWorkerWith(save, 1, 'laborer')
    const a = spawnWorkerWith(save, 2, 'miner')
    const b = spawnWorkerWith(save, 3, 'artisan')
    assignWorker(save, a.id, 'mining')
    assignWorker(save, b.id, 'mining')
    const extra = spawnWorkerWith(save, 1, 'wanderer')

    expect(canAssignWorkerTo(save, extra, 'mining')).toBe(false)
    expect(canAssignWorkerTo(save, a, 'mining')).toBe(false)
    expect(canAssignWorkerTo(save, extra, 'inscription')).toBe(true)
    expect(canAssignWorkerTo(save, extra, null)).toBe(false)
    expect(canAssignWorkerTo(save, a, null)).toBe(true)

    const choices = workerAssignChoices(save, extra)
    expect(choices.map((c) => c.stationId)).toEqual([...STATION_ORDER, null])
    expect(choices).toHaveLength(7)
    const mining = choices.find((c) => c.stationId === 'mining')
    const restChoice = choices.find((c) => c.stationId === null)
    expect(mining?.disabled).toBe(true)
    expect(mining?.current).toBe(false)
    expect(restChoice?.current).toBe(true)
    expect(restChoice?.disabled).toBe(true)
    expect(restChoice?.label).toBe('休息')
    expect(choices.find((c) => c.stationId === 'inscription')?.disabled).toBe(false)
    expect(canAssignWorkerTo(save, rest, 'inscription')).toBe(true)
    expect(canGoToAssignedWorkshop(rest)).toBe(false)
    expect(canGoToAssignedWorkshop(a)).toBe(true)
    expect(canGoToAssignedWorkshop(extra)).toBe(false)
    expect(choices.every((c) => c.canFuse === false)).toBe(true)
    expect(choices.find((c) => c.stationId === 'inscription')?.locked).toBe(false)
  })

  it('marks locked stations on a new save', () => {
    const save = createSave()
    const rest = spawnWorkerWith(save, 1, 'laborer')
    const choices = workerAssignChoices(save, rest)
    expect(choices.find((c) => c.stationId === 'herbalism')?.locked).toBe(false)
    expect(choices.find((c) => c.stationId === 'alchemy')?.locked).toBe(true)
    expect(choices.find((c) => c.stationId === 'mining')?.locked).toBe(true)
    expect(canAssignWorkerTo(save, rest, 'herbalism')).toBe(true)
    expect(canAssignWorkerTo(save, rest, 'mining')).toBe(false)
  })

  it('marks a station fusable when the picker matches an existing same-tier worker', () => {
    const save = unlockPlayableStations(createSave())
    const idle = spawnWorkerWith(save, 1, 'laborer')
    const mate = spawnWorkerWith(save, 1, 'artisan')
    const other = spawnWorkerWith(save, 3, 'miner')
    assignWorker(save, mate.id, 'hunting')
    assignWorker(save, other.id, 'mining')

    const idleChoices = workerAssignChoices(save, idle)
    expect(idleChoices.find((c) => c.stationId === 'hunting')?.canFuse).toBe(true)
    expect(idleChoices.find((c) => c.stationId === 'mining')?.canFuse).toBe(false)
    expect(idleChoices.find((c) => c.stationId === null)?.canFuse).toBe(false)

    assignWorker(save, idle.id, 'hunting')
    const together = workerAssignChoices(save, idle)
    expect(together.find((c) => c.stationId === 'hunting')?.canFuse).toBe(true)
    expect(together.find((c) => c.stationId === 'mining')?.canFuse).toBe(false)
  })
})

describe('workshop station boards', () => {
  it('lists playable stations with two padded slots and unassigned rest list', () => {
    const save = unlockPlayableStations(createSave())
    const rest = spawnWorkerWith(save, 1, 'laborer')
    const miner = spawnWorkerWith(save, 2, 'miner')
    const cook = spawnWorkerWith(save, 3, 'cook')
    assignWorker(save, miner.id, 'mining')
    assignWorker(save, cook.id, 'cooking')

    const boards = workshopStationBoards(save)
    expect(boards.map((board) => board.stationId)).toEqual([
      'herbalism',
      'alchemy',
      'hunting',
      'cooking',
      'mining',
      'inscription',
    ])
    expect(boards.map((board) => board.stationId)).toEqual([...STATION_ORDER])
    expect(boards).toHaveLength(6)
    const mining = boards.find((board) => board.stationId === 'mining')
    const cooking = boards.find((board) => board.stationId === 'cooking')
    const hunting = boards.find((board) => board.stationId === 'hunting')
    expect(mining?.label).toBe('采矿')
    expect(mining?.filled).toBe(1)
    expect(mining?.cap).toBe(STATION_WORKER_CAP)
    expect(mining?.slots).toEqual([miner, null])
    expect(cooking?.slots).toEqual([cook, null])
    expect(hunting?.slots).toEqual([null, null])
    expect(rosterSlotCounts(save)).toEqual({ stations: 6, filled: 2, cap: 12 })
    expect(unassignedWorkers(save).map((worker) => worker.id)).toEqual([rest.id])
  })

  it('splits unassigned roster into mainline fighters and rest, and never duplicates workshop crew', () => {
    const save = unlockPlayableStations(createSave())
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

describe('assign resting to first empty slot', () => {
  it('scans workshop groups 药剂 / 食物 / 矿符 top to bottom, left to right', () => {
    expect(DISPATCH_STATION_IDS).toEqual([...STATION_ORDER])
    expect(DISPATCH_STATION_IDS).toEqual(WORKSHOP_GROUPS.flatMap((row) => [...row.stations]))
    expect(DISPATCH_STATION_IDS).toEqual([
      'herbalism',
      'alchemy',
      'hunting',
      'cooking',
      'mining',
      'inscription',
    ])
  })

  it('rejects when nobody is resting or every slot is full', () => {
    const empty = createSave()
    expect(firstEmptyDispatchStation(empty)).toBe('herbalism')
    expect(canDispatchRestingWorker(empty)).toBe(false)
    expect(assignRestingToFirstEmpty(empty)).toEqual({ ok: false, reason: '没有可派的工人' })

    const save = createSave()
    const fighter = spawnWorkerWith(save, 1, 'wanderer')
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
    expect(assignRestingToFirstEmpty(save)).toEqual({ ok: false, reason: '没有可派的工人' })

    const full = createSave()
    for (const stationId of DISPATCH_STATION_IDS) {
      const a = spawnWorkerWith(full, 1, 'laborer')
      const b = spawnWorkerWith(full, 1, 'artisan')
      assignWorker(full, a.id, stationId)
      assignWorker(full, b.id, stationId)
    }
    const leftover = spawnWorkerWith(full, 1, 'wanderer')
    expect(firstEmptyDispatchStation(full)).toBeNull()
    expect(canDispatchRestingWorker(full)).toBe(false)
    expect(assignRestingToFirstEmpty(full)).toEqual({ ok: false, reason: '工位已满' })
    expect(leftover.assignment).toBeNull()
  })

  it('takes the top resting worker and fills herbalism before later stations', () => {
    const save = createSave()
    const first = spawnWorkerWith(save, 1, 'laborer')
    const second = spawnWorkerWith(save, 1, 'artisan')
    expect(restingWorkers(save).map((w) => w.id)).toEqual([first.id, second.id])
    expect(canDispatchRestingWorker(save)).toBe(true)
    expect(assignRestingToFirstEmpty(save)).toEqual({ ok: true })
    expect(first.assignment).toBe('herbalism')
    expect(second.assignment).toBeNull()

    expect(assignRestingToFirstEmpty(save)).toEqual({ ok: true })
    expect(second.assignment).toBe('herbalism')
  })

  it('skips full herbalism and fills alchemy, then hunting', () => {
    const save = createSave()
    const herbA = spawnWorkerWith(save, 1, 'laborer')
    const herbB = spawnWorkerWith(save, 1, 'artisan')
    assignWorker(save, herbA.id, 'herbalism')
    assignWorker(save, herbB.id, 'herbalism')
    const idle = spawnWorkerWith(save, 2, 'miner')
    expect(firstEmptyDispatchStation(save)).toBeNull()
    expect(assignRestingToFirstEmpty(save)).toEqual({ ok: false, reason: '骑士 2 级开放炼金' })
    expect(idle.assignment).toBeNull()

    unlockPlayableStations(save)
    expect(firstEmptyDispatchStation(save)).toBe('alchemy')
    expect(assignRestingToFirstEmpty(save)).toEqual({ ok: true })
    expect(idle.assignment).toBe('alchemy')

    const alcB = spawnWorkerWith(save, 1, 'wanderer')
    assignWorker(save, alcB.id, 'alchemy')
    const next = spawnWorkerWith(save, 3, 'hunter')
    expect(firstEmptyDispatchStation(save)).toBe('hunting')
    expect(assignRestingToFirstEmpty(save)).toEqual({ ok: true })
    expect(next.assignment).toBe('hunting')
  })
})

describe('withdraw workshop to rest', () => {
  it('rejects when nobody is on duty and never pulls a fighter', () => {
    const empty = createSave()
    expect(lastOccupiedDispatchStation(empty)).toBeNull()
    expect(canWithdrawWorkshopWorker(empty)).toBe(false)
    expect(withdrawWorkshopToRest(empty)).toEqual({ ok: false, reason: '没有可撤的工人' })

    const save = createSave()
    const fighter = spawnWorkerWith(save, 1, 'wanderer')
    const enc: EnemyEncounter = {
      kind: 'enemy',
      id: 'test-enemy-withdraw',
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
    expect(canWithdrawWorkshopWorker(save)).toBe(false)
    expect(withdrawWorkshopToRest(save)).toEqual({ ok: false, reason: '没有可撤的工人' })
    expect(fighter.assignment).toBeNull()
  })

  it('withdraws the last occupied station first, last assigned at that station', () => {
    const save = unlockPlayableStations(createSave())
    const herb = spawnWorkerWith(save, 1, 'laborer')
    const huntA = spawnWorkerWith(save, 2, 'hunter')
    const huntB = spawnWorkerWith(save, 2, 'artisan')
    assignWorker(save, herb.id, 'herbalism')
    assignWorker(save, huntA.id, 'hunting')
    assignWorker(save, huntB.id, 'hunting')
    expect(lastOccupiedDispatchStation(save)).toBe('hunting')
    expect(canWithdrawWorkshopWorker(save)).toBe(true)
    expect(withdrawWorkshopToRest(save)).toEqual({ ok: true })
    expect(huntB.assignment).toBeNull()
    expect(huntA.assignment).toBe('hunting')
    expect(herb.assignment).toBe('herbalism')

    expect(withdrawWorkshopToRest(save)).toEqual({ ok: true })
    expect(huntA.assignment).toBeNull()
    expect(herb.assignment).toBe('herbalism')
    expect(lastOccupiedDispatchStation(save)).toBe('herbalism')

    expect(withdrawWorkshopToRest(save)).toEqual({ ok: true })
    expect(herb.assignment).toBeNull()
    expect(canWithdrawWorkshopWorker(save)).toBe(false)
  })

  it('reverses a 派入 scan: inscription comes off before herbalism', () => {
    const save = unlockPlayableStations(createSave())
    const herb = spawnWorkerWith(save, 1, 'laborer')
    const inscribe = spawnWorkerWith(save, 1, 'smith')
    assignWorker(save, herb.id, 'herbalism')
    assignWorker(save, inscribe.id, 'inscription')
    expect(withdrawWorkshopToRest(save)).toEqual({ ok: true })
    expect(inscribe.assignment).toBeNull()
    expect(herb.assignment).toBe('herbalism')
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
