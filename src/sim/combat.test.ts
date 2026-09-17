import { describe, expect, it } from 'vitest'
import {
  CLASS_COMBAT_MOD,
  COMBAT_PARTY_MAX,
  COMBAT_TIMEOUT_BY_RANK,
  COMBAT_TIMEOUT_S,
  ENEMY_COMBAT_BASE,
  ENEMY_COMBAT_QUALITY_MUL,
  ENEMY_COMBAT_RANK_MUL,
  REST_HEAL_EVERY_S,
  WORKER_COMBAT_BY_TIER,
  applyRestHeal,
  beginEnemyCombat,
  combatPartyBlockReason,
  combatTimeoutS,
  enemyCombatStats,
  fillWorkerHp,
  isCombatLost,
  isCombatWon,
  isFighting,
  isWorkerInCombat,
  pickEnemyTarget,
  restCombatCandidates,
  selectableCombatWorkers,
  stepEnemyCombat,
  workerCombatStats,
} from './combat'
import { createSave } from './createSave'
import { claimLoot, startCombat } from './encounters'
import { hydrateWorker, spawnWorker, spawnWorkerWith } from './recruit'
import { settleOffline } from './offline'
import { assignWorker } from './assign'
import { tick, ticks } from './tick'
import type { CombatAttrId, EnemyCombat, EnemyEncounter, Save } from './types'

function testEnemy(overrides: Partial<EnemyEncounter> = {}): EnemyEncounter {
  return {
    kind: 'enemy',
    id: 'test-enemy',
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

function stock(save: Save) {
  save.bank.meal = 8
  save.bank.ore = 8
  save.bank.fish = 8
  save.bank.roast = 8
}

describe('combat stats tables', () => {
  it('uses quality base plus a small class modifier', () => {
    const white = workerCombatStats(1)
    expect(white).toEqual(WORKER_COMBAT_BY_TIER[1])
    const laborer = workerCombatStats(1, 'laborer')
    expect(laborer.hp).toBe(WORKER_COMBAT_BY_TIER[1].hp + CLASS_COMBAT_MOD.laborer.hp)
    expect(laborer.atk).toBe(WORKER_COMBAT_BY_TIER[1].atk)
    const knight = workerCombatStats(10, 'knight')
    expect(knight.hp).toBe(WORKER_COMBAT_BY_TIER[10].hp + CLASS_COMBAT_MOD.knight.hp)
    expect(knight.atk).toBe(WORKER_COMBAT_BY_TIER[10].atk + CLASS_COMBAT_MOD.knight.atk)
    expect(knight.spd).toBe(WORKER_COMBAT_BY_TIER[10].spd + CLASS_COMBAT_MOD.knight.spd)
    expect(knight.spd).toBeGreaterThanOrEqual(1)
  })

  it('looks up enemy stats by quality and rank from a single combat base', () => {
    const minion = enemyCombatStats('green', 'minion')
    const elite = enemyCombatStats('green', 'elite')
    const orange = enemyCombatStats('orange', 'boss')
    expect(elite.hp).toBeGreaterThan(minion.hp)
    expect(orange.hp).toBeGreaterThan(elite.hp)
    expect(orange.atk).toBeGreaterThan(minion.atk)
    expect(orange.spd).toBeGreaterThan(minion.spd)
    expect(combatTimeoutS('minion')).toBe(900)
    expect(combatTimeoutS('elite')).toBe(900)
    expect(combatTimeoutS('boss')).toBe(1800)
    expect(COMBAT_TIMEOUT_S).toBe(COMBAT_TIMEOUT_BY_RANK.boss)
    expect(ENEMY_COMBAT_BASE.hp).toBe(2400)
    expect(ENEMY_COMBAT_QUALITY_MUL.orange).toBe(1.2)
    expect(ENEMY_COMBAT_RANK_MUL.boss.hp).toBe(2.1)
  })

  it('hydrates missing hp to full and keeps a stored wound', () => {
    const fresh = hydrateWorker({ id: 'w-1', qualityTier: 1, classId: 'laborer' })
    const expected = workerCombatStats(1, 'laborer')
    expect(fresh.hp).toBe(expected.hp)
    expect(fresh.hpMax).toBe(expected.hp)
    const wounded = hydrateWorker({ id: 'w-2', qualityTier: 1, classId: 'laborer', hp: 7 })
    expect(wounded.hp).toBe(7)
    expect(wounded.hpMax).toBe(expected.hp)
    const filled = fillWorkerHp({ ...fresh, hp: 0, hpMax: 1 })
    expect(filled.hp).toBe(filled.hpMax)
  })
})

describe('start combat party', () => {
  it('only lists resting workers and rejects stationed, fighting, or hp<=0', () => {
    const save = createSave()
    const a = spawnWorker(save)
    const b = spawnWorkerWith(save, 1, 'artisan')
    const c = spawnWorkerWith(save, 1, 'wanderer')
    assignWorker(save, b.id, 'mining')
    c.hp = 0
    putEnemy(save, testEnemy())
    stock(save)

    expect(restCombatCandidates(save).map((w) => w.id)).toEqual([a.id, c.id])
    expect(selectableCombatWorkers(save).map((w) => w.id)).toEqual([a.id])
    expect(combatPartyBlockReason(save, [b.id])).toContain('不在休息')
    expect(combatPartyBlockReason(save, [c.id])).toContain('无法出战')
    expect(combatPartyBlockReason(save, [])).toBe('请选择出战工人')
    expect(combatPartyBlockReason(save, [a.id, a.id])).toContain('重复')
    expect(combatPartyBlockReason(save, [a.id, b.id, c.id])).toContain(`最多选 ${COMBAT_PARTY_MAX}`)

    expect(startCombat(save, 0, [a.id], 1_000).ok).toBe(true)
    expect(a.assignment).toBeNull()
    expect(isWorkerInCombat(save, a.id)).toBe(true)
    expect(assignWorker(save, a.id, 'mining')).toEqual({ ok: false, reason: '正在战斗' })
    expect(combatPartyBlockReason(save, [a.id])).toContain('正在战斗')
  })

  it('does not start or take goods when supplies are short', () => {
    const save = createSave()
    const worker = spawnWorker(save)
    putEnemy(save, testEnemy({ needs: { meal: 3 } }))
    save.bank.meal = 1
    const result = startCombat(save, 0, [worker.id], 2_000)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('货不够')
    expect(save.bank.meal).toBe(1)
    expect(save.departCount).toBe(0)
    const enc = save.encounters[0]
    expect(enc.kind).toBe('enemy')
    if (enc.kind === 'enemy') {
      expect(enc.combat).toBeNull()
      expect(enc.departed).toBe(false)
    }
  })
})

describe('combat timeline', () => {
  it('lets two workers hit one enemy on the clock and writes wounds back on win', () => {
    const save = createSave()
    const a = spawnWorkerWith(save, 1, 'laborer')
    const b = spawnWorkerWith(save, 1, 'wanderer')
    const enc = testEnemy()
    putEnemy(save, enc)
    const now = 10_000
    beginEnemyCombat(enc, [a, b], now)
    expect(isFighting(enc)).toBe(true)
    expect(a.assignment).toBeNull()

    stepEnemyCombat(save, enc, now + 4_000)
    expect(enc.combat?.enemy.hp).toBe(enc.combat?.enemy.hpMax)
    expect(enc.combat?.outcome).toBeNull()

    stepEnemyCombat(save, enc, now + 5_000)
    expect(enc.combat?.enemy.hp).toBeLessThan(enc.combat?.enemy.hpMax ?? 0)
    expect(enc.combat?.workers.every((w) => w.hp === w.hpMax)).toBe(true)

    stepEnemyCombat(save, enc, now + 32_000)
    expect(enc.combat?.workers.some((w) => w.hp < w.hpMax)).toBe(true)

    if (enc.combat) enc.combat.enemy.hp = 1
    stepEnemyCombat(save, enc, now + 35_000)
    expect(isCombatWon(enc)).toBe(true)
    expect(save.gold).toBe(createSave().gold)
    expect(a.hp).toBe(enc.combat?.workers.find((w) => w.id === a.id)?.hp)
    expect(b.hp).toBe(enc.combat?.workers.find((w) => w.id === b.id)?.hp)
    expect(a.assignment).toBeNull()
    expect(isWorkerInCombat(save, a.id)).toBe(false)
  })

  it('makes the enemy hit the worker with the lowest current hp ratio', () => {
    const save = createSave()
    const a = spawnWorkerWith(save, 1, 'laborer')
    const b = spawnWorkerWith(save, 1, 'laborer')
    a.name = '甲'
    b.name = '乙'
    const enc = testEnemy()
    putEnemy(save, enc)
    const now = 20_000
    const combat = beginEnemyCombat(enc, [a, b], now)
    combat.workers[0].hp = 20
    combat.workers[1].hp = 8
    const target = pickEnemyTarget(combat)
    expect(target?.id).toBe(b.id)

    combat.workers[0].nextActAt = now + 9_000
    combat.workers[1].nextActAt = now + 9_000
    combat.enemy.nextActAt = now + 1_000
    const beforeA = combat.workers[0].hp
    const beforeB = combat.workers[1].hp
    stepEnemyCombat(save, enc, now + 1_000)
    expect(combat.workers[1].hp).toBe(beforeB - combat.enemy.atk)
    expect(combat.workers[0].hp).toBe(beforeA)
  })

  it('times out as a loss, writes wounds, and lets a rematch take supplies again', () => {
    const save = createSave()
    save.gold = 10
    const worker = spawnWorker(save)
    const enc = testEnemy({
      needs: { meal: 2 },
      lootGold: 14,
    })
    putEnemy(save, enc)
    save.bank.meal = 6
    const now = 30_000
    expect(startCombat(save, 0, [worker.id], now).ok).toBe(true)
    expect(save.bank.meal).toBe(4)

    const combat = enc.combat
    expect(combat).toBeTruthy()
    if (!combat) return
    const leftoverHp = Math.max(1, combat.enemy.hpMax - 37)
    combat.enemy.hp = leftoverHp
    combat.workers[0].nextActAt = combat.timeoutAt + 5_000
    combat.enemy.nextActAt = combat.timeoutAt + 5_000
    stepEnemyCombat(save, enc, combat.timeoutAt)
    expect(isCombatLost(enc)).toBe(true)
    expect(save.gold).toBe(10)
    expect(worker.hp).toBe(combat.workers[0].hp)
    expect(combat.enemy.hp).toBe(leftoverHp)
    expect(claimLoot(save, 0, combat.timeoutAt).ok).toBe(false)

    const rematchAt = combat.timeoutAt + 1_000
    const rematch = startCombat(save, 0, [worker.id], rematchAt)
    expect(rematch.ok).toBe(true)
    expect(save.bank.meal).toBe(2)
    expect(isFighting(enc)).toBe(true)
    expect(enc.combat?.enemy.hp).toBe(leftoverHp)
    expect(enc.combat?.enemy.hpMax).toBe(combat.enemy.hpMax)
    expect(enc.combat?.startedAt).toBe(rematchAt)
    expect(enc.combat?.timeoutAt).toBe(rematchAt + combatTimeoutS(enc.enemyRank) * 1000)
  })

  it('resolves the same timeline through applyTick / offline catch-up', () => {
    const save = createSave()
    const worker = spawnWorkerWith(save, 8, 'knight')
    const enc = testEnemy({ quality: 'green' })
    putEnemy(save, enc)
    const now = 5_000_000
    beginEnemyCombat(enc, [worker], now)
    save.lastTick = now
    const later = now + 400_000
    const offline = settleOffline(save, later)
    const after = offline.save.encounters[0]
    expect(after.kind).toBe('enemy')
    if (after.kind !== 'enemy') return
    expect(after.combat?.outcome).toBe('win')
    expect(offline.save.gold).toBe(save.gold)
    expect(claimLoot(offline.save, 0, later).ok).toBe(true)
    expect(offline.save.gold).toBe(save.gold + enc.lootGold)
  })

  it('emits live combat logs to onLog and still stores the same text', () => {
    const save = createSave()
    const a = spawnWorkerWith(save, 1, 'laborer')
    a.name = '甲'
    const enc = testEnemy()
    putEnemy(save, enc)
    const now = 40_000
    const events: { id: string; text: string; kind: string }[] = []
    const onLog = (id: string, text: string, kind: 'ok' | 'err') => {
      events.push({ id, text, kind })
    }
    beginEnemyCombat(enc, [a], now, 1, onLog)
    expect(events.some((row) => row.id === enc.id && row.text.includes('出战') && row.kind === 'ok')).toBe(true)
    stepEnemyCombat(save, enc, now + 5_000, onLog)
    expect(events.some((row) => row.text.includes('造成') && row.kind === 'ok')).toBe(true)
    expect(enc.combat?.logs.some((row) => row.text.includes('造成'))).toBe(true)
    if (enc.combat) enc.combat.enemy.hp = 0
    stepEnemyCombat(save, enc, now + 6_000, onLog)
    expect(events.some((row) => row.text === '战斗胜利' && row.kind === 'ok')).toBe(true)
    expect(enc.combat?.logs.some((row) => row.text === '战斗胜利')).toBe(true)

    const live: string[] = []
    const fighting = createSave()
    const fighter = spawnWorkerWith(fighting, 1, 'laborer')
    const liveEnc = testEnemy({ id: 'live-enemy' })
    putEnemy(fighting, liveEnc)
    beginEnemyCombat(liveEnc, [fighter], now)
    tick(fighting, {
      now: now + 5_000,
      onCombatLog: (_id, text) => {
        live.push(text)
      },
    })
    expect(live.some((text) => text.includes('造成'))).toBe(true)
  })
})

function midArtisans(save: Save, attrs: readonly CombatAttrId[]) {
  return [spawnWorkerWith(save, 5, 'artisan', attrs), spawnWorkerWith(save, 5, 'artisan', attrs)]
}

function combatElapsedS(combat: EnemyCombat): number {
  const last = combat.logs[combat.logs.length - 1]
  return (last.at - combat.startedAt) / 1000
}

describe('combat duration targets', () => {
  const noMatch: CombatAttrId[] = ['bow', 'staff']
  const oneHit: CombatAttrId[] = ['fire', 'bow']
  const bossWeak: CombatAttrId[] = ['fire', 'ice', 'dark']

  function run(
    enc: EnemyEncounter,
    attrs: readonly CombatAttrId[],
    now = 1_000_000,
  ): { combat: EnemyCombat; elapsedS: number } {
    const save = createSave()
    putEnemy(save, enc)
    const party = midArtisans(save, attrs)
    const combat = beginEnemyCombat(enc, party, now)
    expect(combat.timeoutAt - combat.startedAt).toBe(combatTimeoutS(enc.enemyRank) * 1000)
    stepEnemyCombat(save, enc, combat.timeoutAt)
    return { combat, elapsedS: combatElapsedS(combat) }
  }

  it('lets two mid workers beat a minion in about 8-12 minutes without weakness', () => {
    const enc = testEnemy({
      quality: 'green',
      enemyRank: 'minion',
      weaknesses: ['fire', 'ice'],
      revealedWeaknesses: [],
    })
    const { combat, elapsedS } = run(enc, noMatch)
    expect(combat.outcome).toBe('win')
    expect(elapsedS).toBeGreaterThanOrEqual(8 * 60)
    expect(elapsedS).toBeLessThanOrEqual(12 * 60)
  })

  it('lets two mid workers beat an elite in about 12-15 minutes without weakness', () => {
    const enc = testEnemy({
      quality: 'green',
      enemyRank: 'elite',
      weaknesses: ['fire', 'ice', 'dark'],
      revealedWeaknesses: [],
    })
    const { combat, elapsedS } = run(enc, noMatch)
    expect(combat.outcome).toBe('win')
    expect(elapsedS).toBeGreaterThanOrEqual(12 * 60)
    expect(elapsedS).toBeLessThanOrEqual(15 * 60)
  })

  it('makes a boss wipe two mid workers who miss every weakness', () => {
    const enc = testEnemy({
      quality: 'orange',
      enemyRank: 'boss',
      weaknesses: bossWeak,
      revealedWeaknesses: [],
    })
    const { combat } = run(enc, noMatch)
    expect(combat.outcome).toBe('lose')
    expect(combat.logs.some((row) => row.text.includes('超时') || row.text.includes('倒下'))).toBe(true)
    expect(combat.enemy.hp).toBeGreaterThan(0)
  })

  it('lets two mid workers with ×1.2 weakness beat a boss in about 18-22 minutes', () => {
    const enc = testEnemy({
      quality: 'orange',
      enemyRank: 'boss',
      weaknesses: bossWeak,
      revealedWeaknesses: [],
    })
    const { combat, elapsedS } = run(enc, oneHit)
    expect(combat.outcome).toBe('win')
    expect(elapsedS).toBeGreaterThanOrEqual(18 * 60)
    expect(elapsedS).toBeLessThanOrEqual(22 * 60)
  })
})

describe('rematch leftover enemy hp', () => {
  it('starts the first fight at full enemy hp', () => {
    const save = createSave()
    const worker = spawnWorker(save)
    const enc = testEnemy()
    putEnemy(save, enc)
    const combat = beginEnemyCombat(enc, [worker], 10_000)
    expect(combat.enemy.hp).toBe(combat.enemy.hpMax)
    expect(combat.enemy.hp).toBe(enemyCombatStats(enc.quality, enc.enemyRank).hp)
  })

  it('keeps leftover enemy hp on rematch after a loss', () => {
    const save = createSave()
    const worker = spawnWorker(save)
    const enc = testEnemy({ needs: { meal: 1 } })
    putEnemy(save, enc)
    save.bank.meal = 4
    const now = 20_000
    expect(startCombat(save, 0, [worker.id], now).ok).toBe(true)
    const first = enc.combat
    expect(first).toBeTruthy()
    if (!first) return
    expect(first.enemy.hp).toBe(first.enemy.hpMax)
    const leftoverHp = Math.max(1, first.enemy.hpMax - 91)
    first.enemy.hp = leftoverHp
    first.outcome = 'lose'

    const rematchAt = now + 8_000
    expect(startCombat(save, 0, [worker.id], rematchAt).ok).toBe(true)
    expect(enc.combat?.enemy.hp).toBe(leftoverHp)
    expect(enc.combat?.enemy.hp).toBeLessThan(enc.combat?.enemy.hpMax ?? 0)
    expect(enc.combat?.enemy.hpMax).toBe(first.enemy.hpMax)
    expect(enc.combat?.timeoutAt).toBe(rematchAt + combatTimeoutS(enc.enemyRank) * 1000)
  })

  it('falls back to full enemy hp if a loss left hp<=0', () => {
    const save = createSave()
    const worker = spawnWorker(save)
    const enc = testEnemy()
    putEnemy(save, enc)
    const now = 12_000
    const first = beginEnemyCombat(enc, [worker], now)
    first.enemy.hp = 0
    first.outcome = 'lose'
    const rematch = beginEnemyCombat(enc, [worker], now + 1_000)
    expect(rematch.enemy.hp).toBe(rematch.enemy.hpMax)
    expect(rematch.enemy.hp).toBe(enemyCombatStats(enc.quality, enc.enemyRank).hp)
  })
})

describe('rest heal', () => {
  it('heals only resting workers who are not fighting, +1 every 10s', () => {
    const save = createSave()
    const rest = spawnWorker(save)
    const busy = spawnWorkerWith(save, 1, 'artisan')
    const fight = spawnWorkerWith(save, 1, 'wanderer')
    assignWorker(save, busy.id, 'mining')
    rest.hp = 4
    busy.hp = 4
    fight.hp = 4
    const enc = testEnemy()
    putEnemy(save, enc)
    beginEnemyCombat(enc, [fight], 1_000)

    save.elapsedS = REST_HEAL_EVERY_S - 1
    applyRestHeal(save)
    expect(rest.hp).toBe(4)

    save.elapsedS = REST_HEAL_EVERY_S
    applyRestHeal(save)
    expect(rest.hp).toBe(5)
    expect(busy.hp).toBe(4)
    expect(fight.hp).toBe(4)

    const healed = ticks(save, REST_HEAL_EVERY_S, { now: 2_000 })
    const restAfter = healed.workers.find((w) => w.id === rest.id)
    expect(restAfter?.hp).toBeGreaterThan(5)
    const busyAfter = healed.workers.find((w) => w.id === busy.id)
    expect(busyAfter?.hp).toBe(4)
  })
})
