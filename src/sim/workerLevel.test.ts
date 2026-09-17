import { describe, expect, it } from 'vitest'
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
import { hydrateWorker, spawnWorker, spawnWorkerWith } from './recruit'
import type { EnemyEncounter, Save } from './types'
import {
  addWorkerXp,
  hydrateWorkerLevel,
  hydrateWorkerXp,
  normalizeWorkerProgress,
  workerFromTotalXp,
  workerLootXp,
  workerTotalXp,
  workerXpToNext,
  WORKER_LEVEL_ATK_PER,
  WORKER_LEVEL_HP_PER,
  WORKER_LEVEL_MIN,
  WORKER_LEVEL_SPD_FLOOR,
  WORKER_LEVEL_SPD_MUL,
  WORKER_LOOT_XP_BY_RANK,
  WORKER_LOOT_XP_PER_CHAPTER,
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
    expect(workerLootXp('minion', 1)).toBe(WORKER_LOOT_XP_BY_RANK.minion)
    expect(workerLootXp('elite', 1)).toBe(WORKER_LOOT_XP_BY_RANK.elite)
    expect(workerLootXp('boss', 1)).toBe(WORKER_LOOT_XP_BY_RANK.boss)
    expect(workerLootXp('minion', 3)).toBe(
      WORKER_LOOT_XP_BY_RANK.minion + WORKER_LOOT_XP_PER_CHAPTER * 2,
    )
    expect(workerLootXp('boss', 4)).toBeGreaterThan(workerLootXp('minion', 1))
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

describe('fuse averages total xp', () => {
  it('sets the new worker from floor of the two parents total xp', () => {
    const save = createSave()
    const a = spawnWorker(save)
    const b = spawnWorker(save)
    a.level = 4
    a.xp = 6
    b.level = 2
    b.xp = 10
    const avgTotal = Math.floor((workerTotalXp(4, 6) + workerTotalXp(2, 10)) / 2)
    const expected = workerFromTotalXp(avgTotal)
    expect(assignWorker(save, a.id, 'mining').ok).toBe(true)
    expect(assignWorker(save, b.id, 'mining').ok).toBe(true)
    expect(fuseWorkers(save, a.id, b.id).ok).toBe(true)
    const next = save.workers[0]
    expect(next.qualityTier).toBe(2)
    expect(next.level).toBe(expected.level)
    expect(next.xp).toBe(expected.xp)
    expect(next.hp).toBe(next.hpMax)
    expect(next.hpMax).toBe(workerLiveStats(next).hp)
    expect(next.assignment).toBe('mining')
  })
})
