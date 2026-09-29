import { describe, expect, it } from 'vitest'
import { addToBank } from './bank'
import { createSave } from './createSave'
import { claimLoot, pawnMerchant } from './encounters'
import { claimGuideQuest } from './guideQuest'
import { stepHerbPvp } from './herbPvp'
import { stepBeastPvp } from './beastPvp'
import {
  computeKnightLevel,
  grantKnightXp,
  hydrateKnightXp,
  knightXpForRank,
  knightXpToReachLevel,
  KNIGHT_XP_BEAST_CORE,
  KNIGHT_XP_CHAPTER_BOSS_EXTRA,
  KNIGHT_XP_CHEST,
  KNIGHT_XP_CHEST_GOLD,
  KNIGHT_XP_CHEST_SILVER,
  KNIGHT_XP_ENEMY,
  KNIGHT_XP_GUIDE_STEP,
  KNIGHT_XP_MARKET,
  KNIGHT_XP_MARKET_TIMED,
  KNIGHT_XP_STATION_LEVEL,
  KNIGHT_XP_TO_NEXT,
  normalizeKnightLevel,
  takeKnightXpFloats,
  xpToNextKnightLevel,
} from './knightLevel'
import { nextModuleUnlock } from './moduleUnlock'
import { breakthroughStation } from './beastCraft'
import { claimDungeonChest, startDungeonCombat } from './dungeon'
import { DUNGEON_JAILER_ID, DUNGEON_NEEDS } from './dungeonTables'
import { spawnWorker } from './recruit'
import { grantStationLevel, grantStationXp } from './stationProgress'
import { START_TECH_POINTS, xpToNextLevel } from './tables'
import { stepTreasureMines, treasureDayRank, TREASURE_DAY_BOARD } from './treasureMine'
import { hydrateTechFields } from './tech'
import { TIMED_ORDER_DURATION_S } from './marketTimed'
import type { EnemyEncounter, PawnEncounter, Save } from './types'

function wonEnemy(overrides: Partial<EnemyEncounter> = {}): EnemyEncounter {
  return {
    kind: 'enemy',
    id: 'xp-enemy',
    label: '试敌',
    quality: 'green',
    needs: {},
    lootGold: 6,
    departed: false,
    lootClaimed: false,
    enemyRank: 'minion',
    weaknesses: ['sword'],
    revealedWeaknesses: [],
    chapterBoss: false,
    combat: {
      startedAt: 0,
      timeoutAt: 120_000,
      workerIds: [],
      workers: [],
      enemy: { id: 'e', label: '试敌', hp: 0, hpMax: 10, atk: 1, spd: 5, nextActAt: 1 },
      logs: [],
      outcome: 'win',
    },
    ...overrides,
  }
}

describe('knight xp curve', () => {
  it('keeps 1–9 cheap and 10–19 strictly more expensive', () => {
    expect(knightXpToReachLevel(10)).toBe(690)
    expect(knightXpToReachLevel(20)).toBe(3410)
    for (let level = 1; level < KNIGHT_XP_TO_NEXT.length; level += 1) {
      expect(xpToNextKnightLevel(level + 1)).toBeGreaterThan(xpToNextKnightLevel(level))
    }
    expect(xpToNextKnightLevel(9)).toBeLessThan(xpToNextKnightLevel(10))
    expect(xpToNextKnightLevel(20)).toBeGreaterThan(xpToNextKnightLevel(19))
    const early = knightXpToReachLevel(10)
    const late = knightXpToReachLevel(20) - early
    expect(late).toBeGreaterThan(early * 3)
  })

  it('maps rank 1 to 80 and the last place to 20', () => {
    expect(knightXpForRank(1, 50)).toBe(80)
    expect(knightXpForRank(50, 50)).toBe(20)
    expect(knightXpForRank(1, 20)).toBe(80)
    expect(knightXpForRank(20, 20)).toBe(20)
    expect(knightXpForRank(1, TREASURE_DAY_BOARD)).toBe(80)
    expect(knightXpForRank(TREASURE_DAY_BOARD, TREASURE_DAY_BOARD)).toBe(20)
    expect(knightXpForRank(2, 50)).toBeLessThan(knightXpForRank(1, 50))
  })

  it('names the next unlock at the coming threshold', () => {
    expect(nextModuleUnlock(1)?.label).toBe('酋长 6 级开放狩猎、集市')
    expect(nextModuleUnlock(7)?.label).toBe('酋长 8 级开放烹饪、营地伙食、地牢')
    expect(nextModuleUnlock(10)?.label).toBe('酋长 11 级开放科技')
    expect(nextModuleUnlock(20)).toBeNull()
  })
})

describe('knight xp sources', () => {
  it('starts a new save at level 1 with 0 xp and does not follow station levels', () => {
    const save = createSave()
    expect(save.knightLevel).toBe(1)
    expect(save.knightXp).toBe(0)
    expect(save.techPoints).toBe(START_TECH_POINTS)
    expect(computeKnightLevel(save)).toBe(1)
    expect(normalizeKnightLevel(2.8)).toBe(2)
  })

  it('gives 30 xp per station level and 1 inspiration only when the chief levels', () => {
    const save = createSave()
    takeKnightXpFloats()
    grantStationXp(save, 'mining', xpToNextLevel(1))
    expect(save.stations.mining.stationLevel).toBe(2)
    expect(save.knightLevel).toBe(1)
    expect(save.knightXp).toBe(KNIGHT_XP_STATION_LEVEL)
    expect(save.techPoints).toBe(START_TECH_POINTS)
    expect(save.messages.some((row) => row.title === '酋长升级')).toBe(false)
    expect(takeKnightXpFloats()).toEqual([KNIGHT_XP_STATION_LEVEL])

    grantKnightXp(save, xpToNextKnightLevel(1) - save.knightXp)
    expect(save.knightLevel).toBe(2)
    expect(save.knightXp).toBe(0)
    expect(save.techPoints).toBe(START_TECH_POINTS + 1)
    expect(save.messages[0]?.title).toBe('酋长升级')
  })

  it('pays 20 gold and 20 chief xp for a kept starter guide step', () => {
    const save = createSave()
    expect(claimGuideQuest(save).ok).toBe(false)
    expect(save.knightXp).toBe(0)
    spawnWorker(save)
    spawnWorker(save)
    expect(claimGuideQuest(save).ok).toBe(true)
    expect(save.knightXp).toBe(KNIGHT_XP_GUIDE_STEP)
  })

  it('pays 5 for a battlefield win and an extra 60 for a chapter boss', () => {
    const save = createSave()
    save.encounters[0] = wonEnemy()
    expect(claimLoot(save, 0).ok).toBe(true)
    expect(save.knightXp).toBe(KNIGHT_XP_ENEMY)
    expect(save.starterCopperPawnDone).toBe(false)

    const boss = createSave()
    boss.encounters[0] = wonEnemy({ id: 'boss', chapterBoss: true, enemyRank: 'boss' })
    expect(claimLoot(boss, 0).ok).toBe(true)
    expect(boss.knightLevel).toBe(2)
    expect(boss.knightXp).toBe(KNIGHT_XP_ENEMY + KNIGHT_XP_CHAPTER_BOSS_EXTRA - xpToNextKnightLevel(1))
  })

  it('pays 10 for a market order and 20 for a timed one', () => {
    const now = 8_000
    const plain: PawnEncounter = {
      kind: 'pawn',
      id: 'plain-pawn',
      label: '当铺',
      quality: 'green',
      pawnWants: { ore: 1 },
      rewardGold: 10,
      completed: false,
    }
    const save = createSave()
    save.marketEncounters = [plain]
    addToBank(save, 'ore', 1)
    expect(pawnMerchant(save, 0, now).ok).toBe(true)
    expect(save.knightXp).toBe(KNIGHT_XP_MARKET)

    const timed = createSave()
    timed.marketEncounters = [
      {
        ...plain,
        id: 'timed-pawn',
        completed: false,
        timedUntil: now + TIMED_ORDER_DURATION_S.long * 1000,
      },
    ]
    addToBank(timed, 'ore', 1)
    const timedResult = pawnMerchant(timed, 0, now)
    expect(timedResult).toMatchObject({ ok: true })
    expect(timed.knightXp).toBe(KNIGHT_XP_MARKET_TIMED)
  })

  it('pays 15 for a copper chest, plus 5 silver and 10 gold', () => {
    const copper = openChest('copper')
    expect(copper.knightXp).toBe(KNIGHT_XP_CHEST)
    const silver = openChest('silver')
    expect(silver.knightXp).toBe(KNIGHT_XP_CHEST + KNIGHT_XP_CHEST_SILVER)
    const gold = openChest('gold')
    expect(gold.knightXp).toBe(KNIGHT_XP_CHEST + KNIGHT_XP_CHEST_GOLD)
  })

  it('pays rank xp at midnight only when the player took part', () => {
    const idle = createSave()
    idle.herbPvp.dayKey = '2026-09-28'
    idle.herbPvp.playerScore = 0
    stepHerbPvp(idle, Date.parse('2026-09-28T16:00:00.000Z'))
    expect(idle.knightXp).toBe(0)

    const herb = createSave()
    herb.herbPvp.dayKey = '2026-09-28'
    herb.herbPvp.playerScore = 5
    for (const rival of herb.herbPvp.rivals) rival.score = 0
    stepHerbPvp(herb, Date.parse('2026-09-28T16:00:00.000Z'))
    expect(herb.knightLevel).toBe(2)
    expect(herb.knightXp).toBe(80 - xpToNextKnightLevel(1))

    const quiet = createSave()
    quiet.beastPvp.dayKey = '2026-09-27'
    quiet.beastPvp.playerDamage = 0
    stepBeastPvp(quiet, Date.parse('2026-09-27T16:00:00.000Z'))
    expect(quiet.knightXp).toBe(0)

    const beast = createSave()
    beast.beastPvp.dayKey = '2026-09-27'
    beast.beastPvp.playerDamage = 9
    for (const rival of beast.beastPvp.rivals) rival.damage = 0
    stepBeastPvp(beast, Date.parse('2026-09-27T16:00:00.000Z'))
    expect(beast.knightLevel).toBeGreaterThan(1)

    const missed = createSave()
    missed.treasureMines.dayKey = '2026-09-28'
    missed.treasureMines.dayHaul = 0
    stepTreasureMines(missed, undefined, { now: Date.parse('2026-09-28T16:00:00.000Z') })
    expect(missed.knightXp).toBe(0)

    const treasure = createSave()
    treasure.treasureMines.dayKey = '2026-09-28'
    treasure.treasureMines.dayHaul = 200
    expect(treasureDayRank(200)).toBe(1)
    stepTreasureMines(treasure, undefined, { now: Date.parse('2026-09-28T16:00:00.000Z') })
    expect(treasure.knightXp).toBe(80 - xpToNextKnightLevel(1))
    expect(treasure.knightLevel).toBe(2)
    expect(treasure.treasureMines.dayHaul).toBe(0)
  })

  it('adds 50 on top of the station level from a beast core', () => {
    const save = createSave()
    save.bank.beastCore = 1
    const before = save.stations.herbalism.stationLevel
    expect(breakthroughStation(save, 'herbalism').ok).toBe(true)
    expect(save.stations.herbalism.stationLevel).toBe(before + 1)
    expect(save.knightLevel).toBe(2)
    expect(save.knightXp).toBe(KNIGHT_XP_STATION_LEVEL + KNIGHT_XP_BEAST_CORE - xpToNextKnightLevel(1))
    expect(save.techPoints).toBe(START_TECH_POINTS + 1)
    grantStationLevel(save, 'mining')
    expect(save.knightLevel).toBe(3)
    expect(save.techPoints).toBe(START_TECH_POINTS + 2)
  })
})

describe('hydrate knight xp', () => {
  it('keeps a recorded level, starts xp at 0, and does not grant inspiration again', () => {
    const save = createSave()
    save.stations.mining.stationLevel = 3
    save.knightLevel = 1
    save.techPoints = 5
    delete (save as { knightXp?: number }).knightXp
    hydrateTechFields(save)
    expect(save.knightLevel).toBe(1)
    expect(save.knightXp).toBe(0)
    expect(save.techPoints).toBe(5)
  })

  it('does not drop a higher snapshot when stations are lower', () => {
    const save = createSave()
    save.knightLevel = 8
    delete (save as { knightXp?: number }).knightXp
    hydrateKnightXp(save)
    expect(save.knightLevel).toBe(8)
    expect(save.knightXp).toBe(0)
    expect(save.techPoints).toBe(START_TECH_POINTS)
  })

  it('uses the old station sum once when both level and xp are missing', () => {
    const save = createSave()
    delete (save as { knightLevel?: number }).knightLevel
    delete (save as { knightXp?: number }).knightXp
    save.stations.mining.stationLevel = 5
    save.stations.hunting.stationLevel = 2
    save.techPoints = 9
    hydrateTechFields(save as Save)
    expect(save.knightLevel).toBe(6)
    expect(save.knightXp).toBe(0)
    expect(save.techPoints).toBe(9)
  })

  it('does not reset an old save inspiration when the level field is missing', () => {
    const save = createSave()
    delete (save as { knightLevel?: number }).knightLevel
    delete (save as { knightXp?: number }).knightXp
    save.techPoints = 9
    hydrateTechFields(save as Save)
    expect(save.knightLevel).toBe(1)
    expect(save.knightXp).toBe(0)
    expect(save.techPoints).toBe(9)
  })
})

function openChest(tier: 'copper' | 'silver' | 'gold'): Save {
  const save = createSave()
  for (const [itemId, qty] of Object.entries(DUNGEON_NEEDS)) {
    if (qty) addToBank(save, itemId as keyof typeof DUNGEON_NEEDS, qty)
  }
  const worker = spawnWorker(save)
  worker.hp = worker.hpMax
  worker.fatigueDebt = 0
  startDungeonCombat(save, DUNGEON_JAILER_ID, [worker.id], 8_000)
  const enc = save.dungeon.encounters[0]
  if (enc?.kind !== 'enemy' || !enc.combat) throw new Error('no dungeon fight')
  enc.lootClaimed = false
  if (tier === 'copper') {
    enc.combat.outcome = 'lose'
    enc.dungeonPhaseReached = 1
  } else if (tier === 'silver') {
    enc.combat.outcome = 'lose'
    enc.dungeonPhaseReached = 2
  } else {
    enc.combat.outcome = 'win'
    enc.dungeonPhaseReached = 3
  }
  expect(claimDungeonChest(save, DUNGEON_JAILER_ID).ok).toBe(true)
  return save
}
