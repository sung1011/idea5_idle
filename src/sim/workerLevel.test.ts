import { afterEach, describe, expect, it } from 'vitest'
import { assignWorker } from './assign'
import {
  applyWorkerLevelHpRatio,
  grantWorkerCombatXp,
  workerCombatStats,
  workerLiveStats,
} from './combat'
import { createSave } from './createSave'
import { claimLoot, startCombat } from './encounters'
import { fuseWorkers } from './fuse'
import { setRollOverride } from './rng'
import { hydrateWorker, spawnWorker, spawnWorkerWith } from './recruit'
import { selectedCategoryDef } from './stationProgress'
import { completeCycle } from './stations'
import { softFailXp } from './inscription'
import type { EnemyEncounter, Save } from './types'
import {
  addWorkerXp,
  hydrateWorkerLevel,
  hydrateWorkerXp,
  normalizeWorkerProgress,
  workerFromTotalXp,
  workerLevelUpTip,
  workerLootXp,
  workerStationCycleXp,
  workerTotalXp,
  workerXpToNext,
  WORKER_LEVEL_ATK_PER,
  WORKER_LEVEL_HP_PER,
  WORKER_LEVEL_MIN,
  WORKER_LEVEL_SPD_FLOOR,
  WORKER_LEVEL_SPD_MUL,
  WORKER_LOOT_XP_BY_RANK,
  WORKER_LOOT_XP_PER_CHAPTER,
  WORKER_STATION_XP_SHARE,
  WORKER_XP_TO_NEXT_BASE,
  WORKER_XP_TO_NEXT_GROWTH,
} from './workerLevel'

function testEnemy(overrides: Partial<EnemyEncounter> = {}): EnemyEncounter {
  return {
    kind: 'enemy',
    id: 'xp-enemy',
    label: '试敌',
    quality: 'green',
    needs: { meal: 1 },
    lootGold: 8,
    departed: false,
    combat: null,
    lootClaimed: false,
    enemyRank: 'minion',
    weaknesses: ['fire', 'sword'],
    revealedWeaknesses: [],
    ...overrides,
  }
}

function putEnemy(save: Save, enc: EnemyEncounter) {
  save.encounters[0] = enc
}

function winSnap(workerId: string, rank: EnemyEncounter['enemyRank'] = 'minion'): EnemyEncounter {
  return testEnemy({
    departed: true,
    enemyRank: rank,
    combat: {
      startedAt: 0,
      timeoutAt: 120_000,
      workerIds: [workerId],
      workers: [{ id: workerId, label: '甲', hp: 10, hpMax: 24, atk: 4, spd: 5, nextActAt: 5_000 }],
      enemy: { id: 'enemy', label: '试敌', hp: 0, hpMax: 18, atk: 3, spd: 5, nextActAt: 5_000 },
      logs: [],
      outcome: 'win',
    },
  })
}

describe('worker level hydrate / spawn', () => {
  it('hydrates missing or dirty level/xp to Lv1 and 0', () => {
    expect(hydrateWorkerLevel(undefined)).toBe(WORKER_LEVEL_MIN)
    expect(hydrateWorkerLevel(0)).toBe(1)
    expect(hydrateWorkerLevel(-2)).toBe(1)
    expect(hydrateWorkerLevel(3.8)).toBe(3)
    expect(hydrateWorkerXp(undefined)).toBe(0)
    expect(hydrateWorkerXp(-4)).toBe(0)
    expect(hydrateWorkerXp(7.2)).toBe(7)

    const missing = hydrateWorker({ id: 'w-old', assignment: null })
    expect(missing.level).toBe(1)
    expect(missing.xp).toBe(0)
    expect(missing.hpMax).toBe(workerLiveStats(missing).hp)

    const kept = hydrateWorker({ id: 'w-lv', qualityTier: 1, classId: 'laborer', level: 4, xp: 9, hp: 10 })
    expect(kept.level).toBe(4)
    expect(kept.xp).toBe(9)
    expect(kept.hpMax).toBe(workerCombatStats(1, 'laborer', 4).hp)
    expect(kept.hp).toBe(10)
  })

  it('normalizes leftover xp across levels on hydrate', () => {
    const overflow = normalizeWorkerProgress(1, workerXpToNext(1) + workerXpToNext(2))
    expect(overflow).toEqual({ level: 3, xp: 0 })
    const worker = hydrateWorker({ id: 'w-over', level: 1, xp: workerXpToNext(1) + 3 })
    expect(worker.level).toBe(2)
    expect(worker.xp).toBe(3)
  })

  it('spawns and recruits at Lv1 with 0 xp', () => {
    const save = createSave()
    const worker = spawnWorker(save)
    expect(worker.level).toBe(1)
    expect(worker.xp).toBe(0)
    const mid = spawnWorkerWith(save, 5, 'artisan')
    expect(mid.level).toBe(1)
    expect(mid.xp).toBe(0)
  })
})

describe('worker xp tables', () => {
  it('increases xp to next and can convert total xp both ways', () => {
    expect(workerXpToNext(1)).toBe(Math.round(WORKER_XP_TO_NEXT_BASE))
    expect(workerXpToNext(2)).toBe(Math.round(WORKER_XP_TO_NEXT_BASE * WORKER_XP_TO_NEXT_GROWTH))
    expect(workerXpToNext(3)).toBeGreaterThan(workerXpToNext(2))
    expect(workerTotalXp(1, 0)).toBe(0)
    expect(workerTotalXp(1, 7)).toBe(7)
    expect(workerTotalXp(3, 4)).toBe(workerXpToNext(1) + workerXpToNext(2) + 4)
    expect(workerFromTotalXp(workerTotalXp(5, 6))).toEqual({ level: 5, xp: 6 })
    expect(workerFromTotalXp(0)).toEqual({ level: 1, xp: 0 })
  })

  it('scales loot xp by enemy rank and chapter', () => {
    expect(WORKER_LOOT_XP_BY_RANK).toEqual({ minion: 12, elite: 20, boss: 32 })
    expect(WORKER_LOOT_XP_PER_CHAPTER).toBe(1)
    expect(workerLootXp('minion', 1)).toBe(12)
    expect(workerLootXp('elite', 1)).toBe(20)
    expect(workerLootXp('boss', 1)).toBe(32)
    expect(workerLootXp('minion', 3)).toBe(12 + WORKER_LOOT_XP_PER_CHAPTER * 2)
    expect(workerLootXp('elite', 3)).toBe(22)
    expect(workerLootXp('boss', 4)).toBe(35)
    expect(workerLootXp('boss', 4)).toBeGreaterThan(workerLootXp('minion', 1))
  })

  it('shares a slice of station xpPerCycle and at least 1', () => {
    expect(WORKER_STATION_XP_SHARE).toBe(0.35)
    expect(workerStationCycleXp(1)).toBe(1)
    expect(workerStationCycleXp(2)).toBe(1)
    expect(workerStationCycleXp(3)).toBe(1)
    expect(workerStationCycleXp(5)).toBe(2)
    expect(workerStationCycleXp(8)).toBe(3)
    expect(workerStationCycleXp(0)).toBe(1)
  })

  it('formats a level-up tip from the reached level', () => {
    expect(workerLevelUpTip('阿铁', 4)).toBe('阿铁 升至 Lv4')
    expect(workerLevelUpTip('  ', 2)).toBe('工人 升至 Lv2')
  })
})

describe('claim loot grants combat xp', () => {
  it('gives xp to every surviving roster member on the combat list and can level up', () => {
    const save = createSave()
    const a = spawnWorker(save)
    const b = spawnWorkerWith(save, 1, 'wanderer')
    a.hp = 0
    const enc = winSnap(a.id)
    enc.combat!.workerIds = [a.id, b.id]
    putEnemy(save, enc)

    const result = claimLoot(save, 0)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.message).toContain('工人获得经验')
    const gain = workerLootXp('minion', 1)
    expect(a.xp).toBe(gain)
    expect(b.xp).toBe(gain)
    expect(a.level).toBe(1)

    a.xp = workerXpToNext(1) - 2
    const again = winSnap(a.id)
    again.id = 'xp-enemy-2'
    putEnemy(save, again)
    expect(claimLoot(save, 0).ok).toBe(true)
    expect(a.level).toBe(2)
    expect(a.xp).toBe(gain - 2)
    expect(a.hpMax).toBe(workerCombatStats(1, a.classId, 2).hp)
  })

  it('does not grant xp on lose, while fighting, or before claiming a win', () => {
    const save = createSave()
    const worker = spawnWorker(save)
    save.bank.meal = 4
    const lost = testEnemy({
      departed: true,
      combat: {
        startedAt: 0,
        timeoutAt: 120_000,
        workerIds: [worker.id],
        workers: [{ id: worker.id, label: '甲', hp: 4, hpMax: 26, atk: 4, spd: 5, nextActAt: 5_000 }],
        enemy: { id: 'enemy', label: '试敌', hp: 8, hpMax: 18, atk: 3, spd: 5, nextActAt: 5_000 },
        logs: [],
        outcome: 'lose',
      },
    })
    putEnemy(save, lost)
    expect(claimLoot(save, 0).ok).toBe(false)
    expect(worker.level).toBe(1)
    expect(worker.xp).toBe(0)

    const fighting = createSave()
    const fighter = spawnWorker(fighting)
    fighting.bank.meal = 4
    putEnemy(fighting, testEnemy())
    expect(startCombat(fighting, 0, [fighter.id], 2_000).ok).toBe(true)
    expect(claimLoot(fighting, 0, 2_000).ok).toBe(false)
    expect(fighter.xp).toBe(0)

    const won = createSave()
    const ready = spawnWorker(won)
    const enc = winSnap(ready.id)
    putEnemy(won, enc)
    expect(ready.xp).toBe(0)
    expect(enc.lootClaimed).toBe(false)
    expect(claimLoot(won, 0).ok).toBe(true)
    expect(ready.xp).toBe(workerLootXp('minion', 1))
  })
})

describe('worker level combat stats', () => {
  it('stacks hp / atk / spd on top of quality and class, and keeps hp ratio on level-up', () => {
    const lv1 = workerCombatStats(1, 'laborer', 1)
    const lv10 = workerCombatStats(1, 'laborer', 10)
    expect(lv1).toEqual(workerCombatStats(1, 'laborer'))
    expect(lv10.hp).toBe(Math.round(lv1.hp * (1 + WORKER_LEVEL_HP_PER * 9)))
    expect(lv10.atk).toBe(Math.round(lv1.atk * (1 + WORKER_LEVEL_ATK_PER * 9)))
    expect(lv10.spd).toBeCloseTo(lv1.spd * Math.pow(WORKER_LEVEL_SPD_MUL, 9))
    expect(lv10.spd).toBeGreaterThanOrEqual(lv1.spd * WORKER_LEVEL_SPD_FLOOR)
    expect(lv10.hp).toBeGreaterThan(lv1.hp)
    expect(lv10.atk).toBeGreaterThan(lv1.atk)
    expect(lv10.spd).toBeLessThan(lv1.spd)

    const save = createSave()
    const worker = spawnWorker(save)
    const before = workerLiveStats(worker)
    worker.hp = Math.round(before.hp / 2)
    const oldHp = worker.hp
    const oldMax = worker.hpMax
    addWorkerXp(worker, workerXpToNext(1))
    applyWorkerLevelHpRatio(worker, oldHp, oldMax)
    expect(worker.level).toBe(2)
    expect(worker.hpMax).toBe(workerLiveStats(worker).hp)
    expect(worker.hp).toBe(Math.round((oldHp / oldMax) * worker.hpMax))

    const viaGrant = spawnWorkerWith(save, 1, 'laborer')
    viaGrant.hp = 10
    const granted = grantWorkerCombatXp(viaGrant, workerXpToNext(1) * 3)
    expect(granted.levelsGained).toBeGreaterThanOrEqual(2)
    expect(viaGrant.hpMax).toBe(workerLiveStats(viaGrant).hp)
  })
})

describe('workshop cycle grants on-duty xp', () => {
  afterEach(() => setRollOverride(null))

  it('gives each on-duty worker a share on success and skips rest, other stations, and assists', () => {
    const save = createSave()
    const dutyA = spawnWorker(save)
    const dutyB = spawnWorker(save)
    const resting = spawnWorker(save)
    const other = spawnWorker(save)
    const assist = spawnWorker(save)
    expect(assignWorker(save, dutyA.id, 'herbalism').ok).toBe(true)
    expect(assignWorker(save, dutyB.id, 'herbalism').ok).toBe(true)
    expect(assignWorker(save, other.id, 'mining').ok).toBe(true)
    assist.guest = true
    assist.assignment = 'herbalism'
    const xpPerCycle = selectedCategoryDef(save, 'herbalism').xpPerCycle
    const share = workerStationCycleXp(xpPerCycle)
    const stationBefore = save.stations.herbalism.stationXp

    expect(completeCycle(save, 'herbalism')).toBe(true)
    expect(save.stations.herbalism.stationXp - stationBefore).toBe(xpPerCycle)
    expect(dutyA.xp).toBe(share)
    expect(dutyB.xp).toBe(share)
    expect(dutyA.level).toBe(1)
    expect(resting.xp).toBe(0)
    expect(other.xp).toBe(0)
    expect(assist.xp).toBe(0)

    expect(completeCycle(save, 'herbalism')).toBe(true)
    expect(dutyA.xp).toBe(share * 2)
    expect(resting.xp).toBe(0)
  })

  it('does not grant xp on hazard, soft fail, or a frozen gather with no output', () => {
    setRollOverride(() => 0)
    const hazard = createSave()
    const hunter = spawnWorker(hazard)
    expect(assignWorker(hazard, hunter.id, 'hunting').ok).toBe(true)
    expect(completeCycle(hazard, 'hunting')).toBe(true)
    expect(hazard.stations.hunting.gatherNotice).toContain('遇险')
    expect(hazard.stations.hunting.stationXp).toBe(selectedCategoryDef(hazard, 'hunting').xpPerCycle)
    expect(hunter.xp).toBe(0)
    expect(hunter.level).toBe(1)

    const fail = createSave()
    fail.bank.wildCrystal = 4
    const smith = spawnWorker(fail)
    expect(assignWorker(fail, smith.id, 'inscription').ok).toBe(true)
    const stationXp = selectedCategoryDef(fail, 'inscription').xpPerCycle
    expect(completeCycle(fail, 'inscription')).toBe(true)
    expect(fail.stations.inscription.craftNotice).toContain('软失败')
    expect(fail.stations.inscription.stationXp).toBe(softFailXp(stationXp))
    expect(smith.xp).toBe(0)

    const frozen = createSave()
    const miner = spawnWorker(frozen)
    expect(assignWorker(frozen, miner.id, 'mining').ok).toBe(true)
    const node = {
      categoryId: 'copper' as const,
      nodeHp: 0,
      nodeHpMax: 20,
      recoverAt: frozen.elapsedS + 100,
    }
    frozen.stations.mining.miningNode = node
    frozen.stations.mining.miningNodes = { copper: node }
    const minedBefore = frozen.stations.mining.stationXp
    expect(completeCycle(frozen, 'mining')).toBe(false)
    expect(frozen.stations.mining.stationXp).toBe(minedBefore)
    expect(miner.xp).toBe(0)
  })

  it('levels an on-duty worker through the combat xp path and keeps the hp ratio', () => {
    const save = createSave()
    const worker = spawnWorker(save)
    expect(assignWorker(save, worker.id, 'herbalism').ok).toBe(true)
    worker.xp = workerXpToNext(1) - 1
    worker.hp = Math.round(worker.hpMax / 2)
    const oldHp = worker.hp
    const oldMax = worker.hpMax
    expect(completeCycle(save, 'herbalism')).toBe(true)
    expect(worker.level).toBe(2)
    expect(worker.xp).toBe(workerStationCycleXp(selectedCategoryDef(save, 'herbalism').xpPerCycle) - 1)
    expect(worker.hpMax).toBe(workerLiveStats(worker).hp)
    expect(worker.hp).toBe(Math.round((oldHp / oldMax) * worker.hpMax))
  })
})

describe('fuse sums total xp', () => {
  it('sets the new worker from the sum of both parents total xp', () => {
    const save = createSave()
    const a = spawnWorker(save)
    const b = spawnWorker(save)
    a.level = 4
    a.xp = 6
    b.level = 2
    b.xp = 10
    const sumTotal = workerTotalXp(4, 6) + workerTotalXp(2, 10)
    const expected = workerFromTotalXp(sumTotal)
    expect(sumTotal).toBeGreaterThan(Math.floor(sumTotal / 2))
    expect(assignWorker(save, a.id, 'mining').ok).toBe(true)
    expect(assignWorker(save, b.id, 'mining').ok).toBe(true)
    expect(fuseWorkers(save, a.id, b.id).ok).toBe(true)
    const next = save.workers[0]
    expect(next.qualityTier).toBe(2)
    expect(next.level).toBe(expected.level)
    expect(next.xp).toBe(expected.xp)
    expect(workerTotalXp(next.level, next.xp)).toBe(sumTotal)
    expect(next.hp).toBe(next.hpMax)
    expect(next.hpMax).toBe(workerLiveStats(next).hp)
    expect(next.assignment).toBe('mining')
  })

  it('cascades overflow xp into extra levels along the worker curve', () => {
    const save = createSave()
    const a = spawnWorker(save)
    const b = spawnWorker(save)
    a.level = 1
    a.xp = 15
    b.level = 1
    b.xp = 10
    const expected = workerFromTotalXp(25)
    expect(expected.level).toBe(2)
    expect(expected.xp).toBe(25 - workerXpToNext(1))
    expect(assignWorker(save, a.id, 'herbalism').ok).toBe(true)
    expect(assignWorker(save, b.id, 'herbalism').ok).toBe(true)
    expect(fuseWorkers(save, a.id, b.id).ok).toBe(true)
    const next = save.workers[0]
    expect(next.qualityTier).toBe(2)
    expect(next.level).toBe(2)
    expect(next.xp).toBe(expected.xp)
    expect(next.xp).toBeLessThan(workerXpToNext(next.level))
  })
})
