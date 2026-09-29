import { describe, expect, it } from 'vitest'
import { keepStationsOpen } from './stationUnlock'
import { createSave } from './createSave'
import { PLAYER_AVATAR_IDS } from './playerAvatarIds'
import { spawnWorker } from './recruit'
import { addToBank, bankQty } from './bank'
import { hydrateLoadedSave } from '../ui/saveGame'
import {
  TREASURE_CREW_CAP,
  TREASURE_LIFE_S,
  TREASURE_MINE_CAP,
  TREASURE_RESERVE_MAX,
  abandonTreasureMine,
  claimTreasureMine,
  TREASURE_HOLE_DIG,
  mineDigIntervalS,
  mineDigReadout,
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
  TREASURE_REFRESH_SAND_COST,
  TREASURE_SCOUT_COST,
  TREASURE_ASSAULT_INTERVAL_S,
  TREASURE_ASSAULT_LOOT,
  TREASURE_ASSAULT_WARN_S,
  TREASURE_FORTIFY_COST,
  TREASURE_FORTIFY_HP_MUL,
  TREASURE_TRAP_COST,
  TREASURE_TRAP_HP_RATIO,
  TREASURE_WARD_S,
  TREASURE_REINFORCE_COST,
  TREASURE_BANNER_COSTS,
  TREASURE_BANNER_MAX,
  TREASURE_STAKE_PER_GUARD,
  assaultCrewCount,
  assaultHits,
  assaultLootTip,
  bannerFrameOf,
  bannerLevelOf,
  bannerUpgradeReady,
  fortifyTreasureMine,
  trapTreasureMine,
  trapOpeningHp,
  fortifyRemainS,
  trapRemainS,
  treasureAssaultWarning,
  bannerReserveMax,
  jadeShortTip,
  treasureCrewCap,
  upgradeTreasureBanner,
  jewelShortTip,
  refreshTreasureMineBoard,
  refreshTreasureMines,
  shadowCrewCount,
  SNAPSHOT_PLAYER_NAMES,
  pickMineAvatarId,
  pickSnapshotPlayerName,
  stableMineAvatarId,
  rejectTreasureMineRune,
  isTreasureRaidLocked,
  reinforceTreasureRaid,
  mineFullyRevealed,
  raidStakeCost,
  sandShortTip,
  scoutTreasureMine,
  STAKE_FORFEIT_TIP,
  stakePaidTip,
  stakeRefundTip,
  startTreasureRaid as openTreasureRaid,
  takeTreasureVaultNotices,
  stepTreasureMines,
  bountyButtonLabel,
  bountyCrewCount,
  isLegacyTreasureMine,
  mineKindLabel,
  mineVeinOfRoll,
  nextMineRoll,
  postTreasureBounty,
  rollOreVaultTreasure,
  treasureHaulQty,
  TREASURE_BOUNTY_COST,
  TREASURE_BOUNTY_RESERVE_MUL,
  TREASURE_BOUNTY_LEVEL_BONUS,
} from './treasureMine'
import { treasureMineBlockReason } from './treasureMineQuery'
import { raidSlotPress, treasureRaidHud } from '../ui/treasureRaidHud'
import { applyTick } from './tick'
import { marchDurationS } from './tech'
import { settleOffline } from './offline'
import type { Save, TreasureId, TreasureMine } from './types'
import type { RunePickMap } from './runes'

/** 旧用例不查军费。不够就补到刚好能开，扣完回到原数。 */
function startTreasureRaid(
  save: Save,
  mineId: string,
  workerIds: readonly string[],
  runePicks?: RunePickMap,
) {
  const mine = save.treasureMines.mines.find((row) => row.id === mineId)
  const need = raidStakeCost(mine?.shadows.length ?? 0)
  const have = save.treasureMines.vault.sandGold ?? 0
  if (have < need) save.treasureMines.vault.sandGold = have + need
  return openTreasureRaid(save, mineId, workerIds, runePicks)
}

function vaultQty(save: Save): number {
  const vault = save.treasureMines.vault
  return (vault.sandGold ?? 0) + (vault.jewel ?? 0) + (vault.jade ?? 0)
}

function oreBank(save: Save, mine: TreasureMine): number {
  const id = mine.vein === 'iron' ? 'ironOre' : mine.vein === 'mithril' ? 'mithrilOre' : 'ore'
  return bankQty(save, id)
}

function markLegacy(mine: TreasureMine, kind: TreasureId): void {
  mine.kind = kind
  mine.vein = null
  mine.bounty = null
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
  for (const mine of save.treasureMines.mines) mine.digCharge = {}
}

function armRaid(save: Save, mine: TreasureMine): void {
  const raid = mine.raid
  if (!raid || raid.phase !== 'marchOut') return
  save.elapsedS = raid.phaseEndsAtS ?? save.elapsedS
  stepTreasureMines(save)
}

describe('treasure mines', () => {
  it('fills at most 4 holes and replaces expired or empty ones', () => {
    const save = keepStationsOpen(createSave())
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

    const save = keepStationsOpen(createSave())
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

  it('rolls one shared avatar for a new garrison and keeps a missing one stable', () => {
    expect(pickMineAvatarId(0)).toBe(PLAYER_AVATAR_IDS[0])
    expect(pickMineAvatarId(0.999)).toBe(PLAYER_AVATAR_IDS.at(-1))
    expect(stableMineAvatarId('mine-1')).toBe(stableMineAvatarId('mine-1'))
    expect(PLAYER_AVATAR_IDS).toContain(stableMineAvatarId('mine-9'))

    const save = keepStationsOpen(createSave())
    const seen = new Set<string>()
    for (let i = 0; i < 80; i += 1) {
      const victim = save.treasureMines.mines[save.treasureMines.mines.length - 1]
      victim.reserve = 0
      refreshTreasureMines(save)
      const born = save.treasureMines.mines.find((mine) => mine.id === `mine-${save.treasureMines.nextId - 1}`)
      expect(born).toBeTruthy()
      if (!born) return
      expect(PLAYER_AVATAR_IDS).toContain(born.ownerAvatarId)
      if (born.owner === 'shadow') seen.add(born.ownerAvatarId)
      else expect(born.ownerAvatarId).toBe(stableMineAvatarId(born.id))
    }
    expect(seen.size).toBeGreaterThan(1)

    const kept = keepStationsOpen(createSave())
    const hole = kept.treasureMines.mines[0]
    const standing = hole.ownerAvatarId
    delete (hole as { ownerAvatarId?: string }).ownerAvatarId
    hydrateTreasureMines(kept)
    expect(kept.treasureMines.mines.find((mine) => mine.id === hole.id)?.ownerAvatarId).toBe(stableMineAvatarId(hole.id))
    hydrateTreasureMines(kept)
    expect(kept.treasureMines.mines.find((mine) => mine.id === hole.id)?.ownerAvatarId).toBe(stableMineAvatarId(hole.id))
    const again = kept.treasureMines.mines.find((mine) => mine.id === hole.id)
    expect(again).toBeTruthy()
    if (!again) return
    again.ownerAvatarId = 'lance'
    hydrateTreasureMines(kept)
    expect(kept.treasureMines.mines.find((mine) => mine.id === hole.id)?.ownerAvatarId).toBe('lance')
    expect(standing === 'lance' || PLAYER_AVATAR_IDS.includes(standing as (typeof PLAYER_AVATAR_IDS)[number])).toBe(true)
  })

  it('names new shadows like players and keeps a name already stored on an old hole', () => {
    const banned = ['影矿卫', '影掘手', '影看守']
    expect(pickSnapshotPlayerName(0, new Set(SNAPSHOT_PLAYER_NAMES.slice(0, -1)))).toBe(SNAPSHOT_PLAYER_NAMES.at(-1))
    const reused = pickSnapshotPlayerName(0.2, new Set(SNAPSHOT_PLAYER_NAMES))
    expect(SNAPSHOT_PLAYER_NAMES).toContain(reused)
    expect(banned.some((title) => reused.includes(title))).toBe(false)

    const save = keepStationsOpen(createSave())
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
    const save = keepStationsOpen(createSave())
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
    const raw: Partial<Save> = { ...keepStationsOpen(createSave()) }
    delete raw.treasureMines
    const loaded = hydrateLoadedSave(raw)
    expect(loaded?.treasureMines.mines).toHaveLength(4)
    expect(loaded?.treasureMines.vault).toEqual({})
  })

  it('digs on a level-scaled beat into workshop ore', () => {
    expect(mineDigIntervalS(1)).toBe(5)
    expect(mineDigIntervalS(6)).toBe(4)
    expect(mineDigIntervalS(11)).toBe(3)
    const save = keepStationsOpen(createSave())
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
    expect(oreBank(save, mine)).toBe(0)
    advance(save, 1)
    expect(oreBank(save, mine)).toBe(1)
    expect(mine.reserve).toBe(9)
    expect(save.knightLevel).toBeLessThan(9)

    worker.level = 6
    mine.digCharge = {}
    advance(save, 4)
    expect(oreBank(save, mine)).toBe(2)
    expect(abandonTreasureMine(save, mine.id).ok).toBe(true)
    expect(mine.owner).toBe('empty')
    expect(mine.crewIds).toEqual([])
    expect(treasureMineBlockReason(save, worker.id)).toBeNull()
  })

  it('sends a dead raider home before the queue finishes', () => {
    const save = keepStationsOpen(createSave())
    const first = spawnWorker(save)
    const second = spawnWorker(save)
    const mine = ensureGarrison(save.treasureMines.mines[0])
    mine.shadows = mine.shadows.slice(0, 1)
    mine.shadows[0].hp = 80
    mine.shadows[0].atk = 999
    mine.shadows[0].spd = 1
    expect(startTreasureRaid(save, mine.id, [first.id, second.id]).ok).toBe(true)
    armRaid(save, mine)
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

  it('lets the two shadows still digging share one shipment while one fights', () => {
    const save = keepStationsOpen(createSave())
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
    raid.phase = 'fighting'
    raid.atkNext = save.elapsedS + 100
    raid.defNext = save.elapsedS + 100
    holdShadows(save)
    advance(save, 2)
    expect(mine.reserve).toBe(100)
    advance(save, 1)
    expect(mine.reserve).toBe(99)
    expect(vaultQty(save)).toBe(0)
    expect(mine.crewIds).toEqual([])
  })

  it('lets surviving raiders take over the same hole and keep mining without runes', () => {
    const save = keepStationsOpen(createSave())
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
    armRaid(save, mine)
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
    expect(mine.owner).toBe('shadow')
    expect(mine.raid?.phase).toBe('marchHomeWin')
    advance(save, marchDurationS(save))
    expect(mine.owner).toBe('player')
    expect(mine.raid).toBeNull()
    expect(mine.crewIds).toEqual([lead.id, fallen.id])
    expect(mine.reserve).toBe(40)
    expect(mine.expiresAtS).toBe(expires)
    expect(mine.crewIds).toHaveLength(2)
    expect(TREASURE_CREW_CAP).toBe(3)
    expect(mine.crewIds).toEqual([lead.id, fallen.id])
    mine.digCharge = {}
    lead.level = 1
    fallen.level = 1
    advance(save, 5)
    expect(oreBank(save, mine)).toBe(2)
    expect(save.treasureMines.vault.sandGold ?? 0).toBeGreaterThanOrEqual(raidStakeCost(2))
    expect(mine.reserve).toBe(38)
  })

  it('mines every 4s when the worker matches the hole weakness, else 5s', () => {
    expect(mineDigIntervalS(1, false)).toBe(5)
    expect(mineDigIntervalS(1, true)).toBe(4)
    expect(workerMatchesMineWeakness(['fire'], ['fire'])).toBe(true)
    expect(workerMatchesMineWeakness(['sword'], ['fire'])).toBe(false)
    const save = keepStationsOpen(createSave())
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
    expect(oreBank(save, mine)).toBe(1)
    expect(mine.reserve).toBe(19)
    advance(save, 1)
    expect(oreBank(save, mine)).toBe(2)
    expect(mine.reserve).toBe(18)
    expect(mine.revealedWeaknesses).toEqual([])
  })

  it('hides new weaknesses behind question marks until mining or a raid reveals a match', () => {
    const save = keepStationsOpen(createSave())
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
    const save = keepStationsOpen(createSave())
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
    expect(reinforceTreasureRaid(save, locked.id, extra.id)).toEqual({
      ok: false,
      reason: '抢夺中不能增援',
    })
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
    armRaid(save, locked)
    const live = locked.raid
    expect(live).toBeTruthy()
    if (!live) return
    live.atkHp = 1
    live.atkNext = save.elapsedS + 100
    live.defAtk = 999
    live.defSpd = 1
    live.defNext = save.elapsedS + 1
    advance(save, 1)
    expect(locked.raid).toBeTruthy()
    expect(isTreasureRaidLocked(locked)).toBe(true)
    advance(save, marchDurationS(save))
    expect(locked.raid).toBeNull()
    expect(locked.owner).toBe('shadow')
    expect(isTreasureRaidLocked(locked)).toBe(false)
    expect(reinforceTreasureRaid(save, locked.id, extra.id)).toEqual({
      ok: false,
      reason: '这洞没有进行中的抢夺',
    })
    const retry = spawnWorker(save)
    expect(startTreasureRaid(save, locked.id, [retry.id]).ok).toBe(true)
  })

  it('snapshots raid slots at the start and backfills an old raid from whoever is left', () => {
    const save = keepStationsOpen(createSave())
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
    const save = keepStationsOpen(createSave())
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
    const dropped = save.treasureMines.mines
      .filter((mine) => mine.id !== fighting.id && mine.id !== owned.id)
      .map((mine) => mine.id)

    expect(refreshTreasureMineBoard(save).ok).toBe(true)
    expect(save.diamonds).toBe(25 - TREASURE_REFRESH_COST)
    expect(save.treasureMines.vault.sandGold).toBe(4)
    expect(save.treasureMines.mines).toHaveLength(TREASURE_MINE_CAP)
    expect(save.treasureMines.mines.some((mine) => mine.id === fighting.id)).toBe(true)
    expect(save.treasureMines.mines.some((mine) => mine.id === owned.id)).toBe(true)
    expect(save.treasureMines.mines.some((mine) => mine.id === vacant.id)).toBe(false)
    expect(save.treasureMines.mines.some((mine) => dropped.includes(mine.id))).toBe(false)
    const keptOwned = save.treasureMines.mines.find((mine) => mine.id === owned.id)
    expect(keptOwned?.owner).toBe('player')
    expect(keptOwned?.crewIds).toEqual([miner.id])
    expect(keptOwned?.digCharge[miner.id]).toBe(3)
    expect(miner.assignment).toBe('herbalism')
    expect(treasureMineBlockReason(save, miner.id)).toBe('正在矿洞')
    expect(treasureMineBlockReason(save, raider.id)).toBe('正在夺宝')

    save.diamonds = TREASURE_REFRESH_COST - 1
    const ids = save.treasureMines.mines.map((mine) => mine.id)
    expect(refreshTreasureMineBoard(save)).toEqual({ ok: false, reason: '钻石不足' })
    expect(save.diamonds).toBe(TREASURE_REFRESH_COST - 1)
    expect(save.treasureMines.mines.map((mine) => mine.id)).toEqual(ids)

    const locked = keepStationsOpen(createSave())
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

    const busy = keepStationsOpen(createSave())
    busy.diamonds = 40
    const beforeBusy = busy.diamonds
    const busyIds = busy.treasureMines.mines.map((mine) => mine.id)
    const diggers = [spawnWorker(busy), spawnWorker(busy)]
    for (const [index, mine] of busy.treasureMines.mines.entries()) {
      if (index < 2) {
        ensureGarrison(mine)
        const worker = spawnWorker(busy)
        expect(startTreasureRaid(busy, mine.id, [worker.id]).ok).toBe(true)
        continue
      }
      const digger = diggers[index - 2]
      mine.owner = 'player'
      mine.shadows = []
      mine.raid = null
      mine.crewIds = [digger.id]
      mine.digCharge[digger.id] = 2
    }
    expect(refreshTreasureMineBoard(busy)).toEqual({ ok: false, reason: '没有可刷新的矿洞' })
    expect(busy.diamonds).toBe(beforeBusy)
    expect(busy.treasureMines.mines.map((mine) => mine.id)).toEqual(busyIds)
    expect(busy.treasureMines.mines[2]?.crewIds).toEqual([diggers[0].id])
    expect(busy.treasureMines.mines[3]?.crewIds).toEqual([diggers[1].id])
    expect(diggers[0].assignment).toBeNull()
    expect(treasureMineBlockReason(busy, diggers[0].id)).toBe('正在矿洞')
  })

  it('abandons a claimed hole without resetting reserve or the timer, then allows a new claim', () => {
    const save = keepStationsOpen(createSave())
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
  })

  it('maps an illegal owner to shadow when a garrison remains, otherwise to empty', () => {
    const save = keepStationsOpen(createSave())
    const withShadows = ensureGarrison(save.treasureMines.mines[0])
    ;(withShadows as { owner: string }).owner = 'npc'
    const bare = save.treasureMines.mines[1]
    bare.shadows = []
    ;(bare as { owner: string }).owner = 'gone'
    hydrateTreasureMines(save)
    expect(save.treasureMines.mines.find((mine) => mine.id === withShadows.id)?.owner).toBe('shadow')
    expect(save.treasureMines.mines.find((mine) => mine.id === bare.id)?.owner).toBe('empty')
  })

  it('keeps a missing legacy kind stable', () => {
    expect(treasureKindOfRoll(0)).toBe('sandGold')
    expect(treasureKindOfRoll(1 / 3 - 1e-12)).toBe('sandGold')
    expect(treasureKindOfRoll(1 / 3)).toBe('jewel')
    expect(treasureKindOfRoll(2 / 3 - 1e-12)).toBe('jewel')
    expect(treasureKindOfRoll(2 / 3)).toBe('jade')
    expect(treasureKindOfRoll(0.999)).toBe('jade')

    const save = keepStationsOpen(createSave())
    const standing = save.treasureMines.mines[0]
    const expected = treasureKindFromId(standing.id)
    markLegacy(standing, 'sandGold')
    delete (standing as { kind?: string }).kind
    delete (standing as { vein?: string }).vein
    hydrateTreasureMines(save)
    const once = save.treasureMines.mines.find((mine) => mine.id === standing.id)
    expect(once?.kind).toBe(expected)
    expect(once?.vein).toBeNull()
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

    const save = keepStationsOpen(createSave())
    const worker = spawnWorker(save)
    worker.level = 1
    worker.combatAttrs = []
    const mine = save.treasureMines.mines[0]
    mine.owner = 'empty'
    mine.shadows = []
    mine.raid = null
    markLegacy(mine, 'jade')
    mine.reserve = 80
    expect(claimTreasureMine(save, mine.id, [worker.id]).ok).toBe(true)
    const drops: TreasureId[] = []
    for (let i = 0; i < 80 * 5; i += 1) {
      save.elapsedS += 1
      stepTreasureMines(save, (drop) => {
        if (drop.item === 'sandGold' || drop.item === 'jewel' || drop.item === 'jade') drops.push(drop.item)
      })
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

  it('fills one shared bar from every digger and tips a single vault item', () => {
    const save = keepStationsOpen(createSave())
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
    const cycle = 1 / (1 / 5 + 1 / 3)
    expect(playerMineDigReadout(save, mine)).toBeNull()
    expect(claimTreasureMine(save, mine.id, [slow.id, fast.id]).ok).toBe(true)
    expect(playerMineDigReadout(save, mine)?.fill).toBe(0)
    expect(playerMineDigReadout(save, mine)?.intervalS).toBeCloseTo(cycle)
    expect(playerMineDigReadout(save, mine)?.fastestS).toBeCloseTo(cycle)
    expect(mineDigSpeedLabel(3)).toBe('最快约 3s/次')
    save.elapsedS += 1
    stepTreasureMines(save)
    const moved = playerMineDigReadout(save, mine)
    expect(moved?.fill).toBeCloseTo(1 / cycle)
    expect(moved?.intervalS).toBeCloseTo(cycle)
    expect(moved?.fastestS).toBeCloseTo(cycle)

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
    mine.digCharge = { [TREASURE_HOLE_DIG]: 0.9 }
    const tipped: string[] = []
    applyTick(save, {
      onTreasureDrop: (drop) => tipped.push(treasureDropTip(drop.item, drop.qty)),
    })
    expect(oreBank(save, mine)).toBe(1)
    expect(mine.reserve).toBe(29)
    expect(tipped[0]).toBe(treasureDropTip(mine.vein === 'iron' ? 'ironOre' : mine.vein === 'mithril' ? 'mithrilOre' : 'ore', 1))
  })

  it('ships one item per cycle, so three miners finish sooner than one', () => {
    function claim(count: number) {
      const save = keepStationsOpen(createSave())
      const ids: string[] = []
      for (let i = 0; i < count; i += 1) {
        const worker = spawnWorker(save)
        worker.level = 1
        worker.combatAttrs = []
        ids.push(worker.id)
      }
      const mine = save.treasureMines.mines[0]
      mine.owner = 'empty'
      mine.shadows = []
      mine.raid = null
      mine.reserve = 10
      expect(claimTreasureMine(save, mine.id, ids).ok).toBe(true)
      return { save, mine }
    }

    const solo = claim(1)
    advance(solo.save, 4)
    expect(oreBank(solo.save, solo.mine)).toBe(0)
    advance(solo.save, 1)
    expect(oreBank(solo.save, solo.mine)).toBe(1)
    expect(solo.mine.reserve).toBe(9)

    const crew = claim(3)
    const perTick: number[] = []
    for (let i = 0; i < 5; i += 1) {
      const before = oreBank(crew.save, crew.mine)
      crew.save.elapsedS += 1
      stepTreasureMines(crew.save)
      perTick.push(oreBank(crew.save, crew.mine) - before)
    }
    expect(perTick).toEqual([0, 1, 0, 1, 1])
    expect(oreBank(crew.save, crew.mine)).toBe(3)
    expect(crew.mine.reserve).toBe(7)
    expect(mineDigReadout(crew.save, crew.mine)?.fastestS).toBeCloseTo(5 / 3)
    expect(mineDigSpeedLabel(5 / 3)).toBe('最快约 1.7s/次')
  })

  it('reads shadow dig progress for whoever stepDig is still mining', () => {
    const save = keepStationsOpen(createSave())
    const mine = ensureGarrison(save.treasureMines.mines[0])
    const lead = { ...mine.shadows[0], id: `${mine.id}-lead`, level: 1, name: '甲' }
    const slow = { ...mine.shadows[0], id: `${mine.id}-slow`, level: 1, name: '乙' }
    const fast = { ...mine.shadows[0], id: `${mine.id}-fast`, level: 11, name: '丙' }
    mine.owner = 'shadow'
    mine.raid = null
    mine.crewIds = []
    mine.shadows = [lead, slow, fast]
    mine.digCharge = {}
    const full = 1 / (1 / 5 + 1 / 5 + 1 / 3)
    expect(mineDigReadout(save, mine)?.fill).toBe(0)
    expect(mineDigReadout(save, mine)?.intervalS).toBeCloseTo(full)
    expect(mineDigReadout(save, mine)?.fastestS).toBeCloseTo(full)
    expect(playerMineDigReadout(save, mine)).toBeNull()

    mine.shadows = [fast]
    mine.digCharge = {}
    save.elapsedS += 1
    stepTreasureMines(save)
    expect(mineDigReadout(save, mine)?.fill).toBeCloseTo(1 / 3)
    expect(mineDigReadout(save, mine)?.fastestS).toBe(3)

    mine.owner = 'empty'
    mine.shadows = []
    expect(mineDigReadout(save, mine)).toBeNull()

    mine.owner = 'shadow'
    mine.shadows = [lead, slow, fast]
    mine.digCharge = {}
    const raider = spawnWorker(save)
    expect(startTreasureRaid(save, mine.id, [raider.id]).ok).toBe(true)
    const diggingRaid = save.treasureMines.mines.find((row) => row.id === mine.id)?.raid
    if (diggingRaid) diggingRaid.phase = 'fighting'
    const digging = 1 / (1 / 5 + 1 / 3)
    expect(mineDigReadout(save, mine)?.fill).toBe(0)
    expect(mineDigReadout(save, mine)?.intervalS).toBeCloseTo(digging)
    expect(mineDigReadout(save, mine)?.fastestS).toBeCloseTo(digging)
    mine.digCharge = { [TREASURE_HOLE_DIG]: 0.4 }
    expect(mineDigReadout(save, mine)?.fill).toBeCloseTo(0.4)

    mine.shadows = [lead]
    expect(mineDigReadout(save, mine)).toBeNull()
  })

  it('keeps revealed weaknesses until the hole is gone', () => {
    const save = keepStationsOpen(createSave())
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

function setGuards(mine: TreasureMine, count: number, hp = 30, atk = 4, spd = 5): void {
  mine.owner = count > 0 ? 'shadow' : 'empty'
  mine.raid = null
  mine.shadows = []
  for (let i = 0; i < count; i += 1) {
    mine.shadows.push({
      id: `${mine.id}-fee-${i}`,
      name: `守${i}`,
      level: 1,
      hp,
      hpMax: hp,
      atk,
      spd,
      runeId: 'runeSharp',
    })
  }
}

function jumpRaid(save: Save): void {
  save.elapsedS += marchDurationS(save) + 80
  stepTreasureMines(save)
}

describe('treasure sand fees', () => {
  it('stakes per guard, refunds a win, forfeits a loss, and keeps the stake across reload', () => {
    expect(raidStakeCost(0)).toBe(0)
    expect(raidStakeCost(1)).toBe(TREASURE_STAKE_PER_GUARD)
    expect(raidStakeCost(2)).toBe(80)
    expect(raidStakeCost(3)).toBe(120)

    const save = keepStationsOpen(createSave())
    const mine = save.treasureMines.mines[0]
    setGuards(mine, 3)
    const blocked = spawnWorker(save)
    save.treasureMines.vault.sandGold = 119
    addToBank(save, 'runeSharp', 1)
    expect(openTreasureRaid(save, mine.id, [blocked.id], { [blocked.id]: 'runeSharp' })).toEqual({
      ok: false,
      reason: sandShortTip(120),
    })
    expect(save.treasureMines.vault.sandGold).toBe(119)
    expect(save.bank.runeSharp).toBe(1)
    expect(mine.raid).toBeNull()

    setGuards(mine, 2)
    const winner = spawnWorker(save)
    save.treasureMines.vault.sandGold = 80
    takeTreasureVaultNotices()
    expect(openTreasureRaid(save, mine.id, [winner.id])).toEqual({ ok: true, message: stakePaidTip(80) })
    expect(save.treasureMines.vault.sandGold).toBe(0)
    expect(mine.raid?.stakeSand).toBe(80)

    const reloaded = hydrateLoadedSave(JSON.parse(JSON.stringify(save)))
    expect(reloaded).toBeTruthy()
    if (!reloaded) return
    const kept = reloaded.treasureMines.mines.find((row) => row.id === mine.id)
    expect(kept?.raid?.stakeSand).toBe(80)
    if (!kept?.raid) return
    for (const shadow of kept.shadows) {
      shadow.hp = 1
      shadow.hpMax = 1
      shadow.atk = 1
      shadow.spd = 99
    }
    jumpRaid(reloaded)
    expect(kept.owner).toBe('player')
    expect(kept.raid).toBeNull()
    expect(reloaded.treasureMines.vault.sandGold).toBe(80)
    expect(takeTreasureVaultNotices().map((notice) => notice.text)).toEqual([stakeRefundTip(80)])

    const lost = keepStationsOpen(createSave())
    const fight = lost.treasureMines.mines[1]
    setGuards(fight, 1, 99999, 99999, 1)
    const loser = spawnWorker(lost)
    lost.treasureMines.vault.sandGold = 40
    expect(openTreasureRaid(lost, fight.id, [loser.id]).ok).toBe(true)
    expect(lost.treasureMines.vault.sandGold).toBe(0)
    jumpRaid(lost)
    expect(fight.owner).toBe('shadow')
    expect(fight.raid).toBeNull()
    expect(lost.treasureMines.vault.sandGold).toBe(0)
    expect(takeTreasureVaultNotices().map((notice) => notice.text)).toEqual([STAKE_FORFEIT_TIP])
  })

  it('refunds when the hole vanishes before a result, and old raids without a stake stay unpaid', () => {
    const save = keepStationsOpen(createSave())
    const mine = save.treasureMines.mines[0]
    setGuards(mine, 1)
    const worker = spawnWorker(save)
    save.treasureMines.vault.sandGold = 40
    expect(openTreasureRaid(save, mine.id, [worker.id]).ok).toBe(true)
    const raid = mine.raid
    expect(raid?.stakeSand).toBe(40)
    if (!raid) return
    save.elapsedS = (raid.phaseEndsAtS ?? 1) - 1
    mine.expiresAtS = save.elapsedS
    takeTreasureVaultNotices()
    stepTreasureMines(save)
    expect(save.treasureMines.mines.some((row) => row.id === mine.id)).toBe(false)
    expect(save.treasureMines.vault.sandGold).toBe(40)
    expect(takeTreasureVaultNotices().map((notice) => notice.text)).toEqual([stakeRefundTip(40)])

    const legacy = keepStationsOpen(createSave())
    const old = legacy.treasureMines.mines[0]
    setGuards(old, 1, 1, 1, 99)
    const raider = spawnWorker(legacy)
    legacy.treasureMines.vault.sandGold = 40
    expect(openTreasureRaid(legacy, old.id, [raider.id]).ok).toBe(true)
    expect(legacy.treasureMines.vault.sandGold).toBe(0)
    delete old.raid?.stakeSand
    const loaded = hydrateLoadedSave(JSON.parse(JSON.stringify(legacy)))
    expect(loaded?.treasureMines.mines.find((row) => row.id === old.id)?.raid?.stakeSand).toBe(0)
    if (!loaded) return
    const standing = loaded.treasureMines.mines.find((row) => row.id === old.id)
    expect(standing).toBeTruthy()
    if (!standing) return
    for (const shadow of standing.shadows) {
      shadow.hp = 1
      shadow.atk = 1
      shadow.spd = 99
    }
    loaded.treasureMines.vault.sandGold = 11
    takeTreasureVaultNotices()
    jumpRaid(loaded)
    expect(standing.owner).toBe('player')
    expect(loaded.treasureMines.vault.sandGold).toBe(11)
    expect(takeTreasureVaultNotices()).toEqual([])
  })

  it('settles a reloaded fight the same way after offline catch-up', () => {
    const save = keepStationsOpen(createSave())
    const mine = save.treasureMines.mines[0]
    setGuards(mine, 1, 1, 1, 99)
    const winner = spawnWorker(save)
    save.treasureMines.vault.sandGold = 40
    expect(openTreasureRaid(save, mine.id, [winner.id]).ok).toBe(true)
    const loaded = hydrateLoadedSave(JSON.parse(JSON.stringify(save)))
    expect(loaded).toBeTruthy()
    if (!loaded) return
    const hole = loaded.treasureMines.mines.find((row) => row.id === mine.id)
    expect(hole?.raid?.stakeSand).toBe(40)
    const now = Date.now()
    loaded.lastTick = now - 90_000
    takeTreasureVaultNotices()
    const settled = settleOffline(loaded, now)
    const after = settled.save.treasureMines.mines.find((row) => row.id === mine.id)
    expect(after?.owner).toBe('player')
    expect(after?.raid).toBeNull()
    expect(settled.save.treasureMines.vault.sandGold).toBeGreaterThanOrEqual(40)
    expect(takeTreasureVaultNotices().map((notice) => notice.text)).toContain(stakeRefundTip(40))

    const lost = keepStationsOpen(createSave())
    const fight = lost.treasureMines.mines[1]
    setGuards(fight, 1, 99999, 99999, 1)
    const loser = spawnWorker(lost)
    lost.treasureMines.vault.sandGold = 40
    expect(openTreasureRaid(lost, fight.id, [loser.id]).ok).toBe(true)
    const lostNow = Date.now()
    lost.lastTick = lostNow - 90_000
    takeTreasureVaultNotices()
    const lostSettle = settleOffline(lost, lostNow)
    expect(lostSettle.save.treasureMines.vault.sandGold).toBe(0)
    expect(lostSettle.save.treasureMines.mines.find((row) => row.id === fight.id)?.owner).toBe('shadow')
    expect(takeTreasureVaultNotices().map((notice) => notice.text)).toContain(STAKE_FORFEIT_TIP)
  })

  it('lets an empty hole be claimed for free', () => {
    const save = keepStationsOpen(createSave())
    const mine = save.treasureMines.mines[0]
    setGuards(mine, 0)
    const worker = spawnWorker(save)
    save.treasureMines.vault.sandGold = 7
    expect(openTreasureRaid(save, mine.id, [worker.id])).toEqual({ ok: false, reason: '洞里没有守军' })
    expect(save.treasureMines.vault.sandGold).toBe(7)
    expect(claimTreasureMine(save, mine.id, [worker.id]).ok).toBe(true)
    expect(save.treasureMines.vault.sandGold).toBe(7)
    expect(mine.owner).toBe('player')
  })

  it('charges scout once and reveals every weakness until the hole is already open', () => {
    const save = keepStationsOpen(createSave())
    const mine = save.treasureMines.mines[0]
    mine.weaknesses = ['fire', 'ice', 'sword']
    mine.revealedWeaknesses = []
    save.treasureMines.vault.sandGold = 19
    expect(scoutTreasureMine(save, mine.id)).toEqual({ ok: false, reason: sandShortTip(TREASURE_SCOUT_COST) })
    expect(save.treasureMines.vault.sandGold).toBe(19)
    expect(mine.revealedWeaknesses).toEqual([])
    expect(mineFullyRevealed(mine)).toBe(false)

    save.treasureMines.vault.sandGold = 20
    expect(scoutTreasureMine(save, mine.id)).toEqual({ ok: true, message: `砂金 −${TREASURE_SCOUT_COST}` })
    expect(save.treasureMines.vault.sandGold).toBe(0)
    expect(mine.weaknesses).toEqual(['fire', 'ice', 'sword'])
    expect(mine.revealedWeaknesses).toEqual(['fire', 'ice', 'sword'])
    expect(mineFullyRevealed(mine)).toBe(true)

    save.treasureMines.vault.sandGold = 50
    expect(scoutTreasureMine(save, mine.id)).toEqual({ ok: false, reason: '弱点已经揭开' })
    expect(save.treasureMines.vault.sandGold).toBe(50)

    const partial = save.treasureMines.mines[1]
    partial.weaknesses = ['fire', 'ice']
    partial.revealedWeaknesses = ['fire']
    partial.raid = null
    save.treasureMines.vault.sandGold = 20
    expect(scoutTreasureMine(save, partial.id).ok).toBe(true)
    expect(partial.revealedWeaknesses).toEqual(['fire', 'ice'])
    expect(save.treasureMines.vault.sandGold).toBe(0)

    setGuards(partial, 1)
    const raider = spawnWorker(save)
    save.treasureMines.vault.sandGold = 40
    expect(openTreasureRaid(save, partial.id, [raider.id]).ok).toBe(true)
    save.treasureMines.vault.sandGold = 20
    expect(scoutTreasureMine(save, partial.id)).toEqual({ ok: false, reason: '这洞抢夺进行中' })
    expect(save.treasureMines.vault.sandGold).toBe(20)
  })

  it('refreshes with sand or diamonds and keeps fights and our mining', () => {
    const save = keepStationsOpen(createSave())
    save.diamonds = 30
    save.treasureMines.vault.sandGold = TREASURE_REFRESH_SAND_COST
    const owned = save.treasureMines.mines[0]
    const miner = spawnWorker(save)
    owned.owner = 'player'
    owned.shadows = []
    owned.crewIds = [miner.id]
    const fighting = save.treasureMines.mines[1]
    setGuards(fighting, 1)
    const raider = spawnWorker(save)
    save.treasureMines.vault.sandGold = TREASURE_REFRESH_SAND_COST + 40
    expect(openTreasureRaid(save, fighting.id, [raider.id]).ok).toBe(true)
    const sandAfterStake = save.treasureMines.vault.sandGold
    expect(sandAfterStake).toBe(TREASURE_REFRESH_SAND_COST)
    const dropped = save.treasureMines.mines.filter((mine) => mine.id !== owned.id && mine.id !== fighting.id).map((mine) => mine.id)

    expect(refreshTreasureMineBoard(save, 'sandGold')).toEqual({
      ok: true,
      message: `砂金 −${TREASURE_REFRESH_SAND_COST}`,
    })
    expect(save.treasureMines.vault.sandGold).toBe(0)
    expect(save.diamonds).toBe(30)
    expect(save.treasureMines.mines.some((mine) => mine.id === owned.id)).toBe(true)
    expect(save.treasureMines.mines.some((mine) => mine.id === fighting.id)).toBe(true)
    expect(save.treasureMines.mines.some((mine) => dropped.includes(mine.id))).toBe(false)

    save.treasureMines.vault.sandGold = 99
    const ids = save.treasureMines.mines.map((mine) => mine.id)
    expect(refreshTreasureMineBoard(save, 'sandGold')).toEqual({
      ok: false,
      reason: sandShortTip(TREASURE_REFRESH_SAND_COST),
    })
    expect(save.treasureMines.vault.sandGold).toBe(99)
    expect(save.diamonds).toBe(30)
    expect(save.treasureMines.mines.map((mine) => mine.id)).toEqual(ids)

    save.diamonds = TREASURE_REFRESH_COST
    expect(refreshTreasureMineBoard(save, 'diamonds')).toEqual({
      ok: true,
      message: `钻石 −${TREASURE_REFRESH_COST}`,
    })
    expect(save.diamonds).toBe(0)
    expect(save.treasureMines.vault.sandGold).toBe(99)
    expect(save.treasureMines.mines.some((mine) => mine.id === owned.id)).toBe(true)
    expect(save.treasureMines.mines.some((mine) => mine.id === fighting.id)).toBe(true)
  })
})

describe('treasure jewel leftovers', () => {
  it('keeps bought runes and an old raid reinforce flag without spending jewels again', () => {
    const save = keepStationsOpen(createSave())
    const mine = ensureGarrison(save.treasureMines.mines[0])
    const lead = spawnWorker(save)
    const extra = spawnWorker(save)
    save.bank.runeSharp = 1
    save.bank.runeArmor = 1
    save.bank.runeSwift = 1
    save.treasureMines.vault.jewel = 60
    save.treasureMines.vault.sandGold = 80
    expect(openTreasureRaid(save, mine.id, [lead.id]).ok).toBe(true)
    const raid = mine.raid
    expect(raid).toBeTruthy()
    if (!raid) return
    raid.reinforced = true
    ;(raid as { armory?: unknown }).armory = { runeSharp: 1 }
    const loaded = hydrateLoadedSave(JSON.parse(JSON.stringify(save)))
    const kept = loaded?.treasureMines.mines.find((row) => row.id === mine.id)
    expect(kept?.raid?.reinforced).toBe(true)
    expect(kept?.raid?.incoming).toBe(false)
    expect(kept?.raid?.queue).toEqual([lead.id])
    expect(loaded?.bank.runeSharp).toBe(1)
    expect(loaded?.bank.runeArmor).toBe(1)
    expect(loaded?.bank.runeSwift).toBe(1)
    expect(loaded?.treasureMines.vault.jewel).toBe(60)
    if (!loaded) return
    expect(reinforceTreasureRaid(loaded, mine.id, extra.id)).toEqual({
      ok: false,
      reason: '抢夺中不能增援',
    })
    expect(loaded.treasureMines.vault.jewel).toBe(60)
    expect(kept?.raid?.queue).toEqual([lead.id])
  })
})

describe('treasure jade banner', () => {
  it('spends jade to upgrade, blocks a short pile, and blocks a full banner', () => {
    expect([...TREASURE_BANNER_COSTS]).toEqual([150, 300, 600, 1000, 1600])
    const save = keepStationsOpen(createSave())
    expect(bannerLevelOf(save)).toBe(0)
    for (let level = 0; level < TREASURE_BANNER_MAX; level += 1) {
      const cost = TREASURE_BANNER_COSTS[level]
      save.treasureMines.vault.jade = cost - 1
      expect(upgradeTreasureBanner(save)).toEqual({ ok: false, reason: jadeShortTip(cost, cost - 1) })
      expect(bannerLevelOf(save)).toBe(level)
      expect(save.treasureMines.vault.jade).toBe(cost - 1)
      save.treasureMines.vault.jade = cost
      expect(upgradeTreasureBanner(save)).toEqual({ ok: true, message: `荣誉徽记 −${cost}` })
      expect(bannerLevelOf(save)).toBe(level + 1)
      expect(save.treasureMines.vault.jade).toBe(0)
    }
    save.treasureMines.vault.jade = 1600
    expect(upgradeTreasureBanner(save)).toEqual({ ok: false, reason: '战旗已满' })
    expect(bannerLevelOf(save)).toBe(TREASURE_BANNER_MAX)
    expect(save.treasureMines.vault.jade).toBe(1600)
    expect(bannerFrameOf(0)).toBe('none')
    expect(bannerFrameOf(1)).toBe('copper')
    expect(bannerFrameOf(2)).toBe('copper')
    expect(bannerFrameOf(3)).toBe('silver')
    expect(bannerFrameOf(4)).toBe('silver')
    expect(bannerFrameOf(5)).toBe('gold')
  })

  it('marks the banner ready only when jade covers the next level', () => {
    const save = keepStationsOpen(createSave())
    expect(bannerUpgradeReady(save)).toBe(false)
    save.treasureMines.vault.jade = 149
    expect(bannerUpgradeReady(save)).toBe(false)
    save.treasureMines.vault.jade = 150
    expect(bannerUpgradeReady(save)).toBe(true)
    save.treasureMines.bannerLevel = 4
    save.treasureMines.vault.jade = 1599
    expect(bannerUpgradeReady(save)).toBe(false)
    save.treasureMines.vault.jade = 1600
    expect(bannerUpgradeReady(save)).toBe(true)
    save.treasureMines.bannerLevel = TREASURE_BANNER_MAX
    save.treasureMines.vault.jade = 9999
    expect(bannerUpgradeReady(save)).toBe(false)
  })

  it('raises only newly spawned reserve and garrison level', () => {
    expect(bannerReserveMax(0)).toBe(TREASURE_RESERVE_MAX)
    expect(bannerReserveMax(1)).toBe(1100)
    expect(bannerReserveMax(5)).toBe(1500)
    const save = keepStationsOpen(createSave())
    const standing = ensureGarrison(save.treasureMines.mines[0])
    const oldReserve = standing.reserve
    const oldMax = standing.reserveMax
    const oldLevels = standing.shadows.map((shadow) => shadow.level)
    save.knightLevel = 4
    save.treasureMines.bannerLevel = 3
    let sawGuard = false
    for (let i = 0; i < 40 && !sawGuard; i += 1) {
      for (const mine of save.treasureMines.mines) {
        if (mine.id !== standing.id) mine.reserve = 0
      }
      refreshTreasureMines(save)
      const kept = save.treasureMines.mines.find((mine) => mine.id === standing.id)
      expect(kept?.reserve).toBe(oldReserve)
      expect(kept?.reserveMax).toBe(oldMax)
      expect(kept?.shadows.map((shadow) => shadow.level)).toEqual(oldLevels)
      for (const mine of save.treasureMines.mines) {
        if (mine.id === standing.id) continue
        expect(mine.reserve).toBe(bannerReserveMax(3))
        expect(mine.reserveMax).toBe(1300)
        if (mine.shadows.length > 0) {
          sawGuard = true
          expect(mine.shadows.every((shadow) => shadow.level === 4 + 3)).toBe(true)
        }
      }
    }
    expect(sawGuard).toBe(true)
  })

  it('opens mining slots to 3, 4, then 5, while raids stay at 3', () => {
    const save = keepStationsOpen(createSave())
    expect(treasureCrewCap(save)).toBe(3)
    save.treasureMines.bannerLevel = 1
    expect(treasureCrewCap(save)).toBe(3)
    const mine = save.treasureMines.mines[0]
    setGuards(mine, 0)
    const miners = Array.from({ length: 6 }, () => spawnWorker(save))
    expect(claimTreasureMine(save, mine.id, miners.slice(0, 4).map((worker) => worker.id))).toEqual({
      ok: false,
      reason: '这洞最多 3 人',
    })
    expect(claimTreasureMine(save, mine.id, miners.slice(0, 3).map((worker) => worker.id)).ok).toBe(true)
    expect(mine.crewIds).toHaveLength(3)
    expect(abandonTreasureMine(save, mine.id).ok).toBe(true)

    save.treasureMines.bannerLevel = 2
    expect(treasureCrewCap(save)).toBe(4)
    expect(claimTreasureMine(save, mine.id, miners.slice(0, 4).map((worker) => worker.id)).ok).toBe(true)
    expect(mine.crewIds).toHaveLength(4)
    expect(abandonTreasureMine(save, mine.id).ok).toBe(true)
    save.treasureMines.bannerLevel = 3
    expect(treasureCrewCap(save)).toBe(4)
    expect(claimTreasureMine(save, mine.id, miners.slice(0, 5).map((worker) => worker.id))).toEqual({
      ok: false,
      reason: '这洞最多 4 人',
    })

    save.treasureMines.bannerLevel = 4
    expect(treasureCrewCap(save)).toBe(5)
    expect(claimTreasureMine(save, mine.id, miners.slice(0, 5).map((worker) => worker.id)).ok).toBe(true)
    expect(mine.crewIds).toHaveLength(5)
    expect(abandonTreasureMine(save, mine.id).ok).toBe(true)
    save.treasureMines.bannerLevel = 5
    expect(treasureCrewCap(save)).toBe(5)
    expect(claimTreasureMine(save, mine.id, miners.map((worker) => worker.id))).toEqual({
      ok: false,
      reason: '这洞最多 5 人',
    })

    const raidHole = ensureGarrison(save.treasureMines.mines[1])
    const raiders = Array.from({ length: 4 }, () => spawnWorker(save))
    save.treasureMines.vault.sandGold = 400
    expect(openTreasureRaid(save, raidHole.id, raiders.map((worker) => worker.id))).toEqual({
      ok: false,
      reason: '抢夺最多 3 人',
    })
    expect(raidHole.raid).toBeNull()
  })

  it('keeps a missing banner at 0 and round-trips level with the richer holes', () => {
    const blank = keepStationsOpen(createSave())
    delete (blank.treasureMines as { bannerLevel?: number }).bannerLevel
    const legacy = hydrateLoadedSave(JSON.parse(JSON.stringify(blank)))
    expect(legacy?.treasureMines.bannerLevel).toBe(0)
    expect(legacy ? treasureCrewCap(legacy) : -1).toBe(3)
    expect(legacy?.treasureMines.mines.every((mine) => mine.reserveMax === TREASURE_RESERVE_MAX)).toBe(true)

    const save = keepStationsOpen(createSave())
    const standing = save.treasureMines.mines[0]
    const standingMax = standing.reserveMax
    save.treasureMines.bannerLevel = 2
    save.treasureMines.vault.jade = 40
    for (const mine of save.treasureMines.mines) {
      if (mine.id !== standing.id) mine.reserve = 0
    }
    refreshTreasureMines(save)
    const born = save.treasureMines.mines.find((mine) => mine.id !== standing.id)
    expect(born?.reserveMax).toBe(1200)
    const loaded = hydrateLoadedSave(JSON.parse(JSON.stringify(save)))
    expect(loaded?.treasureMines.bannerLevel).toBe(2)
    expect(loaded?.treasureMines.vault.jade).toBe(40)
    expect(loaded?.treasureMines.mines.find((mine) => mine.id === standing.id)?.reserveMax).toBe(standingMax)
    expect(loaded?.treasureMines.mines.find((mine) => mine.id === born?.id)?.reserveMax).toBe(1200)
    expect(loaded?.treasureMines.mines.find((mine) => mine.id === born?.id)?.reserve).toBe(1200)
  })
})

function stepOnline(save: Save, rolls?: number[]): void {
  save.elapsedS += 1
  stepTreasureMines(save, undefined, rolls ? { rolls } : undefined)
}

function startIncoming(save: Save, mine: TreasureMine) {
  mine.assaultChargeS = TREASURE_ASSAULT_INTERVAL_S - 1
  stepOnline(save, [0, 0, 0.1, 0.2])
  for (let i = 0; i < TREASURE_ASSAULT_WARN_S; i += 1) stepOnline(save)
  return mine.raid
}

function crushIncoming(save: Save, mine: TreasureMine): void {
  const raid = mine.raid
  const shadow = mine.shadows[0]
  if (!raid || !shadow) return
  shadow.hp = 1
  raid.defHp = 1
  raid.atkAtk = 500
  raid.atkNext = save.elapsedS
  raid.defNext = save.elapsedS + 999
  stepOnline(save)
}

function claimFirstEmpty(save: Save, workerIds: readonly string[]): TreasureMine {
  const mine = save.treasureMines.mines[0]
  setGuards(mine, 0)
  const claimed = claimTreasureMine(save, mine.id, workerIds)
  expect(claimed.ok).toBe(true)
  return mine
}

describe('treasure assault', () => {
  it('checks every 10 peaceful minutes and uses the injected roll for a hit', () => {
    expect(assaultHits(0)).toBe(true)
    expect(assaultHits(0.2 - 1e-9)).toBe(true)
    expect(assaultHits(0.2)).toBe(false)
    expect(assaultCrewCount(0)).toBe(1)
    expect(assaultCrewCount(1 / 3 - 1e-9)).toBe(1)
    expect(assaultCrewCount(1 / 3)).toBe(2)
    expect(assaultCrewCount(2 / 3 - 1e-9)).toBe(2)
    expect(assaultCrewCount(2 / 3)).toBe(3)

    const save = keepStationsOpen(createSave())
    const miner = spawnWorker(save)
    const mine = claimFirstEmpty(save, [miner.id])
    for (let i = 0; i < TREASURE_ASSAULT_INTERVAL_S - 1; i += 1) stepOnline(save)
    expect(mine.assaultWarnAtS).toBeNull()
    expect(mine.raid).toBeNull()
    expect(mine.assaultChargeS).toBe(TREASURE_ASSAULT_INTERVAL_S - 1)
    expect(treasureAssaultWarning(save)).toBe(false)

    const miss = [0.2]
    stepOnline(save, miss)
    expect(miss).toEqual([])
    expect(mine.assaultWarnAtS).toBeNull()
    expect(mine.assaultParty).toEqual([])
    expect(mine.assaultChargeS).toBe(0)

    save.knightLevel = 4
    save.treasureMines.bannerLevel = 2
    mine.assaultChargeS = TREASURE_ASSAULT_INTERVAL_S - 1
    const hit = [0, 0, 0.2, 0.4]
    stepOnline(save, hit)
    expect(hit).toEqual([])
    expect(mine.assaultParty).toHaveLength(1)
    expect(mine.assaultParty[0]?.level).toBe(6)
    expect(PLAYER_AVATAR_IDS).toContain(mine.assaultAvatarId)
    expect(mine.assaultWarnAtS).toBe(save.elapsedS + TREASURE_ASSAULT_WARN_S)
    expect(mine.raid).toBeNull()
    expect(mineDigReadout(save, mine)).not.toBeNull()
    expect(treasureAssaultWarning(save)).toBe(true)

    const pending = mine.assaultParty.map((shadow) => shadow.id)
    mine.assaultChargeS = TREASURE_ASSAULT_INTERVAL_S - 1
    stepOnline(save, [0, 0.9, 0.1, 0.2, 0.3, 0.4])
    expect(mine.assaultParty.map((shadow) => shadow.id)).toEqual(pending)
    expect(mine.assaultChargeS).toBe(TREASURE_ASSAULT_INTERVAL_S - 1)
  })

  it('rolls one to three attackers in equal thirds', () => {
    const save = keepStationsOpen(createSave())
    const miner = spawnWorker(save)
    const mine = claimFirstEmpty(save, [miner.id])
    mine.assaultChargeS = TREASURE_ASSAULT_INTERVAL_S - 1
    stepOnline(save, [0, 2 / 3, 0.1, 0.2, 0.3, 0.5])
    expect(mine.assaultParty).toHaveLength(3)
    expect(new Set(mine.assaultParty.map((shadow) => shadow.name)).size).toBe(3)
  })

  it('does not assault while offline and restarts the clock on return', () => {
    const save = keepStationsOpen(createSave())
    const miner = spawnWorker(save)
    const mine = claimFirstEmpty(save, [miner.id])
    mine.assaultChargeS = TREASURE_ASSAULT_INTERVAL_S - 1
    mine.assaultWarnAtS = save.elapsedS + 5
    mine.assaultParty = [
      {
        id: `${mine.id}-assault-0`,
        name: '青石',
        level: 1,
        hp: 20,
        hpMax: 20,
        atk: 4,
        spd: 4,
        runeId: 'runeSharp',
      },
    ]
    mine.assaultAvatarId = 'helm'
    const now = Date.now()
    save.lastTick = now - 180_000
    const settled = settleOffline(save, now)
    const hole = settled.save.treasureMines.mines.find((row) => row.id === mine.id)
    expect(hole?.owner).toBe('player')
    expect(hole?.raid).toBeNull()
    expect(hole?.assaultWarnAtS).toBeNull()
    expect(hole?.assaultParty).toEqual([])
    expect(hole?.assaultChargeS).toBe(0)
    expect(hole?.crewIds).toContain(miner.id)
  })

  it('opens the fight when the warning ends, with us defending on top', () => {
    const save = keepStationsOpen(createSave())
    save.playerName = '旅人甲'
    const miner = spawnWorker(save)
    const mine = claimFirstEmpty(save, [miner.id])
    mine.assaultChargeS = TREASURE_ASSAULT_INTERVAL_S - 1
    stepOnline(save, [0, 0, 0.15, 0.2])
    expect(mine.assaultWarnAtS).toBe(save.elapsedS + TREASURE_ASSAULT_WARN_S)
    const beforeWarn = mine.reserve
    for (let i = 0; i < TREASURE_ASSAULT_WARN_S - 1; i += 1) stepOnline(save)
    expect(mine.raid).toBeNull()
    expect(mine.reserve).toBeLessThan(beforeWarn)
    expect(mineDigReadout(save, mine)).not.toBeNull()
    const atFight = mine.reserve
    stepOnline(save)
    expect(mine.raid?.incoming).toBe(true)
    expect(mine.raid?.phase).toBe('fighting')
    expect(mine.raid?.queue).toEqual([miner.id])
    expect(mine.shadows).toHaveLength(1)
    expect(mine.owner).toBe('player')
    expect(mine.reserve).toBe(atFight)
    expect(mineDigReadout(save, mine)).toBeNull()
    expect(treasureAssaultWarning(save)).toBe(false)

    const hud = treasureRaidHud(mine, save.workers, save.elapsedS, save.playerName, save.playerAvatarId)
    expect(hud?.defend.name).toContain('旅人甲')
    expect(hud?.attack?.name).toBe(mine.shadows[0]?.name)
    expect(hud?.defend.avatarId).toBe(save.playerAvatarId)
    const top = raidSlotPress(mine, save.workers, 'defend', 0, save)
    const bottom = raidSlotPress(mine, save.workers, 'attack', 0, save)
    expect(top.kind).toBe('sheet')
    expect(bottom.kind).toBe('sheet')
    if (top.kind === 'sheet') expect(top.sheet.rows.some((row) => row.label === '职业')).toBe(true)
    if (bottom.kind === 'sheet') expect(bottom.sheet.rows.some((row) => row.label === '职业')).toBe(false)

    const ids = save.treasureMines.mines.map((row) => row.id)
    save.diamonds = TREASURE_REFRESH_COST
    expect(refreshTreasureMineBoard(save).ok).toBe(true)
    expect(save.treasureMines.mines.some((row) => row.id === mine.id)).toBe(true)
    expect(save.treasureMines.mines.map((row) => row.id)).not.toEqual(ids)
  })

  it('loots sand when the hole is held and lets survivors keep digging', () => {
    const save = keepStationsOpen(createSave())
    const miner = spawnWorker(save)
    const mine = claimFirstEmpty(save, [miner.id])
    const wardUntil = save.elapsedS + TREASURE_WARD_S
    mine.fortifyUntilS = wardUntil
    mine.assaultChargeS = TREASURE_ASSAULT_INTERVAL_S - 1
    stepOnline(save, [0, 0, 0.1, 0.2])
    for (let i = 0; i < TREASURE_ASSAULT_WARN_S; i += 1) stepOnline(save)
    const raid = mine.raid
    const shadow = mine.shadows[0]
    expect(raid?.incoming).toBe(true)
    expect(raid?.fortified).toBe(true)
    if (!raid || !shadow) return
    shadow.hp = 1
    raid.defHp = 1
    raid.atkAtk = 500
    raid.atkNext = save.elapsedS
    raid.defNext = save.elapsedS + 999
    save.treasureMines.vault.sandGold = 8
    takeTreasureVaultNotices()
    stepOnline(save)
    expect(mine.raid).toBeNull()
    expect(mine.owner).toBe('player')
    expect(mine.crewIds).toEqual([miner.id])
    expect(mine.fortifyUntilS).toBe(wardUntil)
    expect(mine.shadows).toEqual([])
    expect(save.treasureMines.vault.sandGold).toBe(8 + TREASURE_ASSAULT_LOOT)
    expect(takeTreasureVaultNotices().map((notice) => notice.text)).toContain(assaultLootTip())
    expect(mineDigReadout(save, mine)).not.toBeNull()
  })

  it('gives the hole to the remaining shadows and sends our workers to the rest tail', () => {
    const save = keepStationsOpen(createSave())
    const miner = spawnWorker(save)
    const mine = claimFirstEmpty(save, [miner.id])
    const bystander = spawnWorker(save)
    mine.fortifyUntilS = save.elapsedS + TREASURE_WARD_S
    mine.trapUntilS = save.elapsedS + TREASURE_WARD_S
    mine.assaultChargeS = TREASURE_ASSAULT_INTERVAL_S - 1
    stepOnline(save, [0, 0, 0.1, 0.2])
    for (let i = 0; i < TREASURE_ASSAULT_WARN_S; i += 1) stepOnline(save)
    const reserve = mine.reserve
    const expiresAtS = mine.expiresAtS
    const raid = mine.raid
    const shadow = mine.shadows[0]
    expect(raid && shadow).toBeTruthy()
    if (!raid || !shadow) return
    shadow.hp = 99999
    shadow.atk = 99999
    raid.defHp = 99999
    raid.defAtk = 99999
    raid.defNext = save.elapsedS
    raid.atkNext = save.elapsedS + 999
    save.treasureMines.vault.sandGold = 12
    save.treasureMines.vault.jewel = 4
    save.treasureMines.vault.jade = 2
    takeTreasureVaultNotices()
    stepOnline(save)
    expect(mine.raid?.phase).toBe('marchHomeLose')
    expect(mine.owner).toBe('player')
    for (let i = 0; i < marchDurationS(save) + 2 && mine.owner === 'player'; i += 1) stepOnline(save)
    expect(mine.owner).toBe('shadow')
    expect(mine.raid).toBeNull()
    expect(mine.shadows).toHaveLength(1)
    expect(mine.crewIds).toEqual([])
    expect(mine.reserve).toBe(reserve)
    expect(mine.expiresAtS).toBe(expiresAtS)
    expect(mine.fortifyUntilS).toBeNull()
    expect(mine.trapUntilS).toBeNull()
    expect(save.treasureMines.vault.sandGold).toBe(12)
    expect(save.treasureMines.vault.jewel).toBe(4)
    expect(save.treasureMines.vault.jade).toBe(2)
    expect(save.workers.at(-1)?.id).toBe(miner.id)
    expect(save.workers.at(-2)?.id).toBe(bystander.id)
    expect(treasureMineBlockReason(save, miner.id)).toBeNull()
    expect(openTreasureRaid(save, mine.id, [bystander.id])).toEqual({
      ok: false,
      reason: sandShortTip(TREASURE_STAKE_PER_GUARD),
    })
    save.treasureMines.vault.sandGold = TREASURE_STAKE_PER_GUARD
    expect(openTreasureRaid(save, mine.id, [bystander.id]).ok).toBe(true)
    expect(mine.raid?.incoming).not.toBe(true)
    expect(save.treasureMines.vault.sandGold).toBe(0)
    expect(save.treasureMines.vault.jewel).toBe(4)
    expect(save.treasureMines.vault.jade).toBe(2)
  })

  it('does not spend jewels when fortify or trap cannot be bought', () => {
    const save = keepStationsOpen(createSave())
    const miner = spawnWorker(save)
    const mine = claimFirstEmpty(save, [miner.id])
    save.treasureMines.vault.jewel = TREASURE_FORTIFY_COST - 1
    expect(fortifyTreasureMine(save, mine.id)).toEqual({
      ok: false,
      reason: jewelShortTip(TREASURE_FORTIFY_COST, TREASURE_FORTIFY_COST - 1),
    })
    expect(trapTreasureMine(save, mine.id)).toEqual({
      ok: false,
      reason: jewelShortTip(TREASURE_TRAP_COST, TREASURE_FORTIFY_COST - 1),
    })
    expect(mine.fortifyUntilS).toBeNull()
    expect(mine.trapUntilS).toBeNull()
    expect(save.treasureMines.vault.jewel).toBe(TREASURE_FORTIFY_COST - 1)
  })

  it('fortifies defenders by 1.5 for every assault inside 30 minutes, including reinforcements', () => {
    const save = keepStationsOpen(createSave())
    const miner = spawnWorker(save)
    const extra = spawnWorker(save)
    const mine = claimFirstEmpty(save, [miner.id])
    const hpMax = miner.hpMax
    const digBefore = mineDigReadout(save, mine)
    const weaknesses = [...mine.weaknesses]
    save.treasureMines.vault.jewel = TREASURE_FORTIFY_COST
    expect(fortifyTreasureMine(save, mine.id)).toEqual({
      ok: true,
      message: `珠宝 −${TREASURE_FORTIFY_COST}`,
    })
    const until = mine.fortifyUntilS
    expect(until).toBe(save.elapsedS + TREASURE_WARD_S)
    expect(mineDigReadout(save, mine)?.intervalS).toBe(digBefore?.intervalS)
    expect(mine.weaknesses).toEqual(weaknesses)
    save.treasureMines.vault.jewel = TREASURE_FORTIFY_COST
    expect(fortifyTreasureMine(save, mine.id)).toEqual({ ok: false, reason: '加固还在生效' })
    expect(mine.fortifyUntilS).toBe(until)
    expect(save.treasureMines.vault.jewel).toBe(TREASURE_FORTIFY_COST)

    const boosted = Math.round(hpMax * TREASURE_FORTIFY_HP_MUL)
    const first = startIncoming(save, mine)
    expect(first?.fortified).toBe(true)
    expect(first?.atkMax).toBe(boosted)
    expect(first?.atkHp).toBe(first?.atkMax)
    expect(miner.hpMax).toBe(hpMax)
    expect(fortifyTreasureMine(save, mine.id)).toEqual({ ok: false, reason: '这洞现在不能加固' })
    save.treasureMines.vault.jewel = TREASURE_REINFORCE_COST
    expect(reinforceTreasureRaid(save, mine.id, extra.id).ok).toBe(true)
    const slot = first?.attackSlots?.indexOf(extra.id) ?? -1
    expect(slot).toBeGreaterThan(0)
    expect(first?.attackSlotMax[slot]).toBe(Math.round(extra.hpMax * TREASURE_FORTIFY_HP_MUL))
    crushIncoming(save, mine)
    expect(mine.raid).toBeNull()
    expect(mine.fortifyUntilS).toBe(until)
    expect(miner.hpMax).toBe(hpMax)

    const second = startIncoming(save, mine)
    expect(second?.fortified).toBe(true)
    expect(second?.atkMax).toBe(boosted)
    crushIncoming(save, mine)

    save.elapsedS = until ?? save.elapsedS
    const expired = startIncoming(save, mine)
    expect(expired?.fortified).not.toBe(true)
    expect(expired?.atkMax).toBe(hpMax)
    expect(fortifyRemainS(mine, save.elapsedS)).toBe(0)
  })

  it('cuts each incoming shadow by 20% of max hp and stacks with fortify', () => {
    expect(trapOpeningHp(10, 10)).toBe(8)
    expect(trapOpeningHp(3, 3)).toBe(2)
    expect(trapOpeningHp(1, 1)).toBe(1)
    const save = keepStationsOpen(createSave())
    const miner = spawnWorker(save)
    const mine = claimFirstEmpty(save, [miner.id])
    save.treasureMines.vault.jewel = TREASURE_TRAP_COST + TREASURE_FORTIFY_COST
    expect(trapTreasureMine(save, mine.id).ok).toBe(true)
    expect(fortifyTreasureMine(save, mine.id).ok).toBe(true)
    expect(save.treasureMines.vault.jewel).toBe(0)
    const raid = startIncoming(save, mine)
    const shadow = mine.shadows[0]
    expect(raid?.fortified).toBe(true)
    expect(raid?.atkMax).toBe(Math.round(miner.hpMax * TREASURE_FORTIFY_HP_MUL))
    expect(shadow).toBeTruthy()
    if (!shadow) return
    const cut = Math.round(shadow.hpMax * TREASURE_TRAP_HP_RATIO)
    expect(shadow.hp).toBe(Math.max(1, shadow.hpMax - cut))
    expect(raid?.defendSlotHp[0]).toBe(shadow.hp)
    expect(shadow.hpMax - shadow.hp).toBe(cut)
  })

  it('resets a ward to a fresh 30 minutes instead of adding time', () => {
    const save = keepStationsOpen(createSave())
    const miner = spawnWorker(save)
    const mine = claimFirstEmpty(save, [miner.id])
    save.treasureMines.vault.jewel = TREASURE_TRAP_COST * 2
    expect(trapTreasureMine(save, mine.id).ok).toBe(true)
    const first = mine.trapUntilS
    save.elapsedS += 100
    expect(trapTreasureMine(save, mine.id)).toEqual({ ok: false, reason: '陷阱还在生效' })
    expect(mine.trapUntilS).toBe(first)
    expect(save.treasureMines.vault.jewel).toBe(TREASURE_TRAP_COST)
    save.elapsedS = (first ?? 0) + 50
    expect(trapRemainS(mine, save.elapsedS)).toBe(0)
    expect(trapTreasureMine(save, mine.id).ok).toBe(true)
    expect(mine.trapUntilS).toBe(save.elapsedS + TREASURE_WARD_S)
    expect(mine.trapUntilS).not.toBe((first ?? 0) + TREASURE_WARD_S)
    expect(save.treasureMines.vault.jewel).toBe(0)
  })

  it('clears both wards on withdraw, capture, and when the hole is replaced', () => {
    const save = keepStationsOpen(createSave())
    const miner = spawnWorker(save)
    const mine = claimFirstEmpty(save, [miner.id])
    save.treasureMines.vault.jewel = TREASURE_FORTIFY_COST + TREASURE_TRAP_COST
    expect(fortifyTreasureMine(save, mine.id).ok).toBe(true)
    expect(trapTreasureMine(save, mine.id).ok).toBe(true)
    expect(abandonTreasureMine(save, mine.id).ok).toBe(true)
    expect(mine.fortifyUntilS).toBeNull()
    expect(mine.trapUntilS).toBeNull()

    expect(claimTreasureMine(save, mine.id, [miner.id]).ok).toBe(true)
    mine.fortifyUntilS = save.elapsedS + TREASURE_WARD_S
    mine.trapUntilS = save.elapsedS + TREASURE_WARD_S
    const id = mine.id
    mine.reserve = 0
    stepOnline(save)
    expect(save.treasureMines.mines.some((row) => row.id === id)).toBe(false)
    expect(save.treasureMines.mines.every((row) => row.fortifyUntilS == null && row.trapUntilS == null)).toBe(true)
  })

  it('leaves scouting and raids on other holes unchanged', () => {
    const save = keepStationsOpen(createSave())
    const miner = spawnWorker(save)
    const raider = spawnWorker(save)
    const mine = claimFirstEmpty(save, [miner.id])
    save.treasureMines.vault.jewel = TREASURE_FORTIFY_COST
    save.treasureMines.vault.sandGold = TREASURE_SCOUT_COST + TREASURE_STAKE_PER_GUARD * 3
    expect(fortifyTreasureMine(save, mine.id).ok).toBe(true)
    const foe = save.treasureMines.mines.find((row) => row.owner === 'shadow' && row.shadows.length > 0)
    expect(foe).toBeTruthy()
    if (!foe) return
    foe.fortifyUntilS = save.elapsedS + TREASURE_WARD_S
    foe.trapUntilS = save.elapsedS + TREASURE_WARD_S
    const hpMax = foe.shadows[0]?.hpMax
    expect(scoutTreasureMine(save, foe.id).ok).toBe(true)
    expect(save.treasureMines.vault.jewel).toBe(0)
    expect(openTreasureRaid(save, foe.id, [raider.id]).ok).toBe(true)
    expect(foe.raid?.fortified).not.toBe(true)
    expect(foe.raid?.atkMax).toBe(raider.hpMax)
    expect(foe.shadows[0]?.hp).toBe(hpMax)
  })

  it('round-trips the warning, fortify, and incoming fight, and old saves do not arrive already under attack', () => {
    const save = keepStationsOpen(createSave())
    const miner = spawnWorker(save)
    const mine = claimFirstEmpty(save, [miner.id])
    mine.assaultChargeS = 42
    Object.assign(mine, { fortified: true })
    mine.fortifyUntilS = null
    mine.assaultWarnAtS = save.elapsedS + 11
    mine.assaultAvatarId = 'helm'
    mine.assaultParty = [
      {
        id: `${mine.id}-assault-0`,
        name: '青石',
        level: 3,
        hp: 18,
        hpMax: 18,
        atk: 5,
        spd: 4,
        runeId: 'runeArmor',
      },
    ]
    const loaded = hydrateLoadedSave(JSON.parse(JSON.stringify(save)))
    const kept = loaded?.treasureMines.mines.find((row) => row.id === mine.id)
    expect(kept?.assaultChargeS).toBe(42)
    expect(kept?.fortifyUntilS).toBe(save.elapsedS + TREASURE_WARD_S)
    expect(kept?.trapUntilS).toBeNull()
    expect(kept && 'fortified' in kept).toBe(false)
    expect(kept?.assaultWarnAtS).toBe(save.elapsedS + 11)
    expect(kept?.assaultAvatarId).toBe('helm')
    expect(kept?.assaultParty.map((shadow) => shadow.name)).toEqual(['青石'])
    expect(treasureAssaultWarning(loaded ?? save)).toBe(true)

    if (!loaded) return
    for (let i = 0; i < 11; i += 1) stepOnline(loaded)
    const fighting = loaded.treasureMines.mines.find((row) => row.id === mine.id)
    expect(fighting?.raid?.incoming).toBe(true)
    expect(fighting?.raid?.fortified).toBe(true)
    const again = hydrateLoadedSave(JSON.parse(JSON.stringify(loaded)))
    const keptFight = again?.treasureMines.mines.find((row) => row.id === mine.id)
    expect(keptFight?.raid?.incoming).toBe(true)
    expect(keptFight?.raid?.queue).toEqual([miner.id])
    expect(keptFight?.fortifyUntilS).toBe(save.elapsedS + TREASURE_WARD_S)
    expect(keptFight?.trapUntilS).toBeNull()

    const legacy = JSON.parse(JSON.stringify(save)) as Save
    const bare = legacy.treasureMines.mines.find((row) => row.id === mine.id)
    expect(bare).toBeTruthy()
    if (!bare) return
    delete (bare as { assaultChargeS?: number }).assaultChargeS
    delete (bare as { assaultWarnAtS?: number }).assaultWarnAtS
    delete (bare as { assaultParty?: unknown }).assaultParty
    delete (bare as { assaultAvatarId?: string }).assaultAvatarId
    delete (bare as { fortified?: boolean }).fortified
    bare.raid = null
    const old = hydrateLoadedSave(legacy)
    const quiet = old?.treasureMines.mines.find((row) => row.id === mine.id)
    expect(quiet?.assaultChargeS).toBe(0)
    expect(quiet?.fortifyUntilS).toBeNull()
    expect(quiet?.trapUntilS).toBeNull()
    expect(quiet?.assaultWarnAtS).toBeNull()
    expect(quiet?.assaultParty).toEqual([])
    if (!old) return
    stepOnline(old)
    expect(old.treasureMines.mines.find((row) => row.id === mine.id)?.raid).toBeNull()
  })
})

function rollsFrom(seed: number, count: number): number[] {
  const state = { roll: seed }
  const out: number[] = []
  for (let i = 0; i < count; i += 1) out.push(nextMineRoll(state))
  return out
}

function seedForCrystalSand(): number {
  for (let seed = 1; seed < 200000; seed += 1) {
    const [crystal, chance, kind] = rollsFrom(seed, 3)
    if (crystal < 0.5 && chance < 0.4 && kind < 0.4) return seed
  }
  throw new Error('没有合适的矿洞骰')
}

function prepareDigger(save = keepStationsOpen(createSave())) {
  const worker = spawnWorker(save)
  worker.level = 1
  worker.combatAttrs = []
  const mine = save.treasureMines.mines[0]
  mine.owner = 'empty'
  mine.shadows = []
  mine.raid = null
  mine.crewIds = []
  mine.weaknesses = ['fire']
  mine.reserve = 40
  expect(claimTreasureMine(save, mine.id, [worker.id]).ok).toBe(true)
  return { save, mine, worker }
}

function yieldOnce(save: Save, mine: TreasureMine, rolls: number[]) {
  mine.digCharge = { [TREASURE_HOLE_DIG]: 0.99 }
  const drops: { item: string; qty: number }[] = []
  save.elapsedS += 1
  stepTreasureMines(save, (drop) => drops.push({ item: drop.item, qty: drop.qty }), {
    offline: true,
    rolls: [...rolls],
  })
  return drops
}

describe('treasure ore veins and bounty', () => {
  it('splits new holes into copper, iron and mithril', () => {
    expect(mineVeinOfRoll(0)).toBe('copper')
    expect(mineVeinOfRoll(0.5 - 1e-12)).toBe('copper')
    expect(mineVeinOfRoll(0.5)).toBe('iron')
    expect(mineVeinOfRoll(0.85 - 1e-12)).toBe('iron')
    expect(mineVeinOfRoll(0.85)).toBe('mithril')
    expect(mineVeinOfRoll(0.999)).toBe('mithril')
    expect(rollOreVaultTreasure(0)).toBe('sandGold')
    expect(rollOreVaultTreasure(0.4 - 1e-12)).toBe('sandGold')
    expect(rollOreVaultTreasure(0.4)).toBe('jewel')
    expect(rollOreVaultTreasure(0.75 - 1e-12)).toBe('jewel')
    expect(rollOreVaultTreasure(0.75)).toBe('jade')
    expect(bountyCrewCount(0)).toBe(2)
    expect(bountyCrewCount(0.5 - 1e-12)).toBe(2)
    expect(bountyCrewCount(0.5)).toBe(3)
    expect(bountyButtonLabel(null)).toBe('悬赏')
    expect(bountyButtonLabel('iron')).toBe('悬赏·铁矿')

    const save = keepStationsOpen(createSave())
    save.treasureMines.mines = []
    refreshTreasureMines(save, [0, 0, 0.5, 0, 0.85, 0, 0.1, 0])
    expect(save.treasureMines.mines.map((mine) => mine.vein)).toEqual(['copper', 'iron', 'mithril', 'copper'])
    expect(save.treasureMines.mines.every((mine) => mine.kind == null && mine.bounty == null && mine.owner === 'empty')).toBe(
      true,
    )
    expect(save.treasureMines.mines.map((mine) => mineKindLabel(mine))).toEqual(['铜矿洞', '铁矿洞', '秘银洞', '铜矿洞'])
  })

  it('pays ore every share, then crystal and vault treasure on the injected rolls', () => {
    const { save, mine } = prepareDigger()
    mine.vein = 'copper'
    mine.kind = null
    mine.bounty = null
    expect(save.knightLevel).toBeLessThan(9)
    const dry = yieldOnce(save, mine, [0.5, 0.4])
    expect(dry).toEqual([{ item: 'ore', qty: 1 }])
    expect(bankQty(save, 'ore')).toBe(1)
    expect(bankQty(save, 'wildCrystal')).toBe(0)
    expect(vaultQty(save)).toBe(0)
    expect(mine.dugOre).toBe(1)
    expect(mine.dugCrystal).toBe(0)
    expect(treasureHaulQty(save, 'ore')).toBe(1)

    const rich = yieldOnce(save, mine, [0, 0.39, 0.74])
    expect(rich).toEqual([
      { item: 'ore', qty: 1 },
      { item: 'wildCrystal', qty: 1 },
      { item: 'jewel', qty: 1 },
    ])
    expect(bankQty(save, 'ore')).toBe(2)
    expect(bankQty(save, 'wildCrystal')).toBe(1)
    expect(save.treasureMines.vault.jewel).toBe(1)
    expect(mine.dugOre).toBe(2)
    expect(mine.dugCrystal).toBe(1)
    expect(treasureDropTip('ironOre', 2)).toBe('获得 铁矿 ×2')
    expect(treasureDropTip('wildCrystal', 1)).toBe('获得 荒晶 ×1')
  })

  it('lets shadows burn reserve without paying anyone', () => {
    const save = keepStationsOpen(createSave())
    const mine = ensureGarrison(save.treasureMines.mines[0])
    mine.vein = 'iron'
    mine.kind = null
    mine.bounty = null
    mine.reserve = 8
    mine.digCharge = { [TREASURE_HOLE_DIG]: 0.99 }
    mine.shadows.forEach((shadow) => {
      shadow.level = 1
    })
    const beforeBank = { ...save.bank }
    const beforeVault = vaultQty(save)
    save.elapsedS += 1
    stepTreasureMines(save, undefined, { offline: true, rolls: [0, 0, 0] })
    expect(mine.reserve).toBe(7)
    expect(save.bank).toEqual(beforeBank)
    expect(vaultQty(save)).toBe(beforeVault)
    expect(mine.dugOre).toBe(0)
    expect(treasureHaulQty(save, 'ironOre')).toBe(0)
  })

  it('spends jewels for one bounty, keeps it through a reload, and refuses a second', () => {
    const save = keepStationsOpen(createSave())
    save.treasureMines.vault.jewel = TREASURE_BOUNTY_COST.copper - 1
    expect(postTreasureBounty(save, 'copper')).toEqual({
      ok: false,
      reason: jewelShortTip(TREASURE_BOUNTY_COST.copper, TREASURE_BOUNTY_COST.copper - 1),
    })
    expect(save.treasureMines.bounty).toBeNull()
    expect(save.treasureMines.vault.jewel).toBe(TREASURE_BOUNTY_COST.copper - 1)

    save.treasureMines.vault.jewel = 200
    expect(postTreasureBounty(save, 'mithril')).toEqual({
      ok: true,
      message: `珠宝 −${TREASURE_BOUNTY_COST.mithril}`,
    })
    expect(save.treasureMines.bounty).toBe('mithril')
    expect(save.treasureMines.vault.jewel).toBe(200 - TREASURE_BOUNTY_COST.mithril)
    expect(postTreasureBounty(save, 'iron')).toEqual({ ok: false, reason: '已有悬赏' })
    expect(save.treasureMines.vault.jewel).toBe(200 - TREASURE_BOUNTY_COST.mithril)

    const loaded = hydrateLoadedSave(JSON.parse(JSON.stringify(save)))
    expect(loaded?.treasureMines.bounty).toBe('mithril')
    expect(loaded?.treasureMines.vault.jewel).toBe(200 - TREASURE_BOUNTY_COST.mithril)

    const broken = JSON.parse(JSON.stringify(save)) as Save
    ;(broken.treasureMines as { bounty: string }).bounty = 'gold'
    const cleared = hydrateLoadedSave(broken)
    expect(cleared?.treasureMines.bounty).toBeNull()
  })

  it('makes the next spawned hole a bounty hole, including a paid refresh', () => {
    const save = keepStationsOpen(createSave())
    save.knightLevel = 4
    save.treasureMines.bannerLevel = 2
    save.treasureMines.bounty = 'mithril'
    const standing = save.treasureMines.mines.map((mine) => mine.id)
    save.treasureMines.mines[0].reserve = 0
    refreshTreasureMines(save, [0, 0.15, 0.25, 0.35])
    const born = save.treasureMines.mines.find((mine) => !standing.includes(mine.id))
    expect(born).toBeTruthy()
    if (!born) return
    expect(save.treasureMines.bounty).toBeNull()
    expect(born.bounty).toBe('mithril')
    expect(born.vein).toBe('mithril')
    expect(born.kind).toBeNull()
    expect(born.shadows).toHaveLength(2)
    expect(born.shadows.every((shadow) => shadow.level === 4 + 2 + TREASURE_BOUNTY_LEVEL_BONUS)).toBe(true)
    expect(born.reserveMax).toBe(Math.round(bannerReserveMax(2) * TREASURE_BOUNTY_RESERVE_MUL))
    expect(born.reserve).toBe(born.reserveMax)
    expect(born.expiresAtS - born.bornAtS).toBe(TREASURE_LIFE_S)
    expect(save.treasureMines.mines.filter((mine) => mine.bounty != null)).toHaveLength(1)
    expect(mineKindLabel(born)).toBe('秘银洞')

    born.owner = 'empty'
    born.shadows = []
    born.raid = null
    const miner = spawnWorker(save)
    miner.level = 1
    miner.combatAttrs = []
    born.weaknesses = ['fire']
    expect(claimTreasureMine(save, born.id, [miner.id]).ok).toBe(true)
    const paid = yieldOnce(save, born, [0.49, 0.39, 0])
    expect(paid).toEqual([
      { item: 'mithrilOre', qty: 2 },
      { item: 'wildCrystal', qty: 1 },
      { item: 'sandGold', qty: 1 },
    ])
    expect(bankQty(save, 'mithrilOre')).toBe(2)
    expect(born.dugOre).toBe(2)
    expect(born.dugCrystal).toBe(1)

    const crystal = keepStationsOpen(createSave())
    crystal.treasureMines.mines = []
    crystal.treasureMines.bounty = 'wildCrystal'
    refreshTreasureMines(crystal, [0.5, 0.1, 0.2, 0.3, 0.4])
    const hole = crystal.treasureMines.mines[0]
    expect(hole.bounty).toBe('wildCrystal')
    expect(hole.vein).toBeNull()
    expect(hole.shadows).toHaveLength(3)
    expect(hole.owner).toBe('shadow')
    expect(mineKindLabel(hole)).toBe('荒晶洞')
    expect(crystal.treasureMines.bounty).toBeNull()
    expect(crystal.treasureMines.mines[1].bounty).toBeNull()
    hole.owner = 'empty'
    hole.shadows = []
    const digger = spawnWorker(crystal)
    digger.level = 1
    digger.combatAttrs = []
    hole.weaknesses = ['fire']
    expect(claimTreasureMine(crystal, hole.id, [digger.id]).ok).toBe(true)
    const extra = yieldOnce(crystal, hole, [0.39, 0.75])
    expect(extra).toEqual([
      { item: 'wildCrystal', qty: 2 },
      { item: 'ore', qty: 1 },
      { item: 'jade', qty: 1 },
    ])
    expect(bankQty(crystal, 'wildCrystal')).toBe(2)
    expect(bankQty(crystal, 'ore')).toBe(1)

    const board = keepStationsOpen(createSave())
    board.diamonds = 30
    board.treasureMines.vault.jewel = TREASURE_BOUNTY_COST.copper
    expect(postTreasureBounty(board, 'copper').ok).toBe(true)
    const owned = board.treasureMines.mines[0]
    const keeper = spawnWorker(board)
    owned.owner = 'player'
    owned.shadows = []
    owned.crewIds = [keeper.id]
    const fighting = board.treasureMines.mines[1]
    setGuards(fighting, 1)
    const raider = spawnWorker(board)
    board.treasureMines.vault.sandGold = 40
    expect(openTreasureRaid(board, fighting.id, [raider.id]).ok).toBe(true)
    const kept = new Set([owned.id, fighting.id])
    expect(refreshTreasureMineBoard(board, 'diamonds', [0, 0.2, 0.3, 0.4]).ok).toBe(true)
    const spawned = board.treasureMines.mines.filter((mine) => !kept.has(mine.id))
    expect(spawned.length).toBeGreaterThan(0)
    expect(spawned[0].bounty).toBe('copper')
    expect(spawned[0].vein).toBe('copper')
    expect(spawned[0].shadows.length).toBeGreaterThanOrEqual(2)
    expect(spawned[0].shadows.length).toBeLessThanOrEqual(3)
    expect(spawned.slice(1).every((mine) => mine.bounty == null)).toBe(true)
    expect(board.treasureMines.bounty).toBeNull()
    expect(board.diamonds).toBe(20)
  })

  it('reads an old hole kind and finishes it on the old drop table', () => {
    const raw = JSON.parse(JSON.stringify(keepStationsOpen(createSave()))) as Save
    const hole = raw.treasureMines.mines[0]
    hole.kind = 'jewel'
    delete (hole as { vein?: unknown }).vein
    delete (hole as { bounty?: unknown }).bounty
    delete (hole as { dugOre?: unknown }).dugOre
    delete (hole as { dugCrystal?: unknown }).dugCrystal
    delete (raw.treasureMines as { bounty?: unknown }).bounty
    delete (raw.treasureMines as { haul?: unknown }).haul
    const loaded = hydrateLoadedSave(JSON.parse(JSON.stringify(raw)))
    expect(loaded).toBeTruthy()
    if (!loaded) return
    const mine = loaded.treasureMines.mines.find((row) => row.id === hole.id)
    expect(mine).toBeTruthy()
    if (!mine) return
    expect(mine.kind).toBe('jewel')
    expect(mine.vein).toBeNull()
    expect(mine.bounty).toBeNull()
    expect(isLegacyTreasureMine(mine)).toBe(true)
    expect(mineKindLabel(mine)).toBe('珠宝洞')
    expect(loaded.treasureMines.bounty).toBeNull()
    expect(loaded.treasureMines.haul).toEqual({})
    expect(mine.dugOre).toBe(0)

    const worker = spawnWorker(loaded)
    worker.level = 1
    worker.combatAttrs = []
    mine.owner = 'empty'
    mine.shadows = []
    mine.raid = null
    mine.weaknesses = ['fire']
    mine.reserve = 3
    expect(claimTreasureMine(loaded, mine.id, [worker.id]).ok).toBe(true)
    const drops = yieldOnce(loaded, mine, [0])
    expect(drops).toEqual([{ item: 'sandGold', qty: 1 }])
    expect(loaded.treasureMines.vault.sandGold).toBe(1)
    expect(bankQty(loaded, 'ore')).toBe(0)
    expect(bankQty(loaded, 'ironOre')).toBe(0)
    expect(bankQty(loaded, 'mithrilOre')).toBe(0)
    expect(bankQty(loaded, 'wildCrystal')).toBe(0)
    expect(mine.reserve).toBe(2)

    mine.reserve = 0
    const before = new Set(loaded.treasureMines.mines.map((row) => row.id))
    refreshTreasureMines(loaded)
    const next = loaded.treasureMines.mines.find((row) => !before.has(row.id))
    expect(next?.kind).toBeNull()
    expect(next?.vein === 'copper' || next?.vein === 'iron' || next?.vein === 'mithril').toBe(true)
    expect(isLegacyTreasureMine(next!)).toBe(false)
  })

  it('writes ore, crystal and vault growth into the offline report', () => {
    const { save, mine } = prepareDigger()
    mine.vein = 'copper'
    mine.kind = null
    mine.bounty = null
    mine.digCharge = {}
    save.treasureMines.roll = seedForCrystalSand()
    const now = Date.now()
    save.lastTick = now - 5_000
    const result = settleOffline(save, now)
    const hole = result.save.treasureMines.mines.find((row) => row.id === mine.id)
    expect(bankQty(result.save, 'ore')).toBe(1)
    expect(bankQty(result.save, 'wildCrystal')).toBe(1)
    expect(result.save.treasureMines.vault.sandGold).toBe(1)
    expect(hole?.dugOre).toBe(1)
    expect(hole?.dugCrystal).toBe(1)
    expect(result.save.knightLevel).toBeLessThan(9)
    const body = result.save.messages.find((message) => message.title === '离线收益')?.body ?? ''
    expect(body).toContain('铜矿 +1')
    expect(body).toContain('荒晶 +1')
    expect(body).toContain('宝库 砂金 +1')
    expect(result.summary.vault).toEqual([{ id: 'sandGold', label: '砂金', delta: 1 }])
    expect(result.summary.bank.some((row) => row.itemId === 'ore' && row.delta === 1)).toBe(true)
    expect(result.summary.bank.some((row) => row.itemId === 'wildCrystal' && row.delta === 1)).toBe(true)
  })
})
