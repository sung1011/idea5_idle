import { describe, expect, it } from 'vitest'
import { keepStationsOpen } from './stationUnlock'
import { beginEnemyCombat, fillWorkerHp, workerCombatStats, workerLiveStats, WORKER_COMBAT_BY_TIER } from './combat'
import { createSave } from './createSave'
import { startBeastFight } from './beastPvp'
import {
  applyHuntAtk,
  applyRaceTalentReduction,
  applyTreasureMineInterval,
  herbTalentReduction,
  huntAtkBonus,
  orderPickByTalent,
  raceTalentCopy,
  raceTalentOf,
  raceTalentQualityMul,
  raceTalentReduction,
  raceTalentScaledValue,
  RACE_TALENT_MINE_INTERVAL_FLOOR_S,
  RACE_TALENT_QUALITY_SPAN,
  RACE_TALENT_REDUCTION_CAP,
  RACE_TALENT_TIER_MUL,
  treasureMineSpeedBonus,
  workerRaceTalentView,
} from './raceTalent'
import { herbWeedCost, herbWeedSeconds, HERB_PVP_WEED_COST, HERB_PVP_WEED_S, startHerbWeed } from './herbPvp'
import { hydrateWorker, spawnWorkerWith } from './recruit'
import { claimTreasureMine, mineDigIntervalS, mineDigReadout } from './treasureMine'
import type { EnemyEncounter, Worker } from './types'
import { QUALITY_MAX, QUALITY_MIN } from './tables'

function face(race: Worker['race'], qualityTier: Worker['qualityTier']): Pick<Worker, 'race' | 'qualityTier'> {
  return { race, qualityTier }
}

function pin(worker: Worker, race: Worker['race'], qualityTier: Worker['qualityTier'] = worker.qualityTier) {
  worker.race = race
  worker.qualityTier = qualityTier
  fillWorkerHp(worker)
  return worker
}

function testEnemy(overrides: Partial<EnemyEncounter> = {}): EnemyEncounter {
  return {
    kind: 'enemy',
    id: 'talent-enemy',
    label: '试敌',
    quality: 'green',
    needs: { meal: 1 },
    lootGold: 8,
    departed: false,
    combat: null,
    lootClaimed: false,
    enemyRank: 'minion',
    weaknesses: ['fire'],
    revealedWeaknesses: ['fire'],
    ...overrides,
  }
}

describe('种族天赋数值', () => {
  it('白档是基准，中间线性，彩档大约是白色的 2 倍', () => {
    expect(RACE_TALENT_QUALITY_SPAN).toBe(1)
    expect(raceTalentQualityMul(1)).toBe(1)
    expect(raceTalentQualityMul(10)).toBe(2)
    expect(raceTalentQualityMul(5)).toBeCloseTo(1 + 4 / 9)
    expect(huntAtkBonus(face('orc', 1))).toBeCloseTo(0.15)
    expect(huntAtkBonus(face('orc', 5))).toBeCloseTo(0.15 * (1 + 4 / 9))
    expect(huntAtkBonus(face('orc', 10))).toBeCloseTo(0.3)
    expect(herbTalentReduction(face('tauren', 1))).toBeCloseTo(0.2)
    expect(herbTalentReduction(face('tauren', 5))).toBeCloseTo(0.2 * (1 + 4 / 9))
    expect(herbTalentReduction(face('tauren', 10))).toBeCloseTo(0.4)
    expect(treasureMineSpeedBonus(face('troll', 1))).toBeCloseTo(0.2)
    expect(treasureMineSpeedBonus(face('troll', 5))).toBeCloseTo(0.2 * (1 + 4 / 9))
    expect(treasureMineSpeedBonus(face('troll', 10))).toBeCloseTo(0.4)
    expect(applyHuntAtk(100, face('orc', 1))).toBe(115)
    expect(applyHuntAtk(100, face('orc', 5))).toBe(122)
    expect(applyHuntAtk(100, face('orc', 10))).toBe(130)
    expect(applyTreasureMineInterval(5, face('troll', 1))).toBeCloseTo(5 / 1.2)
    expect(applyTreasureMineInterval(5, face('troll', 10))).toBeCloseTo(5 / 1.4)
    expect(raceTalentScaledValue(0.15, 5, 'rare')).toBeCloseTo(0.15 * (1 + 4 / 9) * RACE_TALENT_TIER_MUL.rare)
    expect(raceTalentScaledValue(0.15, 10, 'epic')).toBeCloseTo(0.3 * RACE_TALENT_TIER_MUL.epic)
  })

  it('减耗时减消耗有上限，不会减到 0', () => {
    expect(raceTalentReduction(0.6, QUALITY_MAX, 'epic')).toBe(RACE_TALENT_REDUCTION_CAP)
    expect(raceTalentScaledValue(0.6, QUALITY_MAX, 'epic')).toBeGreaterThan(RACE_TALENT_REDUCTION_CAP)
    expect(applyRaceTalentReduction(10, 0.8)).toBe(2)
    expect(applyRaceTalentReduction(1, 0.8)).toBe(1)
    expect(applyRaceTalentReduction(HERB_PVP_WEED_COST, herbTalentReduction(face('tauren', 10)))).toBeGreaterThan(0)
    expect(applyTreasureMineInterval(0.2, face('troll', 10))).toBe(RACE_TALENT_MINE_INTERVAL_FLOOR_S)
    expect(RACE_TALENT_TIER_MUL.rare).toBeGreaterThan(RACE_TALENT_TIER_MUL.base)
    expect(RACE_TALENT_TIER_MUL.epic).toBeGreaterThan(RACE_TALENT_TIER_MUL.rare)
  })

  it('天赋只在对应玩法生效', () => {
    expect(herbTalentReduction(face('orc', 1))).toBe(0)
    expect(herbTalentReduction(face('troll', 1))).toBe(0)
    expect(huntAtkBonus(face('tauren', 1))).toBe(0)
    expect(huntAtkBonus(face('troll', 1))).toBe(0)
    expect(treasureMineSpeedBonus(face('orc', 1))).toBe(0)
    expect(treasureMineSpeedBonus(face('tauren', 1))).toBe(0)
    expect(applyHuntAtk(12, face('tauren', 10))).toBe(12)
    expect(applyTreasureMineInterval(5, face('orc', 10))).toBe(5)
    expect(herbWeedCost(false, face('orc', 1))).toBe(HERB_PVP_WEED_COST)
    expect(herbWeedSeconds(false, face('troll', 1))).toBe(HERB_PVP_WEED_S)
  })

  it('职业不再改战斗三围，旧档带 classId 能读', () => {
    expect(workerCombatStats(1, 'laborer')).toEqual(WORKER_COMBAT_BY_TIER[1])
    expect(workerCombatStats(1, 'laborer')).toEqual(workerCombatStats(1, 'knight'))
    expect(workerCombatStats(10, 'knight')).toEqual(WORKER_COMBAT_BY_TIER[10])
    const kept = hydrateWorker({ id: 'w-old', qualityTier: 1, classId: 'laborer' })
    expect(kept.classId).toBe('laborer')
    expect(kept.hpMax).toBe(WORKER_COMBAT_BY_TIER[1].hp)
    expect(hydrateWorker({ id: 'w-x', classId: 'not-a-job' }).classId).toBeUndefined()
  })

  it('选人对口天赋排前面', () => {
    const rows = [
      { id: 'a', race: 'bloodElf' as const },
      { id: 'b', race: 'tauren' as const },
      { id: 'c', race: 'orc' as const },
      { id: 'd', race: 'troll' as const },
    ]
    expect(orderPickByTalent(rows, 'herb').map((row) => row.id)).toEqual(['b', 'a', 'c', 'd'])
    expect(orderPickByTalent(rows, 'hunt').map((row) => row.id)).toEqual(['c', 'a', 'b', 'd'])
    expect(orderPickByTalent(rows, 'treasure').map((row) => row.id)).toEqual(['d', 'a', 'b', 'c'])
    expect(orderPickByTalent(rows, null).map((row) => row.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('说明文案带当前品质数字', () => {
    const orc = raceTalentOf('orc')!
    const tauren = raceTalentOf('tauren')!
    const troll = raceTalentOf('troll')!
    expect(raceTalentCopy(orc, QUALITY_MIN)).toBe('困兽和战场攻击 +15%')
    expect(raceTalentCopy(orc, 5)).toBe('困兽和战场攻击 +22%')
    expect(raceTalentCopy(orc, QUALITY_MAX)).toBe('困兽和战场攻击 +30%')
    expect(raceTalentCopy(tauren, QUALITY_MIN)).toBe('割草体力消耗 −20%，除草耗时 −20%')
    expect(raceTalentCopy(tauren, QUALITY_MAX)).toBe('割草体力消耗 −40%，除草耗时 −40%')
    expect(raceTalentCopy(troll, QUALITY_MIN)).toBe('夺宝开采速度 +20%')
    expect(workerRaceTalentView(face('bloodElf', 1))).toBeNull()
    expect(workerRaceTalentView(face('tauren', 1))?.icon).toBe('🌿')
  })
})

describe('种族天赋接入玩法', () => {
  it('牛头割草少花体力、除草更快，兽人不变', () => {
    const save = createSave()
    const tauren = pin(spawnWorkerWith(save, 1), 'tauren', 1)
    const orc = pin(spawnWorkerWith(save, 1), 'orc', 1)
    for (const plot of save.herbPvp.plots) {
      plot.weeder = null
      plot.workerId = null
      plot.progressS = 0
    }
    const plot = save.herbPvp.plots[0]!
    plot.cleared = false
    plot.weakness = 'sword'
    tauren.combatAttrs = []
    orc.combatAttrs = []
    const before = save.herbPvp.stamina
    expect(startHerbWeed(save, 0, tauren.id).ok).toBe(true)
    expect(save.herbPvp.stamina).toBe(before - 8)
    expect(plot.durationS).toBe(144)
    plot.workerId = null
    plot.progressS = 0
    save.herbPvp.stamina = before
    expect(startHerbWeed(save, 0, orc.id).ok).toBe(true)
    expect(save.herbPvp.stamina).toBe(before - HERB_PVP_WEED_COST)
    expect(plot.durationS).toBe(HERB_PVP_WEED_S)
  })

  it('兽人困兽和战场攻击提高，巨魔不提高', () => {
    const save = keepStationsOpen(createSave())
    const orc = pin(spawnWorkerWith(save, 10), 'orc', 10)
    const troll = pin(spawnWorkerWith(save, 10), 'troll', 10)
    const base = workerLiveStats(orc, save).atk
    expect(base).toBe(WORKER_COMBAT_BY_TIER[10].atk)
    const combat = beginEnemyCombat(testEnemy(), [orc, troll], 1_000)
    expect(combat.workers[0].atk).toBe(applyHuntAtk(base, orc))
    expect(combat.workers[0].atk).toBeGreaterThan(base)
    expect(combat.workers[1].atk).toBe(workerLiveStats(troll, save).atk)
    expect(startBeastFight(save, [orc.id, troll.id]).ok).toBe(true)
    expect(save.beastPvp.fight?.workers[0].atk).toBe(applyHuntAtk(base, orc))
    expect(save.beastPvp.fight?.workers[1].atk).toBe(workerLiveStats(troll, save).atk)
  })

  it('巨魔夺宝开采更快，牛头不变', () => {
    const save = keepStationsOpen(createSave())
    const troll = pin(spawnWorkerWith(save, 1), 'troll', 1)
    const tauren = pin(spawnWorkerWith(save, 1), 'tauren', 1)
    troll.level = 1
    troll.combatAttrs = []
    tauren.level = 1
    tauren.combatAttrs = []
    const hole = save.treasureMines.mines[0]
    hole.owner = 'empty'
    hole.shadows = []
    hole.raid = null
    expect(claimTreasureMine(save, hole.id, [troll.id]).ok).toBe(true)
    const trollRead = mineDigReadout(save, hole)
    expect(trollRead?.intervalS).toBeCloseTo(applyTreasureMineInterval(mineDigIntervalS(1), troll))
    expect(trollRead?.intervalS).toBeLessThan(mineDigIntervalS(1))
    const other = save.treasureMines.mines[1]
    other.owner = 'empty'
    other.shadows = []
    other.raid = null
    expect(claimTreasureMine(save, other.id, [tauren.id]).ok).toBe(true)
    expect(mineDigReadout(save, other)?.intervalS).toBe(mineDigIntervalS(1))
  })
})
