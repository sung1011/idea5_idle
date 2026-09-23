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
  abandonTreasureMine,
  addTreasureMiner,
  claimTreasureMine,
  mineDigIntervalS,
  mineDigSpeedLabel,
  playerMineDigReadout,
  rollTreasureDrop,
  treasureDropTip,
  treasureKindFromId,
  treasureKindOfRoll,
  workerMatchesMineWeakness,
  hydrateTreasureMines,
  mineWeaknessSlots,
  TREASURE_REFRESH_COST,
  refreshTreasureMineBoard,
  refreshTreasureMines,
  shadowCrewCount,
  SNAPSHOT_PLAYER_NAMES,
  pickSnapshotPlayerName,
  rejectTreasureMineRune,
  isTreasureRaidLocked,
  reinforceTreasureRaid,
  startTreasureRaid,
  stepTreasureMines,
} from './treasureMine'
import { treasureMineBlockReason } from './treasureMineQuery'
import { applyTick } from './tick'
import type { Save, TreasureId, TreasureMine } from './types'

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

function ensureGarrison(mine: TreasureMine): TreasureMine {
  if (mine.shadows.length > 0) {
    if (mine.owner !== 'player') mine.owner = 'shadow'
    return mine
  }
  mine.owner = 'shadow'
  mine.shadows = [
    {
      id: `${mine.id}-shadow-0`,
      name: '青石',
      level: 1,
      hp: 30,
      hpMax: 30,
      atk: 4,
      spd: 5,
      runeId: 'runeSharp',
    },
  ]
  return mine
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

  it('rolls a new hole into 0, 1, 2, or 3 shadows and does not reroll standing holes', () => {
    expect(shadowCrewCount(0)).toBe(0)
    expect(shadowCrewCount(0.5 - 1e-12)).toBe(0)
    expect(shadowCrewCount(0.5)).toBe(1)
    expect(shadowCrewCount(0.7 - 1e-12)).toBe(1)
    expect(shadowCrewCount(0.7)).toBe(2)
    expect(shadowCrewCount(0.9 - 1e-12)).toBe(2)
    expect(shadowCrewCount(0.9)).toBe(3)
    expect(shadowCrewCount(0.999)).toBe(3)

    const save = createSave()
    const kept = save.treasureMines.mines[0]
    const before = kept.shadows.map((shadow) => shadow.id)
    const beforeOwner = kept.owner
    const seen = new Set<number>()
    for (let i = 0; i < 120 && seen.size < 4; i += 1) {
      const victim = save.treasureMines.mines.find((mine) => mine.id !== kept.id)
      if (!victim) break
      victim.reserve = 0
      refreshTreasureMines(save)
      for (const mine of save.treasureMines.mines) {
        if (mine.id === kept.id) continue
        seen.add(mine.shadows.length)
        if (mine.shadows.length === 0) expect(mine.owner).toBe('empty')
        else expect(mine.owner).toBe('shadow')
      }
    }
    const standing = save.treasureMines.mines.find((mine) => mine.id === kept.id)
    expect(standing?.shadows.map((shadow) => shadow.id)).toEqual(before)
    expect(standing?.owner).toBe(beforeOwner)
    expect([...seen].sort()).toEqual([0, 1, 2, 3])
  })

  it('names new shadows like players and keeps a name already stored on an old hole', () => {
    const banned = ['影矿卫', '影掘手', '影看守']
    expect(pickSnapshotPlayerName(0, new Set(SNAPSHOT_PLAYER_NAMES.slice(0, -1)))).toBe(SNAPSHOT_PLAYER_NAMES.at(-1))
    const reused = pickSnapshotPlayerName(0.2, new Set(SNAPSHOT_PLAYER_NAMES))
    expect(SNAPSHOT_PLAYER_NAMES).toContain(reused)
    expect(banned.some((title) => reused.includes(title))).toBe(false)

    const save = createSave()
    const standing = ensureGarrison(save.treasureMines.mines[0])
    standing.shadows[0].name = '影矿卫'
    const standingIds = standing.shadows.map((shadow) => shadow.id)
    hydrateTreasureMines(save)
    const kept = save.treasureMines.mines.find((mine) => mine.id === standing.id)
    expect(kept?.shadows.map((shadow) => shadow.id)).toEqual(standingIds)
    expect(kept?.shadows[0].name).toBe('影矿卫')

    save.treasureMines.mines = save.treasureMines.mines.filter((mine) => mine.id === standing.id)
    standing.reserve = 0
    refreshTreasureMines(save)
    const spawned = save.treasureMines.mines.filter((mine) => mine.id !== standing.id)
    expect(spawned.length).toBeGreaterThan(0)
    const names = spawned.flatMap((mine) => mine.shadows.map((shadow) => shadow.name))
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) {
      expect(name.length).toBeGreaterThan(0)
      expect(SNAPSHOT_PLAYER_NAMES).toContain(name)
      expect(banned.some((title) => name.includes(title))).toBe(false)
    }
    expect(new Set(names).size).toBe(names.length)
  })

  it('sends the raid queue home with their own hp when a hole expires', () => {
    const save = createSave()
    const lead = spawnWorker(save)
    const bench = spawnWorker(save)
    const mine = ensureGarrison(save.treasureMines.mines[0])
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
    worker.combatAttrs = []
    const mine = save.treasureMines.mines[0]
    mine.owner = 'empty'
    mine.shadows = []
    mine.raid = null
    mine.reserve = 10
    expect(claimTreasureMine(save, mine.id, [worker.id]).ok).toBe(true)
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
    expect(abandonTreasureMine(save, mine.id).ok).toBe(true)
    expect(mine.owner).toBe('empty')
    expect(mine.crewIds).toEqual([])
    expect(treasureMineBlockReason(save, worker.id)).toBeNull()
  })

  it('sends a dead raider home before the queue finishes', () => {
    const save = createSave()
    const first = spawnWorker(save)
    const second = spawnWorker(save)
    const mine = ensureGarrison(save.treasureMines.mines[0])
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
    const mine = ensureGarrison(save.treasureMines.mines[0])
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
    const mine = ensureGarrison(save.treasureMines.mines[0])
    mine.reserve = 40
    const expires = mine.expiresAtS
    mine.shadows = [
      { ...mine.shadows[0], hp: 1, spd: 100 },
      { ...mine.shadows[0], id: `${mine.id}-b`, name: '晚风', hp: 1, spd: 100 },
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
    expect(addTreasureMiner(save, mine.id, third.id)).toEqual({ ok: false, reason: '这洞不能补采' })
    expect(mine.crewIds).toEqual([lead.id, fallen.id])
    mine.digCharge = {}
    lead.level = 1
    fallen.level = 1
    advance(save, 5)
    expect(vaultQty(save)).toBe(2)
    expect(mine.reserve).toBe(38)
  })

  it('mines every 4s when the worker matches the hole weakness, else 5s', () => {
    expect(mineDigIntervalS(1, false)).toBe(5)
    expect(mineDigIntervalS(1, true)).toBe(4)
    expect(workerMatchesMineWeakness(['fire'], ['fire'])).toBe(true)
    expect(workerMatchesMineWeakness(['sword'], ['fire'])).toBe(false)
    const save = createSave()
    const hit = spawnWorker(save)
    const miss = spawnWorker(save)
    hit.level = 1
    miss.level = 1
    hit.combatAttrs = ['fire']
    miss.combatAttrs = ['sword']
    const mine = save.treasureMines.mines[0]
    mine.owner = 'empty'
    mine.shadows = []
    mine.raid = null
    mine.weaknesses = ['fire']
    mine.reserve = 20
    mine.crewIds = []
    expect(claimTreasureMine(save, mine.id, [hit.id, miss.id]).ok).toBe(true)
    expect(mine.revealedWeaknesses).toEqual(['fire'])
    mine.revealedWeaknesses = []
    advance(save, 4)
    expect(vaultQty(save)).toBe(1)
    expect(mine.reserve).toBe(19)
    advance(save, 1)
    expect(vaultQty(save)).toBe(2)
    expect(mine.reserve).toBe(18)
    expect(mine.revealedWeaknesses).toEqual([])
  })

  it('hides new weaknesses behind question marks until mining or a raid reveals a match', () => {
    const save = createSave()
    for (const hole of save.treasureMines.mines) {
      expect(hole.revealedWeaknesses).toEqual([])
      const slots = mineWeaknessSlots(hole)
      expect(slots).toHaveLength(hole.weaknesses.length)
      expect(slots.every((slot) => slot == null)).toBe(true)
    }

    const mine = save.treasureMines.mines[0]
    mine.weaknesses = ['fire', 'ice', 'sword']
    delete (mine as { revealedWeaknesses?: unknown }).revealedWeaknesses
    hydrateTreasureMines(save)
    const kept = save.treasureMines.mines.find((hole) => hole.id === mine.id)
    expect(kept?.weaknesses).toEqual(['fire', 'ice', 'sword'])
    expect(kept?.revealedWeaknesses).toEqual([])
    expect(kept ? mineWeaknessSlots(kept) : []).toEqual([null, null, null])
    if (!kept) return

    kept.owner = 'empty'
    kept.shadows = []
    kept.raid = null
    const digger = spawnWorker(save)
    const extra = spawnWorker(save)
    digger.combatAttrs = ['ice', 'bow']
    extra.combatAttrs = ['fire']
    expect(claimTreasureMine(save, kept.id, [digger.id, extra.id]).ok).toBe(true)
    expect(kept.revealedWeaknesses).toEqual(['ice', 'fire'])
    expect(mineWeaknessSlots(kept)).toEqual(['fire', 'ice', null])
    expect(addTreasureMiner(save, kept.id, extra.id)).toEqual({ ok: false, reason: '这洞不能补采' })
    expect(kept.crewIds).toEqual([digger.id, extra.id])

    const raidHole = save.treasureMines.mines.find((hole) => hole.id !== kept.id)
    if (raidHole) ensureGarrison(raidHole)
    expect(raidHole).toBeTruthy()
    if (!raidHole) return
    raidHole.weaknesses = ['sword', 'fire']
    raidHole.revealedWeaknesses = []
    const lead = spawnWorker(save)
    const bench = spawnWorker(save)
    const late = spawnWorker(save)
    lead.combatAttrs = ['sword']
    bench.combatAttrs = ['dark']
    late.combatAttrs = ['fire']
    expect(startTreasureRaid(save, raidHole.id, [lead.id, bench.id]).ok).toBe(true)
    expect(raidHole.revealedWeaknesses).toEqual(['sword'])
    expect(mineWeaknessSlots(raidHole)).toEqual(['sword', null])
    expect(startTreasureRaid(save, raidHole.id, [late.id]).ok).toBe(false)
    expect(raidHole.revealedWeaknesses).toEqual(['sword'])
  })

  it('locks only the raiding hole and refuses reinforce until that fight ends', () => {
    const save = createSave()
    const lead = spawnWorker(save)
    const extra = spawnWorker(save)
    const other = spawnWorker(save)
    const miner = spawnWorker(save)
    const locked = ensureGarrison(save.treasureMines.mines[0])
    const free = ensureGarrison(save.treasureMines.mines[1])
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

    dig.owner = 'empty'
    dig.shadows = []
    dig.raid = null
    expect(claimTreasureMine(save, dig.id, [miner.id]).ok).toBe(true)
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

  it('snapshots raid slots at the start and backfills an old raid from whoever is left', () => {
    const save = createSave()
    const lead = spawnWorker(save)
    const mine = ensureGarrison(save.treasureMines.mines[0])
    mine.shadows = mine.shadows.slice(0, 1)
    expect(startTreasureRaid(save, mine.id, [lead.id]).ok).toBe(true)
    expect(mine.raid?.attackSlots).toEqual([lead.id, null, null])
    expect(mine.raid?.defendSlots).toEqual([mine.shadows[0].id, null, null])
    const raid = mine.raid
    expect(raid).toBeTruthy()
    if (!raid) return
    delete (raid as { attackSlots?: (string | null)[] }).attackSlots
    hydrateTreasureMines(save)
    const again = save.treasureMines.mines.find((row) => row.id === mine.id)
    expect(again?.raid?.attackSlots).toEqual([lead.id, null, null])
    expect(again?.raid?.defendSlots).toEqual([mine.shadows[0].id, null, null])
  })

  it('spends diamonds to replace idle holes, including empty ones, and keeps raids', () => {
    const save = createSave()
    save.diamonds = 25
    save.treasureMines.vault.sandGold = 4
    const miner = spawnWorker(save)
    miner.assignment = 'herbalism'
    const owned = save.treasureMines.mines[0]
    owned.owner = 'player'
    owned.shadows = []
    owned.crewIds = [miner.id]
    owned.digCharge[miner.id] = 3
    const vacant = save.treasureMines.mines[2]
    vacant.owner = 'empty'
    vacant.shadows = []
    vacant.raid = null
    const raider = spawnWorker(save)
    const fighting = ensureGarrison(save.treasureMines.mines[1])
    expect(startTreasureRaid(save, fighting.id, [raider.id]).ok).toBe(true)
    const dropped = save.treasureMines.mines.filter((mine) => mine.id !== fighting.id).map((mine) => mine.id)

    expect(refreshTreasureMineBoard(save).ok).toBe(true)
    expect(save.diamonds).toBe(25 - TREASURE_REFRESH_COST)
    expect(save.treasureMines.vault.sandGold).toBe(4)
    expect(save.treasureMines.mines).toHaveLength(TREASURE_MINE_CAP)
    expect(save.treasureMines.mines.some((mine) => mine.id === fighting.id)).toBe(true)
    expect(save.treasureMines.mines.some((mine) => mine.id === vacant.id)).toBe(false)
    expect(save.treasureMines.mines.some((mine) => dropped.includes(mine.id))).toBe(false)
    expect(miner.assignment).toBeNull()
    expect(save.treasureMines.mines.some((mine) => mine.crewIds.includes(miner.id))).toBe(false)
    expect(save.treasureMines.mines.some((mine) => miner.id in mine.digCharge)).toBe(false)
    expect(treasureMineBlockReason(save, miner.id)).toBeNull()
    expect(treasureMineBlockReason(save, raider.id)).toBe('正在夺宝')

    save.diamonds = TREASURE_REFRESH_COST - 1
    const ids = save.treasureMines.mines.map((mine) => mine.id)
    expect(refreshTreasureMineBoard(save)).toEqual({ ok: false, reason: '钻石不足' })
    expect(save.diamonds).toBe(TREASURE_REFRESH_COST - 1)
    expect(save.treasureMines.mines.map((mine) => mine.id)).toEqual(ids)

    const locked = createSave()
    locked.diamonds = 40
    const before = locked.diamonds
    const holeIds = locked.treasureMines.mines.map((mine) => mine.id)
    for (const mine of locked.treasureMines.mines) {
      ensureGarrison(mine)
      const worker = spawnWorker(locked)
      expect(startTreasureRaid(locked, mine.id, [worker.id]).ok).toBe(true)
    }
    expect(refreshTreasureMineBoard(locked)).toEqual({ ok: false, reason: '没有可刷新的矿洞' })
    expect(locked.diamonds).toBe(before)
    expect(locked.treasureMines.mines.map((mine) => mine.id)).toEqual(holeIds)
  })

  it('abandons a claimed hole without resetting reserve or the timer, then allows a new claim', () => {
    const save = createSave()
    const worker = spawnWorker(save)
    const extra = spawnWorker(save)
    const mine = save.treasureMines.mines[0]
    mine.owner = 'empty'
    mine.shadows = []
    mine.raid = null
    mine.reserve = 40
    mine.reserveMax = TREASURE_RESERVE_MAX
    mine.bornAtS = 12
    mine.expiresAtS = save.elapsedS + TREASURE_LIFE_S
    mine.weaknesses = ['fire', 'ice']
    mine.revealedWeaknesses = ['fire']
    expect(claimTreasureMine(save, mine.id, [worker.id]).ok).toBe(true)
    expect(mine.owner).toBe('player')
    expect(addTreasureMiner(save, mine.id, extra.id)).toEqual({ ok: false, reason: '这洞不能补采' })
    expect(mine.crewIds).toEqual([worker.id])
    const revealed = [...mine.revealedWeaknesses]

    expect(abandonTreasureMine(save, mine.id).ok).toBe(true)
    expect(mine.owner).toBe('empty')
    expect(mine.crewIds).toEqual([])
    expect(mine.shadows).toEqual([])
    expect(mine.raid).toBeNull()
    expect(mine.digCharge).toEqual({})
    expect(mine.reserve).toBe(40)
    expect(mine.reserveMax).toBe(TREASURE_RESERVE_MAX)
    expect(mine.bornAtS).toBe(12)
    expect(mine.expiresAtS).toBe(save.elapsedS + TREASURE_LIFE_S)
    expect(mine.weaknesses).toEqual(['fire', 'ice'])
    expect(mine.revealedWeaknesses).toEqual(revealed)
    expect(worker.assignment).toBeNull()
    expect(treasureMineBlockReason(save, worker.id)).toBeNull()
    expect(startTreasureRaid(save, mine.id, [extra.id])).toEqual({ ok: false, reason: '洞里没有守军' })

    expect(claimTreasureMine(save, mine.id, [worker.id, extra.id]).ok).toBe(true)
    expect(mine.owner).toBe('player')
    expect(mine.crewIds).toEqual([worker.id, extra.id])
    expect(mine.reserve).toBe(40)
    expect(mine.expiresAtS).toBe(save.elapsedS + TREASURE_LIFE_S)
    expect(addTreasureMiner(save, mine.id, worker.id)).toEqual({ ok: false, reason: '这洞不能补采' })
  })

  it('maps an illegal owner to shadow when a garrison remains, otherwise to empty', () => {
    const save = createSave()
    const withShadows = ensureGarrison(save.treasureMines.mines[0])
    ;(withShadows as { owner: string }).owner = 'npc'
    const bare = save.treasureMines.mines[1]
    bare.shadows = []
    ;(bare as { owner: string }).owner = 'gone'
    hydrateTreasureMines(save)
    expect(save.treasureMines.mines.find((mine) => mine.id === withShadows.id)?.owner).toBe('shadow')
    expect(save.treasureMines.mines.find((mine) => mine.id === bare.id)?.owner).toBe('empty')
  })

  it('rolls hole kinds in thirds and keeps a missing kind stable', () => {
    expect(treasureKindOfRoll(0)).toBe('sandGold')
    expect(treasureKindOfRoll(1 / 3 - 1e-12)).toBe('sandGold')
    expect(treasureKindOfRoll(1 / 3)).toBe('jewel')
    expect(treasureKindOfRoll(2 / 3 - 1e-12)).toBe('jewel')
    expect(treasureKindOfRoll(2 / 3)).toBe('jade')
    expect(treasureKindOfRoll(0.999)).toBe('jade')

    const save = createSave()
    const seen = new Set<string>()
    for (let i = 0; i < 80 && seen.size < 3; i += 1) {
      const victim = save.treasureMines.mines[0]
      if (!victim) break
      victim.reserve = 0
      refreshTreasureMines(save)
      for (const mine of save.treasureMines.mines) seen.add(mine.kind)
    }
    expect([...seen].sort()).toEqual(['jade', 'jewel', 'sandGold'])

    const standing = save.treasureMines.mines[0]
    const expected = treasureKindFromId(standing.id)
    delete (standing as { kind?: string }).kind
    hydrateTreasureMines(save)
    const once = save.treasureMines.mines.find((mine) => mine.id === standing.id)
    expect(once?.kind).toBe(expected)
    hydrateTreasureMines(save)
    expect(save.treasureMines.mines.find((mine) => mine.id === standing.id)?.kind).toBe(expected)
  })

  it('biases vault drops by hole kind and skips tips while shadows dig', () => {
    expect(rollTreasureDrop('sandGold', 0)).toBe('sandGold')
    expect(rollTreasureDrop('sandGold', 0.699)).toBe('sandGold')
    expect(rollTreasureDrop('sandGold', 0.7)).toBe('jewel')
    expect(rollTreasureDrop('sandGold', 0.949)).toBe('jewel')
    expect(rollTreasureDrop('sandGold', 0.95)).toBe('jade')
    expect(rollTreasureDrop('jewel', 0.199)).toBe('sandGold')
    expect(rollTreasureDrop('jewel', 0.2)).toBe('jewel')
    expect(rollTreasureDrop('jewel', 0.899)).toBe('jewel')
    expect(rollTreasureDrop('jewel', 0.9)).toBe('jade')
    expect(rollTreasureDrop('jade', 0.149)).toBe('sandGold')
    expect(rollTreasureDrop('jade', 0.15)).toBe('jewel')
    expect(rollTreasureDrop('jade', 0.399)).toBe('jewel')
    expect(rollTreasureDrop('jade', 0.4)).toBe('jade')
    expect(treasureDropTip('sandGold', 1)).toBe('获得 砂金 ×1')

    const save = createSave()
    const worker = spawnWorker(save)
    worker.level = 1
    worker.combatAttrs = []
    const mine = save.treasureMines.mines[0]
    mine.owner = 'empty'
    mine.shadows = []
    mine.raid = null
    mine.kind = 'jade'
    mine.reserve = 80
    expect(claimTreasureMine(save, mine.id, [worker.id]).ok).toBe(true)
    const drops: TreasureId[] = []
    for (let i = 0; i < 80 * 5; i += 1) {
      save.elapsedS += 1
      stepTreasureMines(save, (drop) => drops.push(drop.item))
    }
    const tally = { sandGold: 0, jewel: 0, jade: 0 }
    for (const item of drops) tally[item] += 1
    expect(drops).toHaveLength(vaultQty(save))
    expect(tally.jade).toBeGreaterThan(tally.jewel)
    expect(tally.jade).toBeGreaterThan(tally.sandGold)
    expect(tally.jade).toBeGreaterThan(drops.length * 0.4)

    const shadow = ensureGarrison(
      save.treasureMines.mines.find((row) => row.owner !== 'player') ?? save.treasureMines.mines[0],
    )
    shadow.reserve = 20
    shadow.shadows.forEach((row) => {
      row.level = 1
    })
    shadow.digCharge = {}
    const before = vaultQty(save)
    const shadowDrops: string[] = []
    for (let i = 0; i < 5; i += 1) {
      save.elapsedS += 1
      stepTreasureMines(save, (drop) => shadowDrops.push(drop.mineId))
    }
    expect(shadow.reserve).toBeLessThan(20)
    expect(vaultQty(save)).toBe(before)
    expect(shadowDrops.filter((id) => id === shadow.id)).toEqual([])
  })

  it('moves the soonest digger bar after a claim and tips the vault item', () => {
    const save = createSave()
    const slow = spawnWorker(save)
    const fast = spawnWorker(save)
    slow.level = 1
    fast.level = 11
    slow.combatAttrs = []
    fast.combatAttrs = []
    const mine = save.treasureMines.mines[0]
    mine.owner = 'empty'
    mine.shadows = []
    mine.raid = null
    mine.weaknesses = ['fire']
    mine.reserve = 30
    expect(playerMineDigReadout(save, mine)).toBeNull()
    expect(claimTreasureMine(save, mine.id, [slow.id, fast.id]).ok).toBe(true)
    expect(playerMineDigReadout(save, mine)).toEqual({ fill: 0, intervalS: 3, fastestS: 3 })
    expect(mineDigSpeedLabel(3)).toBe('最快约 3s/次')
    save.elapsedS += 1
    stepTreasureMines(save)
    const moved = playerMineDigReadout(save, mine)
    expect(moved?.fill).toBeCloseTo(1 / 3)
    expect(moved?.intervalS).toBe(3)
    expect(moved?.fastestS).toBe(3)
    expect(mine.digCharge[fast.id]).toBe(1)
    expect(mine.digCharge[slow.id]).toBe(1)

    mine.digCharge[slow.id] = 4
    mine.digCharge[fast.id] = 0
    const soonestSlow = playerMineDigReadout(save, mine)
    expect(soonestSlow).toEqual({ fill: 0.8, intervalS: 5, fastestS: 3 })

    mine.owner = 'empty'
    expect(playerMineDigReadout(save, mine)).toBeNull()
    mine.owner = 'player'
    mine.raid = {
      queue: [slow.id],
      attackSlots: [slow.id, null, null],
      defendSlots: [null, null, null],
      attackSlotHp: [1, 0, 0],
      attackSlotMax: [1, 0, 0],
      defendSlotHp: [0, 0, 0],
      defendSlotMax: [0, 0, 0],
      garrison: 0,
      atkHp: 1,
      atkMax: 1,
      atkAtk: 1,
      atkSpd: 1,
      atkNext: save.elapsedS + 100,
      defHp: 1,
      defAtk: 1,
      defSpd: 1,
      defNext: save.elapsedS + 100,
      runes: {},
    }
    expect(playerMineDigReadout(save, mine)).toBeNull()
    mine.raid = null
    mine.digCharge = { [slow.id]: 4, [fast.id]: 2 }
    const tipped: string[] = []
    applyTick(save, {
      onTreasureDrop: (drop) => tipped.push(treasureDropTip(drop.item, drop.qty)),
    })
    expect(vaultQty(save)).toBeGreaterThan(0)
    expect(tipped.length).toBe(vaultQty(save))
    expect(tipped.every((text) => text.startsWith('获得 ') && text.includes('×1'))).toBe(true)
  })

  it('keeps revealed weaknesses until the hole is gone', () => {
    const save = createSave()
    const digger = spawnWorker(save)
    const extra = spawnWorker(save)
    digger.combatAttrs = ['fire']
    extra.combatAttrs = ['ice']
    const mine = save.treasureMines.mines[0]
    mine.owner = 'empty'
    mine.shadows = []
    mine.raid = null
    mine.weaknesses = ['fire', 'ice', 'sword']
    mine.revealedWeaknesses = []
    expect(claimTreasureMine(save, mine.id, [digger.id]).ok).toBe(true)
    expect(mine.revealedWeaknesses).toEqual(['fire'])
    expect(mineWeaknessSlots(mine)).toEqual(['fire', null, null])

    expect(abandonTreasureMine(save, mine.id).ok).toBe(true)
    expect(mine.owner).toBe('empty')
    expect(mine.revealedWeaknesses).toEqual(['fire'])
    expect(mineWeaknessSlots(mine)).toEqual(['fire', null, null])

    expect(claimTreasureMine(save, mine.id, [extra.id]).ok).toBe(true)
    expect(mine.revealedWeaknesses).toEqual(['fire', 'ice'])
    expect(mineWeaknessSlots(mine)).toEqual(['fire', 'ice', null])

    const gone = mine.id
    const staying = new Set(save.treasureMines.mines.filter((row) => row.id !== gone).map((row) => row.id))
    mine.reserve = 0
    refreshTreasureMines(save)
    expect(save.treasureMines.mines.some((row) => row.id === gone)).toBe(false)
    const spawned = save.treasureMines.mines.find((row) => !staying.has(row.id))
    expect(spawned?.revealedWeaknesses).toEqual([])
    expect(spawned ? mineWeaknessSlots(spawned).every((slot) => slot == null) : false).toBe(true)

    const again = save.treasureMines.mines[0]
    again.owner = 'empty'
    again.shadows = []
    again.raid = null
    again.weaknesses = ['fire']
    again.revealedWeaknesses = ['fire']
    save.diamonds = TREASURE_REFRESH_COST
    expect(refreshTreasureMineBoard(save).ok).toBe(true)
    expect(save.treasureMines.mines.some((row) => row.id === again.id)).toBe(false)
    for (const hole of save.treasureMines.mines) {
      expect(hole.revealedWeaknesses).toEqual([])
      expect(mineWeaknessSlots(hole).every((slot) => slot == null)).toBe(true)
    }
  })
})
