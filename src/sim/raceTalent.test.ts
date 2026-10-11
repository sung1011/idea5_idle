import { describe, expect, it } from 'vitest'
import { keepStationsOpen } from './stationUnlock'
import { beginEnemyCombat, fillWorkerHp, workerCombatStats, workerLiveStats, WORKER_COMBAT_BY_TIER } from './combat'
import { createSave } from './createSave'
import { startBeastFight } from './beastPvp'
import {
  applyBeastFirstHit,
  applyBeastHpMax,
  applyCombatAtk,
  applyHerbCrashTaken,
  applyKillHeal,
  applyMarketPayout,
  applyRaceTalentReduction,
  applyRuneCombatMul,
  applyTreasureMineInterval,
  combatIntervalCut,
  herbStaminaCut,
  herbWeedTimeCut,
  orderPickByTalent,
  RACE_TALENT_BY_RACE,
  RACE_TALENT_MINE_INTERVAL_FLOOR_S,
  RACE_TALENT_QUALITY_SPAN,
  RACE_TALENT_REDUCTION_CAP,
  RACE_TALENT_TIER_MUL,
  raceTalentBonus,
  raceTalentCopy,
  raceTalentOf,
  raceTalentQualityMul,
  raceTalentReduction,
  raceTalentScaledValue,
  workerRaceTalentView,
} from './raceTalent'
import { herbWeedCost, herbWeedSeconds, HERB_PVP_WEED_COST, HERB_PVP_WEED_S, startHerbWeed } from './herbPvp'
import { hydrateWorker, spawnWorkerWith } from './recruit'
import { claimTreasureMine, mineDigIntervalS, mineDigReadout } from './treasureMine'
import type { EnemyEncounter, Worker } from './types'
import { QUALITY_MAX, QUALITY_MIN } from './tables'
import { WORKER_RACE_IDS } from './types'

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
    expect(raceTalentBonus(face('orc', 1), 'beastFirstHit')).toBeCloseTo(0.25)
    expect(raceTalentBonus(face('orc', 5), 'beastFirstHit')).toBeCloseTo(0.25 * (1 + 4 / 9))
    expect(raceTalentBonus(face('orc', 10), 'beastFirstHit')).toBeCloseTo(0.5)
    expect(herbStaminaCut(face('tauren', 1))).toBeCloseTo(0.25)
    expect(herbStaminaCut(face('tauren', 5))).toBeCloseTo(0.25 * (1 + 4 / 9))
    expect(herbStaminaCut(face('tauren', 10))).toBeCloseTo(0.5)
    expect(raceTalentBonus(face('troll', 1), 'treasureExtraOre')).toBeCloseTo(0.15)
    expect(raceTalentBonus(face('troll', 10), 'treasureExtraOre')).toBeCloseTo(0.3)
    expect(applyBeastFirstHit(100, face('orc', 1))).toBe(125)
    expect(applyTreasureMineInterval(5, face('naga', 1))).toBeCloseTo(5 * (1 - 0.18 * 1.5))
    expect(raceTalentScaledValue(0.15, 5, 'rare')).toBeCloseTo(0.15 * (1 + 4 / 9) * RACE_TALENT_TIER_MUL.rare)
    expect(raceTalentScaledValue(0.15, 10, 'epic')).toBeCloseTo(0.3 * RACE_TALENT_TIER_MUL.epic)
  })

  it('减耗时减消耗有上限，不会减到 0', () => {
    expect(raceTalentReduction(0.6, QUALITY_MAX, 'epic')).toBe(RACE_TALENT_REDUCTION_CAP)
    expect(raceTalentScaledValue(0.6, QUALITY_MAX, 'epic')).toBeGreaterThan(RACE_TALENT_REDUCTION_CAP)
    expect(applyRaceTalentReduction(10, 0.8)).toBe(2)
    expect(applyRaceTalentReduction(1, 0.8)).toBe(1)
    expect(applyRaceTalentReduction(HERB_PVP_WEED_COST, herbStaminaCut(face('tauren', 10)))).toBeGreaterThan(0)
    expect(applyTreasureMineInterval(0.2, face('naga', 10))).toBe(RACE_TALENT_MINE_INTERVAL_FLOOR_S)
    expect(RACE_TALENT_TIER_MUL.rare).toBeGreaterThan(RACE_TALENT_TIER_MUL.base)
    expect(RACE_TALENT_TIER_MUL.epic).toBeGreaterThan(RACE_TALENT_TIER_MUL.rare)
  })

  it('每个种族一条独特效果，开局三族不再共用三大类', () => {
    const ids = WORKER_RACE_IDS.map((id) => raceTalentOf(id)?.effectId)
    expect(ids.every((id) => typeof id === 'string')).toBe(true)
    expect(new Set(ids).size).toBe(WORKER_RACE_IDS.length)
    expect(Object.keys(RACE_TALENT_BY_RACE)).toHaveLength(WORKER_RACE_IDS.length)
    expect(herbStaminaCut(face('orc', 1))).toBe(0)
    expect(herbWeedTimeCut(face('tauren', 10))).toBe(0)
    expect(raceTalentBonus(face('tauren', 1), 'beastFirstHit')).toBe(0)
    expect(applyCombatAtk(12, face('orc', 10))).toBe(12)
    expect(applyTreasureMineInterval(5, face('troll', 10))).toBe(5)
    expect(herbWeedCost(false, face('orc', 1))).toBe(HERB_PVP_WEED_COST)
    expect(herbWeedSeconds(false, face('tauren', 1))).toBe(HERB_PVP_WEED_S)
    expect(herbWeedSeconds(false, face('murloc', 1))).toBeLessThan(HERB_PVP_WEED_S)
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

  it('选人按当前玩法相关 effect 优先，不再写死三大类', () => {
    const rows = [
      { id: 'a', race: 'bloodElf' as const },
      { id: 'b', race: 'tauren' as const },
      { id: 'c', race: 'orc' as const },
      { id: 'd', race: 'troll' as const },
      { id: 'e', race: 'naga' as const },
      { id: 'f', race: 'nightborne' as const },
    ]
    expect(orderPickByTalent(rows, 'herb').map((row) => row.id)).toEqual(['b', 'a', 'c', 'd', 'e', 'f'])
    expect(orderPickByTalent(rows, 'beast').map((row) => row.id)).toEqual(['a', 'c', 'b', 'd', 'e', 'f'])
    expect(orderPickByTalent(rows, 'battlefield').map((row) => row.id)).toEqual(['a', 'f', 'b', 'c', 'd', 'e'])
    expect(orderPickByTalent(rows, 'treasure').map((row) => row.id)).toEqual(['d', 'e', 'f', 'a', 'b', 'c'])
    expect(orderPickByTalent(rows, null).map((row) => row.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })

  it('说明文案带当前品质数字', () => {
    const orc = raceTalentOf('orc')!
    const tauren = raceTalentOf('tauren')!
    const troll = raceTalentOf('troll')!
    const dracthyr = raceTalentOf('dracthyr')!
    expect(raceTalentCopy(orc, QUALITY_MIN)).toBe('困兽开战首击伤害 +25%')
    expect(raceTalentCopy(orc, 5)).toBe('困兽开战首击伤害 +36%')
    expect(raceTalentCopy(orc, QUALITY_MAX)).toBe('困兽开战首击伤害 +50%')
    expect(raceTalentCopy(tauren, QUALITY_MIN)).toBe('割草体力消耗 −25%')
    expect(raceTalentCopy(tauren, QUALITY_MAX)).toBe('割草体力消耗 −50%')
    expect(raceTalentCopy(troll, QUALITY_MIN)).toBe('夺宝每挖一下额外 15% 概率多 1 矿')
    expect(raceTalentCopy(dracthyr, QUALITY_MIN)).toBe('战场攻击 +18%，攻击间隔 −12%')
    expect(raceTalentCopy(raceTalentOf('bloodElf')!, QUALITY_MIN)).toBe('战场 / 困兽击杀回 10% 生命')
    expect(raceTalentCopy(raceTalentOf('goblin')!, QUALITY_MIN)).toBe('商场订单结算金钻 +15%')
    expect(raceTalentCopy(raceTalentOf('forsaken')!, QUALITY_MIN)).toBe('工坊在岗掉血 −38%')
    expect(raceTalentCopy(raceTalentOf('pandaren')!, QUALITY_MIN)).toBe('回营吃饭效果 +25%')
    expect(raceTalentCopy(raceTalentOf('nightborne')!, QUALITY_MIN)).toBe('符文战斗效果 +19%')
    expect(raceTalentCopy(raceTalentOf('vulpera')!, QUALITY_MIN)).toBe('割草撞车受伤 −19%')
    expect(raceTalentCopy(raceTalentOf('magharOrc')!, QUALITY_MIN)).toBe('困兽阶段奖励多抽一次概率 +18%')
    expect(raceTalentCopy(raceTalentOf('zandalariTroll')!, QUALITY_MIN)).toBe('夺宝珠宝掉率 +27%')
    expect(raceTalentCopy(raceTalentOf('highmountainTauren')!, QUALITY_MIN)).toBe('割草日结宝库奖励 +22%')
    expect(raceTalentCopy(raceTalentOf('voidElf')!, QUALITY_MIN)).toBe('战场破招窗口 +30%')
    expect(raceTalentCopy(raceTalentOf('earthen')!, QUALITY_MIN)).toBe('工坊一轮产出 +1 概率 +18%')
    expect(raceTalentCopy(raceTalentOf('ogre')!, QUALITY_MIN)).toBe('困兽（作己方）最大生命 +30%')
    expect(raceTalentCopy(raceTalentOf('centaur')!, QUALITY_MIN)).toBe('战场攻击间隔 −18%')
    expect(raceTalentCopy(raceTalentOf('naga')!, QUALITY_MIN)).toBe('夺宝挖矿间隔 −27%')
    expect(raceTalentCopy(raceTalentOf('murloc')!, QUALITY_MIN)).toBe('割草除草耗时 −38%')
    expect(raceTalentCopy(raceTalentOf('kobold')!, QUALITY_MIN)).toBe('夺宝荒晶掉率 +30%')
    expect(workerRaceTalentView(face('bloodElf', 1))?.icon).toBe('💖')
    expect(workerRaceTalentView(face('tauren', 1))?.icon).toBe('🌿')
  })
})

describe('种族天赋接入玩法', () => {
  it('牛头只少花割草体力，不再加快除草；鱼人才缩短除草', () => {
    const save = createSave()
    const tauren = pin(spawnWorkerWith(save, 1), 'tauren', 1)
    const murloc = pin(spawnWorkerWith(save, 1), 'murloc', 1)
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
    murloc.combatAttrs = []
    orc.combatAttrs = []
    const before = save.herbPvp.stamina
    expect(startHerbWeed(save, 0, tauren.id).ok).toBe(true)
    expect(save.herbPvp.stamina).toBe(before - 8)
    expect(plot.durationS).toBe(HERB_PVP_WEED_S)
    plot.workerId = null
    plot.progressS = 0
    save.herbPvp.stamina = before
    expect(startHerbWeed(save, 0, murloc.id).ok).toBe(true)
    expect(save.herbPvp.stamina).toBe(before - HERB_PVP_WEED_COST)
    expect(plot.durationS).toBe(applyRaceTalentReduction(HERB_PVP_WEED_S, herbWeedTimeCut(murloc)))
    plot.workerId = null
    plot.progressS = 0
    save.herbPvp.stamina = before
    expect(startHerbWeed(save, 0, orc.id).ok).toBe(true)
    expect(save.herbPvp.stamina).toBe(before - HERB_PVP_WEED_COST)
    expect(plot.durationS).toBe(HERB_PVP_WEED_S)
  })

  it('兽人不再提高战场或困兽普通攻击，龙希尔才加战场攻击', () => {
    const save = keepStationsOpen(createSave())
    const orc = pin(spawnWorkerWith(save, 10), 'orc', 10)
    const dracthyr = pin(spawnWorkerWith(save, 10), 'dracthyr', 10)
    const troll = pin(spawnWorkerWith(save, 10), 'troll', 10)
    const base = workerLiveStats(orc, save).atk
    expect(base).toBe(WORKER_COMBAT_BY_TIER[10].atk)
    const combat = beginEnemyCombat(testEnemy(), [orc, dracthyr, troll], 1_000)
    expect(combat.workers[0].atk).toBe(base)
    expect(combat.workers[1].atk).toBe(applyCombatAtk(workerLiveStats(dracthyr, save).atk, dracthyr))
    expect(combat.workers[1].atk).toBeGreaterThan(workerLiveStats(dracthyr, save).atk)
    expect(combat.workers[1].spd).toBeLessThan(workerLiveStats(dracthyr, save).spd)
    expect(combat.workers[2].atk).toBe(workerLiveStats(troll, save).atk)
    expect(startBeastFight(save, [orc.id, troll.id]).ok).toBe(true)
    expect(save.beastPvp.fight?.workers[0].atk).toBe(base)
    expect(save.beastPvp.fight?.workers[0].firstHitPending).toBe(true)
    expect(save.beastPvp.fight?.workers[1].atk).toBe(workerLiveStats(troll, save).atk)
    expect(applyBeastFirstHit(100, orc)).toBeGreaterThan(100)
  })

  it('纳迦夺宝挖矿更快，巨魔不再缩短间隔', () => {
    const save = keepStationsOpen(createSave())
    const naga = pin(spawnWorkerWith(save, 1), 'naga', 1)
    const troll = pin(spawnWorkerWith(save, 1), 'troll', 1)
    naga.level = 1
    naga.combatAttrs = []
    troll.level = 1
    troll.combatAttrs = []
    const hole = save.treasureMines.mines[0]
    hole.owner = 'empty'
    hole.shadows = []
    hole.raid = null
    expect(claimTreasureMine(save, hole.id, [naga.id]).ok).toBe(true)
    const nagaRead = mineDigReadout(save, hole)
    expect(nagaRead?.intervalS).toBeCloseTo(applyTreasureMineInterval(mineDigIntervalS(1), naga))
    expect(nagaRead?.intervalS).toBeLessThan(mineDigIntervalS(1))
    const other = save.treasureMines.mines[1]
    other.owner = 'empty'
    other.shadows = []
    other.raid = null
    expect(claimTreasureMine(save, other.id, [troll.id]).ok).toBe(true)
    expect(mineDigReadout(save, other)?.intervalS).toBe(mineDigIntervalS(1))
  })

  it('稀有档和史诗档乘在品质之上', () => {
    expect(raceTalentBonus(face('goblin', 1), 'marketPayout')).toBeCloseTo(0.12 * 1.25)
    expect(raceTalentBonus(face('naga', 1), 'treasureInterval')).toBeCloseTo(0.18 * 1.5)
    expect(combatIntervalCut(face('dracthyr', 1))).toBeCloseTo(0.08 * 1.5)
    expect(combatIntervalCut(face('centaur', 1))).toBeCloseTo(0.12 * 1.5)
  })

  it('其余种族接到对应玩法口', () => {
    expect(applyHerbCrashTaken(100, face('vulpera', 1))).toBe(81)
    expect(applyHerbCrashTaken(100, face('tauren', 1))).toBe(100)
    expect(applyKillHeal(50, 100, face('bloodElf', 1))).toBe(60)
    expect(applyBeastHpMax(100, face('ogre', 1))).toBe(130)
    expect(applyMarketPayout({ gold: 100, diamonds: 10 }, { workers: [pin(spawnWorkerWith(createSave(), 1), 'goblin', 1)] })).toEqual({
      gold: 115,
      diamonds: 12,
    })
    expect(applyRuneCombatMul(1.25, 1, face('nightborne', 1))).toBeCloseTo(1 + 0.25 * (1 + 0.15 * 1.25))
    expect(applyRuneCombatMul(1, 1, face('nightborne', 1))).toBe(1)
  })
})
