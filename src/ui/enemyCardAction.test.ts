import { describe, expect, it } from 'vitest'
import type { EnemyCombat, EnemyEncounter } from '../sim/types'
import { enemyCardButton, enemyPickCopy } from './enemyCardAction'

function fight(outcome: EnemyCombat['outcome']): EnemyCombat {
  return {
    startedAt: 1,
    timeoutAt: 10_000,
    workerIds: ['w1'],
    workers: [{ id: 'w1', label: '甲', hp: 10, hpMax: 20, atk: 2, spd: 4, nextActAt: 2 }],
    enemy: { id: 'enemy', label: '试敌', hp: 8, hpMax: 18, atk: 3, spd: 5, nextActAt: 3 },
    logs: [],
    outcome,
  }
}

function enemy(overrides: Partial<EnemyEncounter> = {}): EnemyEncounter {
  return {
    kind: 'enemy',
    id: 'e1',
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
    ...overrides,
  }
}

describe('enemyCardButton', () => {
  it('shows 开战 only before the order has ever fought', () => {
    expect(enemyCardButton(enemy())).toBe('start')
    expect(enemyCardButton(enemy({ departed: true, combat: fight(null) }))).toBe('fighting')
    expect(enemyCardButton(enemy({ departed: true, combat: fight('win') }))).toBe('loot')
    expect(enemyCardButton(enemy({ departed: true, combat: fight('win'), lootClaimed: true }))).toBe('claimed')
    expect(enemyCardButton(enemy({ departed: true, combat: fight('lose') }))).toBe('loseReinforce')
    expect(enemyCardButton(enemy({ departed: true, combat: null }))).toBe('loseReinforce')
  })

  it('keeps dungeon win and lose on the chest button', () => {
    expect(enemyCardButton(enemy({ dungeon: true, departed: true, combat: fight('lose') }))).toBe('chest')
    expect(enemyCardButton(enemy({ dungeon: true, departed: true, combat: fight('win') }))).toBe('chest')
    expect(enemyCardButton(enemy({ dungeon: true, departed: true, combat: fight(null) }))).toBe('fighting')
    expect(enemyCardButton(enemy({ dungeon: true }))).toBe('start')
  })
})

describe('enemyPickCopy', () => {
  it('uses reinforce copy after a loss and still charges supplies', () => {
    const lose = enemyPickCopy('loseReinforce', 3)
    expect(lose.title).toBe('选择增援工人')
    expect(lose.confirm).toBe('增援')
    expect(lose.confirm).not.toBe('开战')
    expect(lose.title).not.toContain('出战')
    expect(lose.costsSupply).toBe(true)
    expect(lose.hintTail).toMatch(/扣一整套补给/)

    const live = enemyPickCopy('reinforce', 2)
    expect(live.confirm).toBe('增援')
    expect(live.costsSupply).toBe(false)
    expect(live.hintTail).toMatch(/不消耗补给/)

    const start = enemyPickCopy('start', 3)
    expect(start.confirm).toBe('开战')
    expect(start.costsSupply).toBe(true)
  })
})
