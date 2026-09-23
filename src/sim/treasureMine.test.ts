import { describe, expect, it } from 'vitest'
import { createSave } from './createSave'
import { spawnWorker } from './recruit'
import { addToBank } from './bank'
import { hydrateLoadedSave } from '../ui/saveGame'
import {
  TREASURE_CREW_CAP,
  TREASURE_LIFE_S,
  TREASURE_MINE_CAP,
  TREASURE_RESERVE_MAX,
  addTreasureMiner,
  mineDigIntervalS,
  refreshTreasureMines,
  rejectTreasureMineRune,
  isTreasureRaidLocked,
  reinforceTreasureRaid,
  startTreasureRaid,
  stepTreasureMines,
  withdrawTreasureMiner,
} from './treasureMine'
import type { Save } from './types'

function vaultQty(save: Save): number {
  const vault = save.treasureMines.vault
  return (vault.sandGold ?? 0) + (vault.jewel ?? 0) + (vault.jade ?? 0)
}

function advance(save: Save, seconds: number): void {
  for (let i = 0; i < seconds; i += 1) {
    save.elapsedS += 1
    stepTreasureMines(save)
  }
}

function holdShadows(save: Save): void {
  for (const mine of save.treasureMines.mines) {
    mine.digCharge = {}
    for (const shadow of mine.shadows) mine.digCharge[shadow.id] = 0
  }
}

describe('treasure mines', () => {
  it('fills at most 4 holes and replaces expired or empty ones', () => {
    const save = createSave()
    expect(save.treasureMines.mines).toHaveLength(TREASURE_MINE_CAP)
    expect(save.treasureMines.mines.every((mine) => mine.reserve === TREASURE_RESERVE_MAX)).toBe(true)
    expect(save.treasureMines.mines.every((mine) => mine.expiresAtS - mine.bornAtS === TREASURE_LIFE_S)).toBe(true)
    const ids = save.treasureMines.mines.map((mine) => mine.id)
    refreshTreasureMines(save)
    expect(save.treasureMines.mines.map((mine) => mine.id)).toEqual(ids)

    const doomed = save.treasureMines.mines[0]
    doomed.reserve = 0
    refreshTreasureMines(save)
    expect(save.treasureMines.mines).toHaveLength(4)
    expect(save.treasureMines.mines.some((mine) => mine.id === doomed.id)).toBe(false)

    const aging = save.treasureMines.mines[0]
    aging.expiresAtS = save.elapsedS
    refreshTreasureMines(save)
    expect(save.treasureMines.mines).toHaveLength(4)
    expect(save.treasureMines.mines.some((mine) => mine.id === aging.id)).toBe(false)
  })

  it('sends the raid queue home with their own hp when a hole expires', () => {
    const save = createSave()
    const lead = spawnWorker(save)
    const bench = spawnWorker(save)
    const mine = save.treasureMines.mines[0]
    lead.hp = lead.hpMax
    bench.hp = bench.hpMax
    expect(startTreasureRaid(save, mine.id, [lead.id, bench.id]).ok).toBe(true)
    mine.expiresAtS = save.elapsedS
    refreshTreasureMines(save)
    expect(save.treasureMines.mines.some((row) => row.id === mine.id)).toBe(false)
    expect(lead.assignment).toBeNull()
    expect(bench.assignment).toBeNull()
    expect(lead.hp).toBe(lead.hpMax)
    expect(bench.hp).toBe(bench.hpMax)
  })

  it('hydrates an old save into a full local pool', () => {
    const raw: Partial<Save> = { ...createSave() }
    delete raw.treasureMines
    const loaded = hydrateLoadedSave(raw)
    expect(loaded?.treasureMines.mines).toHaveLength(4)
    expect(loaded?.treasureMines.vault).toEqual({})
  })

  it('digs on a level-scaled beat into the vault, not the workshop bank', () => {
    expect(mineDigIntervalS(1)).toBe(5)
    expect(mineDigIntervalS(6)).toBe(4)
    expect(mineDigIntervalS(11)).toBe(3)
    const save = createSave()
    const worker = spawnWorker(save)
    worker.level = 1
    const mine = save.treasureMines.mines[0]
    mine.owner = 'player'
    mine.shadows = []
    mine.raid = null
    mine.reserve = 10
    expect(addTreasureMiner(save, mine.id, worker.id).ok).toBe(true)
    expect(rejectTreasureMineRune()).toEqual({ ok: false, reason: '开采不能装符文' })
    advance(save, 4)
    expect(vaultQty(save)).toBe(0)
    advance(save, 1)
    expect(vaultQty(save)).toBe(1)
    expect(mine.reserve).toBe(9)
    expect(save.bank).toEqual({})

    worker.level = 6
    mine.digCharge[worker.id] = 0
    advance(save, 4)
    expect(vaultQty(save)).toBe(2)
    expect(withdrawTreasureMiner(save, mine.id, worker.id).ok).toBe(true)
    expect(mine.crewIds).toEqual([])
  })

  it('sends a dead raider home before the queue finishes', () => {
    const save = createSave()
    const first = spawnWorker(save)
    const second = spawnWorker(save)
    const mine = save.treasureMines.mines[0]
    mine.shadows = mine.shadows.slice(0, 1)
    mine.shadows[0].hp = 80
    mine.shadows[0].atk = 999
    mine.shadows[0].spd = 1
    expect(startTreasureRaid(save, mine.id, [first.id, second.id]).ok).toBe(true)
    const raid = mine.raid
    expect(raid).toBeTruthy()
    if (!raid) return
    raid.atkHp = 1
    raid.atkNext = save.elapsedS + 100
    raid.defAtk = 999
    raid.defSpd = 1
    raid.defNext = save.elapsedS + 1
    advance(save, 1)
    expect(first.hp).toBe(0)
    expect(first.assignment).toBeNull()
    expect(mine.crewIds).not.toContain(first.id)
    expect(mine.raid?.queue[0]).toBe(second.id)
    expect(mine.raid?.queue).not.toContain(first.id)
    expect(mine.owner).toBe('shadow')
  })

  it('discounts defender mining while one shadow is fighting', () => {
    const save = createSave()
    const worker = spawnWorker(save)
    const mine = save.treasureMines.mines[0]
    while (mine.shadows.length < 3) {
      const copy = { ...mine.shadows[0], id: `${mine.shadows[0].id}-extra-${mine.shadows.length}` }
      mine.shadows.push(copy)
    }
    mine.shadows.forEach((shadow) => {
      shadow.level = 1
      shadow.hp = 50
      shadow.spd = 30
    })
    mine.reserve = 100
    mine.digCharge = {}
    expect(startTreasureRaid(save, mine.id, [worker.id]).ok).toBe(true)
    const raid = mine.raid
    expect(raid?.garrison).toBe(3)
    if (!raid) return
    raid.atkNext = save.elapsedS + 100
    raid.defNext = save.elapsedS + 100
    holdShadows(save)
    advance(save, 7)
    expect(mine.reserve).toBe(100)
    advance(save, 1)
    expect(mine.reserve).toBe(98)
    expect(vaultQty(save)).toBe(0)
    expect(mine.crewIds).toEqual([])
  })

  it('lets surviving raiders take over the same hole and keep mining without runes', () => {
    const save = createSave()
    const lead = spawnWorker(save)
    const fallen = spawnWorker(save)
    const mine = save.treasureMines.mines[0]
    mine.reserve = 40
    const expires = mine.expiresAtS
    mine.shadows = [
      { ...mine.shadows[0], hp: 1, spd: 100 },
      { ...mine.shadows[0], id: `${mine.id}-b`, name: '影掘手', hp: 1, spd: 100 },
    ]
    save.knightLevel = 10
    addToBank(save, 'runeSharp', 1)
    expect(startTreasureRaid(save, mine.id, [lead.id, fallen.id], { [lead.id]: 'runeSharp' }).ok).toBe(true)
    expect(save.bank.runeSharp ?? 0).toBe(0)
    const raid = mine.raid
    expect(raid?.runes[lead.id]).toBe('runeSharp')
    if (!raid) return
    raid.atkAtk = 99
    raid.atkSpd = 1
    raid.atkNext = save.elapsedS + 1
    raid.defNext = save.elapsedS + 100
    mine.shadows.forEach((shadow) => {
      shadow.hp = 1
      shadow.spd = 100
    })
    advance(save, 1)
    expect(mine.owner).toBe('shadow')
    expect(mine.shadows).toHaveLength(1)
    advance(save, 1)
    expect(mine.owner).toBe('player')
    expect(mine.raid).toBeNull()
    expect(mine.crewIds).toEqual([lead.id, fallen.id])
    expect(mine.reserve).toBe(40)
    expect(mine.expiresAtS).toBe(expires)
    expect(mine.crewIds).toHaveLength(2)
    expect(TREASURE_CREW_CAP).toBe(3)
    const third = spawnWorker(save)
    expect(addTreasureMiner(save, mine.id, third.id).ok).toBe(true)
    expect(mine.crewIds).toContain(third.id)
    mine.digCharge = {}
    lead.level = 1
    fallen.level = 1
    third.level = 1
    advance(save, 5)
    expect(vaultQty(save)).toBe(3)
    expect(mine.reserve).toBe(37)
  })

  it('locks only the raiding hole and refuses reinforce until that fight ends', () => {
    const save = createSave()
    const lead = spawnWorker(save)
    const extra = spawnWorker(save)
    const other = spawnWorker(save)
    const miner = spawnWorker(save)
    const locked = save.treasureMines.mines[0]
    const free = save.treasureMines.mines[1]
    const dig = save.treasureMines.mines[2]
    expect(startTreasureRaid(save, locked.id, [lead.id]).ok).toBe(true)
    expect(isTreasureRaidLocked(locked)).toBe(true)
    expect(isTreasureRaidLocked(free)).toBe(false)
    const queue = [...(locked.raid?.queue ?? [])]
    const shadowCount = locked.shadows.length

    expect(startTreasureRaid(save, locked.id, [extra.id])).toEqual({ ok: false, reason: '这洞抢夺进行中' })
    expect(reinforceTreasureRaid(save, locked.id, 'attack')).toEqual({ ok: false, reason: '抢夺进行中不能增援' })
    expect(reinforceTreasureRaid(save, locked.id, 'defend')).toEqual({ ok: false, reason: '抢夺进行中不能增援' })
    expect(locked.raid?.queue).toEqual(queue)
    expect(locked.shadows).toHaveLength(shadowCount)
    expect(extra.assignment).toBeNull()
    expect(queue).not.toContain(extra.id)

    expect(startTreasureRaid(save, free.id, [other.id]).ok).toBe(true)
    expect(free.raid?.queue).toEqual([other.id])
    expect(isTreasureRaidLocked(locked)).toBe(true)

    dig.owner = 'player'
    dig.shadows = []
    dig.raid = null
    expect(addTreasureMiner(save, dig.id, miner.id).ok).toBe(true)
    expect(dig.crewIds).toEqual([miner.id])

    const raid = locked.raid
    expect(raid).toBeTruthy()
    if (!raid) return
    raid.atkHp = 1
    raid.atkNext = save.elapsedS + 100
    raid.defAtk = 999
    raid.defSpd = 1
    raid.defNext = save.elapsedS + 1
    advance(save, 1)
    expect(locked.raid).toBeNull()
    expect(locked.owner).toBe('shadow')
    expect(isTreasureRaidLocked(locked)).toBe(false)
    expect(reinforceTreasureRaid(save, locked.id, 'attack')).toEqual({
      ok: false,
      reason: '这洞没有进行中的抢夺',
    })
    const retry = spawnWorker(save)
    expect(startTreasureRaid(save, locked.id, [retry.id]).ok).toBe(true)
  })
})
