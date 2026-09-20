import { describe, expect, it } from 'vitest'
import { beginEnemyCombat } from './combat'
import {
  applyEnemyTargetRule,
  collectEnemyTargetPool,
  drawEnemyTargetRule,
  enemyTargetRuleWeights,
  ENEMY_TARGET_RULE_IDS,
  ENEMY_TARGET_RULE_QUALITY_WEIGHTS,
  ENEMY_TARGET_RULE_WEIGHTS,
  isEnemyTargetRuleId,
  pickEnemyTargets,
  pickHighestHpTarget,
  pickLowestHpTarget,
  pickRandomTargets,
  pickWeightedTargetRule,
  type CombatTarget,
} from './combatTarget'
import { createSave } from './createSave'
import { assignWorker } from './assign'
import { spawnWorkerWith } from './recruit'
import type { EnemyEncounter, Save } from './types'

function target(
  id: string,
  lane: CombatTarget['lane'],
  hp: number,
  hpMax = 20,
  stationId: CombatTarget['stationId'] = lane === 'workshop' ? 'mining' : null,
): CombatTarget {
  return { id, label: id, hp, hpMax, lane, stationId }
}

function testEnemy(overrides: Partial<EnemyEncounter> = {}): EnemyEncounter {
  return {
    kind: 'enemy',
    id: 'rule-enemy',
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

function partySave(): { save: Save; front: ReturnType<typeof spawnWorkerWith>; shop: ReturnType<typeof spawnWorkerWith>; rest: ReturnType<typeof spawnWorkerWith> } {
  const save = createSave()
  const front = spawnWorkerWith(save, 1, 'laborer')
  const shop = spawnWorkerWith(save, 1, 'miner')
  const rest = spawnWorkerWith(save, 1, 'wanderer')
  front.name = '出战甲'
  shop.name = '在岗乙'
  rest.name = '休息丙'
  assignWorker(save, shop.id, 'mining')
  return { save, front, shop, rest }
}

describe('enemy target rule tables', () => {
  it('lists every rule id and keeps rank weights on the intended styles', () => {
    expect(ENEMY_TARGET_RULE_IDS).toEqual([
      'all',
      'rand1',
      'rand2',
      'rand3',
      'lowestHp',
      'highestHp',
      'workshopBias',
      'frontlineBias',
      'sameStation',
      'cleave2',
    ])
    expect(Object.keys(ENEMY_TARGET_RULE_WEIGHTS.minion).sort()).toEqual(['frontlineBias', 'rand1'])
    expect(Object.keys(ENEMY_TARGET_RULE_WEIGHTS.elite).sort()).toEqual(['cleave2', 'lowestHp', 'rand2'])
    expect(Object.keys(ENEMY_TARGET_RULE_WEIGHTS.boss).sort()).toEqual(['all', 'lowestHp', 'rand1', 'workshopBias'])
    expect(ENEMY_TARGET_RULE_WEIGHTS.minion.rand1).toBeGreaterThan(ENEMY_TARGET_RULE_WEIGHTS.minion.frontlineBias ?? 0)
    expect(ENEMY_TARGET_RULE_WEIGHTS.boss.all).toBe(1)
    expect(ENEMY_TARGET_RULE_WEIGHTS.boss.workshopBias).toBe(1)
    expect(ENEMY_TARGET_RULE_QUALITY_WEIGHTS.orange?.all).toBe(1)
    expect(isEnemyTargetRuleId('cleave2')).toBe(true)
    expect(isEnemyTargetRuleId('rand4')).toBe(false)
  })

  it('stacks orange quality onto the rank table and pins encounter rules', () => {
    const elite = enemyTargetRuleWeights('elite', 'green')
    const orangeElite = enemyTargetRuleWeights('elite', 'orange')
    expect(elite.all).toBeUndefined()
    expect(orangeElite.all).toBe(1)
    const save = createSave()
    const pinned = testEnemy({ targetRuleId: 'highestHp', enemyRank: 'boss' })
    expect(drawEnemyTargetRule(save, pinned)).toBe('highestHp')
    const rolls: EnemyEncounter['quality'][] = []
    const drawn = new Set<string>()
    for (let i = 0; i < 40; i++) {
      drawn.add(drawEnemyTargetRule(save, testEnemy({ enemyRank: 'minion' })))
      rolls.push('green')
    }
    expect(rolls).toHaveLength(40)
    expect([...drawn].every((id) => id === 'rand1' || id === 'frontlineBias')).toBe(true)
  })

  it('picks weighted rules in table order', () => {
    const weights = { rand1: 1, frontlineBias: 1 }
    expect(pickWeightedTargetRule(weights, () => 0)).toBe('rand1')
    expect(pickWeightedTargetRule(weights, () => 0.6)).toBe('frontlineBias')
    expect(pickWeightedTargetRule({}, () => 0.2)).toBe('rand1')
  })
})

describe('enemy target pool and rules', () => {
  it('pools fighting plus stationed workers and skips rest', () => {
    const { save, front, shop, rest } = partySave()
    const enc = testEnemy()
    const combat = beginEnemyCombat(enc, [front], 1_000)
    const pool = collectEnemyTargetPool(save, combat)
    expect(pool.map((row) => row.id).sort()).toEqual([front.id, shop.id].sort())
    expect(pool.find((row) => row.id === front.id)?.lane).toBe('frontline')
    expect(pool.find((row) => row.id === shop.id)?.lane).toBe('workshop')
    expect(pool.some((row) => row.id === rest.id)).toBe(false)
  })

  it('applies each table rule', () => {
    const a = target('a', 'frontline', 8, 20)
    const b = target('b', 'frontline', 20, 20)
    const c = target('c', 'workshop', 4, 20, 'mining')
    const d = target('d', 'workshop', 18, 20, 'mining')
    const e = target('e', 'workshop', 12, 20, 'fishing')
    const pool = [a, b, c, d, e]
    const zero = () => 0

    expect(applyEnemyTargetRule(pool, 'all', zero).map((row) => row.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(applyEnemyTargetRule(pool, 'rand1', zero).map((row) => row.id)).toEqual(['a'])
    expect(applyEnemyTargetRule(pool, 'rand2', zero).map((row) => row.id)).toEqual(['a', 'b'])
    expect(applyEnemyTargetRule(pool, 'rand3', zero).map((row) => row.id)).toEqual(['a', 'b', 'c'])
    expect(applyEnemyTargetRule([a], 'rand3', zero).map((row) => row.id)).toEqual(['a'])
    expect(applyEnemyTargetRule(pool, 'lowestHp', zero).map((row) => row.id)).toEqual(['c'])
    expect(applyEnemyTargetRule(pool, 'highestHp', zero).map((row) => row.id)).toEqual(['b'])
    expect(applyEnemyTargetRule(pool, 'workshopBias', zero).map((row) => row.id)).toEqual(['c', 'd', 'e'])
    expect(applyEnemyTargetRule(pool, 'frontlineBias', zero).map((row) => row.id)).toEqual(['a', 'b'])
    expect(applyEnemyTargetRule([c, d, e], 'frontlineBias', zero).map((row) => row.id)).toEqual(['c', 'd', 'e'])
    expect(applyEnemyTargetRule([a, b], 'workshopBias', zero).map((row) => row.id)).toEqual(['a', 'b'])
    expect(applyEnemyTargetRule(pool, 'sameStation', zero).map((row) => row.id)).toEqual(['c', 'd'])
    expect(applyEnemyTargetRule(pool, 'cleave2', zero).map((row) => row.id)).toEqual(['c', 'a'])
  })

  it('picks random and hp helpers with stable ties', () => {
    const lowA = target('a', 'workshop', 5, 10)
    const lowB = target('b', 'frontline', 5, 10)
    expect(pickLowestHpTarget([lowA, lowB])?.id).toBe('b')
    expect(pickHighestHpTarget([target('x', 'frontline', 7), target('y', 'workshop', 9)])?.id).toBe('y')
    expect(pickRandomTargets([lowA, lowB], 2, () => 0.9).map((row) => row.id).sort()).toEqual(['a', 'b'])
    expect(pickRandomTargets([], 1, () => 0)).toEqual([])
  })

  it('lets pickEnemyTargets read the live save pool', () => {
    const { save, front, shop } = partySave()
    const enc = testEnemy({ targetRuleId: 'workshopBias' })
    const combat = beginEnemyCombat(enc, [front], 2_000)
    const hits = pickEnemyTargets(save, combat, 'workshopBias', () => 0)
    expect(hits.map((row) => row.id)).toEqual([shop.id])
    expect(pickEnemyTargets(save, combat, 'frontlineBias', () => 0).map((row) => row.id)).toEqual([front.id])
  })
})
