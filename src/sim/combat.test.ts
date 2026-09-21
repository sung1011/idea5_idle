import { describe, expect, it } from 'vitest'
import {
  CLASS_COMBAT_MOD,
  BREAK_TIP,
  BREAK_VULN_MUL,
  COMBAT_PARTY_MAX,
  COMBAT_TIMEOUT_BY_RANK,
  COMBAT_TIMEOUT_S,
  ENEMY_COMBAT_BASE,
  ENEMY_SHIELD_COUNT,
  ENEMY_STUN_S,
  ENEMY_COMBAT_POWER_MUL,
  ENEMY_COMBAT_QUALITY_MUL,
  ENEMY_COMBAT_RANK_MUL,
  ENEMY_SPD_MAX_S,
  ENEMY_SPD_MIN_S,
  REST_HEAL_EVERY_S,
  WORKER_COMBAT_BY_TIER,
  applyRestHeal,
  beginEnemyCombat,
  canReinforceCombat,
  combatPartyBlockReason,
  combatTimeoutS,
  enemyStunMs,
  enemyCombatStats,
  isCombatStunned,
  rollEnemyShield,
  fieldFighterCount,
  fillWorkerHp,
  isCombatLost,
  isCombatWon,
  isFighting,
  isFullCombatHp,
  isWorkerInCombat,
  pickEnemyTarget,
  restCombatCandidates,
  selectableCombatWorkers,
  stepEnemyCombat,
  workerCombatStats,
} from './combat'
import { createSave } from './createSave'
import { loadFood } from './food'
import { claimLoot, reinforceCombat, startCombat } from './encounters'
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
    const leveled = workerCombatStats(1, 'laborer', 10)
    const base = workerCombatStats(1, 'laborer', 1)
    expect(leveled.hp).toBeGreaterThan(base.hp)
    expect(leveled.atk).toBeGreaterThan(base.atk)
    expect(leveled.spd).toBeLessThan(base.spd)
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
    expect(ENEMY_COMBAT_POWER_MUL).toEqual({ atk: 1.35, spd: 0.65 })
    expect(minion.atk).toBe(Math.max(1, Math.round(ENEMY_COMBAT_BASE.atk * ENEMY_COMBAT_POWER_MUL.atk)))
    expect(minion.spd).toBe(
      Math.min(
        ENEMY_SPD_MAX_S,
        Math.max(ENEMY_SPD_MIN_S, Math.round(ENEMY_COMBAT_BASE.spd * ENEMY_COMBAT_POWER_MUL.spd)),
      ),
    )
    expect(elite.atk).toBe(
      Math.max(1, Math.round(ENEMY_COMBAT_BASE.atk * ENEMY_COMBAT_RANK_MUL.elite.atk * ENEMY_COMBAT_POWER_MUL.atk)),
    )
    expect(elite.spd).toBe(
      Math.min(
        ENEMY_SPD_MAX_S,
        Math.max(
          ENEMY_SPD_MIN_S,
          Math.round(ENEMY_COMBAT_BASE.spd * ENEMY_COMBAT_RANK_MUL.elite.spd * ENEMY_COMBAT_POWER_MUL.spd),
        ),
      ),
    )
    expect(orange.atk).toBe(
      Math.max(
        1,
        Math.round(
          ENEMY_COMBAT_BASE.atk *
            ENEMY_COMBAT_QUALITY_MUL.orange *
            ENEMY_COMBAT_RANK_MUL.boss.atk *
            ENEMY_COMBAT_POWER_MUL.atk,
        ),
      ),
    )
    const rawBossSpd = Math.round(
      ENEMY_COMBAT_BASE.spd * ENEMY_COMBAT_RANK_MUL.boss.spd * ENEMY_COMBAT_POWER_MUL.spd,
    )
    expect(rawBossSpd).toBeGreaterThan(ENEMY_SPD_MAX_S)
    expect(orange.spd).toBe(ENEMY_SPD_MAX_S)
    for (const stats of [minion, elite, orange]) {
      expect(stats.spd).toBeGreaterThanOrEqual(ENEMY_SPD_MIN_S)
      expect(stats.spd).toBeLessThanOrEqual(ENEMY_SPD_MAX_S)
    }
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
  it('only lists full-HP resting workers and rejects stationed, fighting, or not-full', () => {
    const save = createSave()
    const a = spawnWorker(save)
    const b = spawnWorkerWith(save, 1, 'artisan')
    const c = spawnWorkerWith(save, 1, 'wanderer')
    const d = spawnWorkerWith(save, 1, 'miner')
    const e = spawnWorkerWith(save, 1, 'cook')
    assignWorker(save, b.id, 'mining')
    c.hp = 0
    d.hp = Math.max(1, d.hpMax - 1)
    e.fatigueDebt = 0.2
    putEnemy(save, testEnemy())
    stock(save)

    expect(restCombatCandidates(save).map((w) => w.id)).toEqual([a.id, c.id, d.id, e.id])
    expect(selectableCombatWorkers(save).map((w) => w.id)).toEqual([a.id])
    expect(isFullCombatHp(a)).toBe(true)
    expect(isFullCombatHp(d)).toBe(false)
    expect(isFullCombatHp(e)).toBe(false)
    expect(combatPartyBlockReason(save, [b.id])).toContain('不在休息')
    expect(combatPartyBlockReason(save, [c.id])).toContain('未满血')
    expect(combatPartyBlockReason(save, [d.id])).toContain('未满血')
    expect(combatPartyBlockReason(save, [e.id])).toContain('未满血')
    expect(combatPartyBlockReason(save, [])).toBe('请选择出战工人')
    expect(combatPartyBlockReason(save, [a.id, a.id])).toContain('重复')
    expect(combatPartyBlockReason(save, [a.id, c.id, d.id, e.id])).toContain(`最多选 ${COMBAT_PARTY_MAX}`)

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
    expect(enc.combat?.workers.some((w) => w.hp < w.hpMax)).toBe(true)

    stepEnemyCombat(save, enc, now + 5_000)
    expect(enc.combat?.enemy.hp).toBeLessThan(enc.combat?.enemy.hpMax ?? 0)

    stepEnemyCombat(save, enc, now + 32_000)
    expect(enc.combat?.workers.some((w) => w.hp < w.hpMax)).toBe(true)
    expect(a.hp).toBe(enc.combat?.workers.find((w) => w.id === a.id)?.hp)
    expect(b.hp).toBe(enc.combat?.workers.find((w) => w.id === b.id)?.hp)

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
    const enc = testEnemy({ targetRuleId: 'lowestHp' })
    putEnemy(save, enc)
    const now = 20_000
    const combat = beginEnemyCombat(enc, [a, b], now)
    combat.workers[0].hp = 20
    combat.workers[1].hp = 8
    a.hp = 20
    b.hp = 8
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
    expect(b.hp).toBe(combat.workers[1].hp)
    expect(a.hp).toBe(combat.workers[0].hp)
  })

  it('writes enemy hits back to save.workers hp while the fight is still going', () => {
    const save = createSave()
    const worker = spawnWorkerWith(save, 1, 'laborer')
    const enc = testEnemy({ targetRuleId: 'lowestHp' })
    putEnemy(save, enc)
    const now = 20_000
    const combat = beginEnemyCombat(enc, [worker], now)
    const startHp = worker.hp
    combat.workers[0].nextActAt = now + 9_000
    combat.enemy.nextActAt = now + 1_000
    stepEnemyCombat(save, enc, now + 1_000)
    expect(isFighting(enc)).toBe(true)
    expect(combat.outcome).toBeNull()
    expect(combat.workers[0].hp).toBe(startHp - combat.enemy.atk)
    expect(worker.hp).toBe(combat.workers[0].hp)
    expect(worker.hp).toBeLessThan(startHp)

    save.elapsedS = REST_HEAL_EVERY_S
    applyRestHeal(save)
    expect(worker.hp).toBe(combat.workers[0].hp)
  })

  it('times out as a loss, writes wounds, and a later start is a fresh full-HP fight', () => {
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

    worker.hp = worker.hpMax
    worker.fatigueDebt = 0
    const restartAt = combat.timeoutAt + 1_000
    const restart = startCombat(save, 0, [worker.id], restartAt)
    expect(restart.ok).toBe(true)
    expect(save.bank.meal).toBe(2)
    expect(isFighting(enc)).toBe(true)
    expect(enc.combat?.enemy.hp).toBe(enc.combat?.enemy.hpMax)
    expect(enc.combat?.enemy.hp).toBe(enemyCombatStats(enc.quality, enc.enemyRank).hp)
    expect(enc.combat?.startedAt).toBe(restartAt)
    expect(enc.combat?.timeoutAt).toBe(restartAt + combatTimeoutS(enc.enemyRank) * 1000)
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
    enc.targetRuleId = 'lowestHp'
    const combat = beginEnemyCombat(enc, party, now)
    expect(combat.timeoutAt - combat.startedAt).toBe(combatTimeoutS(enc.enemyRank) * 1000)
    stepEnemyCombat(save, enc, combat.timeoutAt)
    return { combat, elapsedS: combatElapsedS(combat) }
  }

  it('makes a faster harder minion drop two mid workers before they finish', () => {
    const enc = testEnemy({
      quality: 'green',
      enemyRank: 'minion',
      weaknesses: ['fire', 'ice'],
      revealedWeaknesses: [],
    })
    const { combat } = run(enc, noMatch)
    expect(combat.enemy.atk).toBe(enemyCombatStats('green', 'minion').atk)
    expect(combat.enemy.spd).toBe(enemyCombatStats('green', 'minion').spd)
    expect(combat.outcome).toBe('lose')
    expect(combat.logs.some((row) => row.text.includes('超时') || row.text.includes('倒下'))).toBe(true)
    expect(combat.enemy.hp).toBeGreaterThan(0)
  })

  it('makes a faster harder elite drop two mid workers before they finish', () => {
    const enc = testEnemy({
      quality: 'green',
      enemyRank: 'elite',
      weaknesses: ['fire', 'ice', 'dark'],
      revealedWeaknesses: [],
    })
    const { combat } = run(enc, noMatch)
    expect(combat.enemy.atk).toBe(enemyCombatStats('green', 'elite').atk)
    expect(combat.enemy.spd).toBe(enemyCombatStats('green', 'elite').spd)
    expect(combat.outcome).toBe('lose')
    expect(combat.logs.some((row) => row.text.includes('超时') || row.text.includes('倒下'))).toBe(true)
    expect(combat.enemy.hp).toBeGreaterThan(0)
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

  it('still drops two mid workers on a boss even with a ×1.2 weakness', () => {
    const enc = testEnemy({
      quality: 'orange',
      enemyRank: 'boss',
      weaknesses: bossWeak,
      revealedWeaknesses: [],
    })
    const { combat } = run(enc, oneHit)
    expect(combat.enemy.atk).toBe(enemyCombatStats('orange', 'boss').atk)
    expect(combat.enemy.spd).toBe(enemyCombatStats('orange', 'boss').spd)
    expect(combat.outcome).toBe('lose')
    expect(combat.logs.some((row) => row.text.includes('超时') || row.text.includes('倒下'))).toBe(true)
    expect(combat.enemy.hp).toBeGreaterThan(0)
  })
})

describe('enemy opening strike', () => {
  it('hits once as soon as combat starts, then waits the interval', () => {
    const save = createSave()
    const worker = spawnWorkerWith(save, 1, 'laborer')
    const enc = testEnemy({ targetRuleId: 'lowestHp' })
    putEnemy(save, enc)
    const now = 40_000
    const startHp = worker.hp
    const combat = beginEnemyCombat(enc, [worker], now, 1, undefined, save)
    expect(combat.enemy.spd).toBeGreaterThanOrEqual(ENEMY_SPD_MIN_S)
    expect(combat.enemy.spd).toBeLessThanOrEqual(ENEMY_SPD_MAX_S)
    expect(combat.workers[0].hp).toBe(startHp - combat.enemy.atk)
    expect(worker.hp).toBe(combat.workers[0].hp)
    expect(combat.enemy.nextActAt).toBe(now + combat.enemy.spd * 1000)
    const afterOpen = worker.hp
    const hits = () => combat.logs.filter((row) => row.text.startsWith('试敌 对') && row.text.includes('造成'))
    expect(hits()).toHaveLength(1)
    stepEnemyCombat(save, enc, now + combat.enemy.spd * 1000 - 1)
    expect(worker.hp).toBe(afterOpen)
    expect(hits()).toHaveLength(1)
    stepEnemyCombat(save, enc, now + combat.enemy.spd * 1000)
    expect(worker.hp).toBe(afterOpen - combat.enemy.atk)
    expect(hits()).toHaveLength(2)
  })

  it('starts a later fight at full enemy hp and does not double the opening hit', () => {
    const save = createSave()
    const worker = spawnWorkerWith(save, 1, 'laborer')
    const enc = testEnemy({ needs: { meal: 1 }, targetRuleId: 'lowestHp' })
    putEnemy(save, enc)
    save.bank.meal = 4
    const now = 50_000
    expect(startCombat(save, 0, [worker.id], now).ok).toBe(true)
    const first = enc.combat
    expect(first).toBeTruthy()
    if (!first) return
    const leftoverHp = Math.max(1, first.enemy.hpMax - 44)
    first.enemy.hp = leftoverHp
    first.outcome = 'lose'
    worker.hp = worker.hpMax
    worker.fatigueDebt = 0
    const restartAt = now + 8_000
    expect(startCombat(save, 0, [worker.id], restartAt).ok).toBe(true)
    expect(enc.combat?.enemy.hp).toBe(enc.combat?.enemy.hpMax)
    expect(enc.combat?.enemy.hp).toBeGreaterThan(leftoverHp)
    expect(worker.hp).toBe(worker.hpMax - (enc.combat?.enemy.atk ?? 0))
    const restartHits = enc.combat?.logs.filter((row) => row.text.startsWith('试敌 对') && row.text.includes('造成')) ?? []
    expect(restartHits).toHaveLength(1)
  })
})

describe('fresh start after a loss', () => {
  it('starts the first fight at full enemy hp', () => {
    const save = createSave()
    const worker = spawnWorker(save)
    const enc = testEnemy()
    putEnemy(save, enc)
    const combat = beginEnemyCombat(enc, [worker], 10_000)
    expect(combat.enemy.hp).toBe(combat.enemy.hpMax)
    expect(combat.enemy.hp).toBe(enemyCombatStats(enc.quality, enc.enemyRank).hp)
  })

  it('resets leftover enemy hp when starting again after a loss', () => {
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
    worker.hp = worker.hpMax
    worker.fatigueDebt = 0

    const restartAt = now + 8_000
    expect(startCombat(save, 0, [worker.id], restartAt).ok).toBe(true)
    expect(enc.combat?.enemy.hp).toBe(enc.combat?.enemy.hpMax)
    expect(enc.combat?.enemy.hp).toBeGreaterThan(leftoverHp)
    expect(enc.combat?.timeoutAt).toBe(restartAt + combatTimeoutS(enc.enemyRank) * 1000)
  })

  it('still starts at full enemy hp if a loss left hp<=0', () => {
    const save = createSave()
    const worker = spawnWorker(save)
    const enc = testEnemy()
    putEnemy(save, enc)
    const now = 12_000
    const first = beginEnemyCombat(enc, [worker], now)
    first.enemy.hp = 0
    first.outcome = 'lose'
    const restart = beginEnemyCombat(enc, [worker], now + 1_000)
    expect(restart.enemy.hp).toBe(restart.enemy.hpMax)
    expect(restart.enemy.hp).toBe(enemyCombatStats(enc.quality, enc.enemyRank).hp)
  })
})

describe('rest heal', () => {
  it('heals only resting workers who are not fighting, every 10s by hpMax ratio', () => {
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
    if (enc.combat) enc.combat.enemy.nextActAt = 1_000 + 60_000

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
    const fightAfter = healed.workers.find((w) => w.id === fight.id)
    expect(fightAfter?.hp).toBe(4)
  })

  it('pays down rest fatigue so effective HP can return to full', () => {
    const save = createSave()
    const worker = spawnWorker(save)
    worker.hp = worker.hpMax
    worker.fatigueDebt = 0.4
    expect(isFullCombatHp(worker)).toBe(false)
    save.elapsedS = REST_HEAL_EVERY_S
    applyRestHeal(save)
    expect(worker.fatigueDebt).toBe(0)
    expect(worker.hp).toBe(worker.hpMax)
    expect(isFullCombatHp(worker)).toBe(true)
  })
})

describe('enemy hits workshop crew', () => {
  it('damages stationed workers, skips rest, and locks workshop hp at 1', () => {
    const save = createSave()
    const front = spawnWorkerWith(save, 1, 'laborer')
    const shop = spawnWorkerWith(save, 1, 'miner')
    const rest = spawnWorkerWith(save, 1, 'wanderer')
    front.name = '出战甲'
    shop.name = '在岗乙'
    rest.name = '休息丙'
    assignWorker(save, shop.id, 'mining')
    const enc = testEnemy({ targetRuleId: 'all' })
    putEnemy(save, enc)
    const now = 50_000
    const combat = beginEnemyCombat(enc, [front], now)
    const frontHp = combat.workers[0].hp
    const shopHp = shop.hp
    const restHp = rest.hp
    combat.workers[0].nextActAt = now + 9_000
    combat.enemy.nextActAt = now + 1_000
    stepEnemyCombat(save, enc, now + 1_000)
    expect(combat.workers[0].hp).toBe(frontHp - combat.enemy.atk)
    expect(front.hp).toBe(combat.workers[0].hp)
    expect(shop.hp).toBe(shopHp - combat.enemy.atk)
    expect(shop.assignment).toBe('mining')
    expect(rest.hp).toBe(restHp)
    expect(enc.combat?.logs.some((row) => row.text.includes('工坊'))).toBe(true)

    shop.hp = 2
    combat.enemy.nextActAt = now + 33_000
    combat.workers[0].nextActAt = now + 40_000
    stepEnemyCombat(save, enc, now + 33_000)
    expect(shop.hp).toBe(1)
    expect(shop.assignment).toBe('mining')
  })

  it('auto-eats workshop food when a hit leaves residual HP', () => {
    const save = createSave()
    const front = spawnWorkerWith(save, 1, 'laborer')
    const shop = spawnWorkerWith(save, 1, 'miner')
    assignWorker(save, shop.id, 'mining')
    save.bank.meal = 2
    const t0 = 60_000
    expect(loadFood(save, shop.id, 'meal', 2, t0).ok).toBe(true)
    shop.hp = 3
    const enc = testEnemy({ targetRuleId: 'workshopBias' })
    putEnemy(save, enc)
    const combat = beginEnemyCombat(enc, [front], t0)
    combat.workers[0].nextActAt = t0 + 9_000
    combat.enemy.nextActAt = t0 + 1_000
    combat.enemy.atk = 2
    stepEnemyCombat(save, enc, t0 + 1_000)
    expect(shop.hp).toBeGreaterThan(1)
    expect(shop.foodSlot?.qty).toBe(0)
    expect(shop.assignment).toBe('mining')
    expect(combat.workers[0].hp).toBe(combat.workers[0].hpMax)
  })
})

describe('combat food heal', () => {
  it('auto-eats one food after settlement when residual HP ≤30%', () => {
    const save = createSave()
    const worker = spawnWorker(save)
    save.bank.meal = 2
    const t0 = 20_000
    expect(loadFood(save, worker.id, 'meal', 2, t0).ok).toBe(true)
    worker.hpMax = 100
    worker.hp = 25
    const enc = testEnemy()
    putEnemy(save, enc)
    beginEnemyCombat(enc, [worker], t0)
    if (enc.combat) {
      enc.combat.workers[0].hp = 25
      enc.combat.workers[0].hpMax = 100
      enc.combat.enemy.hp = 0
    }
    stepEnemyCombat(save, enc, t0 + 1_000)
    expect(isCombatWon(enc)).toBe(true)
    expect(worker.hp).toBe(25 + Math.ceil(100 * 0.25))
    expect(worker.foodSlot?.qty).toBe(0)
  })
})

describe('death leave and reinforce', () => {
  it('sends a downed fighter back to rest and keeps the fight going', () => {
    const save = createSave()
    const front = spawnWorkerWith(save, 1, 'laborer')
    const bench = spawnWorkerWith(save, 1, 'wanderer')
    front.name = '出战甲'
    bench.name = '休息乙'
    const enc = testEnemy({ needs: { meal: 1 }, targetRuleId: 'lowestHp' })
    putEnemy(save, enc)
    save.bank.meal = 4
    const now = 80_000
    expect(startCombat(save, 0, [front.id], now).ok).toBe(true)
    expect(save.bank.meal).toBe(3)
    const combat = enc.combat
    expect(combat).toBeTruthy()
    if (!combat) return
    combat.workers[0].hp = 1
    front.hp = 1
    combat.workers[0].nextActAt = now + 9_000
    combat.enemy.nextActAt = now + 1_000
    combat.enemy.atk = 3
    stepEnemyCombat(save, enc, now + 1_000)
    expect(isFighting(enc)).toBe(true)
    expect(combat.outcome).toBeNull()
    expect(combat.workers.find((w) => w.id === front.id)).toBeUndefined()
    expect(isWorkerInCombat(save, front.id)).toBe(false)
    expect(front.assignment).toBeNull()
    expect(front.hp).toBe(0)
    expect(fieldFighterCount(enc)).toBe(0)
    expect(canReinforceCombat(enc)).toBe(true)
    expect(combat.logs.some((row) => row.text.includes('倒下，返回休息'))).toBe(true)

    expect(reinforceCombat(save, 0, [bench.id], now + 2_000).ok).toBe(true)
    expect(save.bank.meal).toBe(3)
    expect(combat.workers.map((w) => w.id)).toEqual([bench.id])
    expect(combat.workerIds).toEqual([front.id, bench.id])
    expect(isWorkerInCombat(save, bench.id)).toBe(true)
    expect(combat.logs.some((row) => row.text.includes('增援'))).toBe(true)
  })

  it('lets a healed worker reinforce the same ongoing fight', () => {
    const save = createSave()
    const a = spawnWorkerWith(save, 1, 'laborer')
    const b = spawnWorkerWith(save, 1, 'wanderer')
    a.name = '甲'
    b.name = '乙'
    const enc = testEnemy({ needs: { meal: 1 }, targetRuleId: 'lowestHp' })
    putEnemy(save, enc)
    save.bank.meal = 2
    const now = 90_000
    expect(startCombat(save, 0, [a.id], now).ok).toBe(true)
    const combat = enc.combat
    expect(combat).toBeTruthy()
    if (!combat) return
    combat.workers[0].hp = 0
    a.hp = 0
    stepEnemyCombat(save, enc, now + 1)
    expect(isFighting(enc)).toBe(true)
    expect(isWorkerInCombat(save, a.id)).toBe(false)
    expect(reinforceCombat(save, 0, [a.id], now + 2).ok).toBe(false)

    a.hp = a.hpMax
    a.fatigueDebt = 0
    const revealed = [...enc.revealedWeaknesses]
    expect(reinforceCombat(save, 0, [a.id], now + 3).ok).toBe(true)
    expect(combat.workers.some((w) => w.id === a.id && w.hp === w.hpMax)).toBe(true)
    expect(isWorkerInCombat(save, a.id)).toBe(true)
    expect(enc.revealedWeaknesses).toEqual(revealed)

    expect(reinforceCombat(save, 0, [a.id], now + 4).ok).toBe(false)
    expect(startCombat(save, 0, [b.id], now + 5).ok).toBe(false)
    expect(save.bank.meal).toBe(1)
  })

  it('blocks reinforce when the field is already full', () => {
    const save = createSave()
    const party = [
      spawnWorkerWith(save, 1, 'laborer'),
      spawnWorkerWith(save, 1, 'artisan'),
      spawnWorkerWith(save, 1, 'wanderer'),
    ]
    const extra = spawnWorkerWith(save, 1, 'miner')
    const enc = testEnemy({ needs: { meal: 1 } })
    putEnemy(save, enc)
    save.bank.meal = 2
    expect(startCombat(save, 0, party.map((w) => w.id), 1_000).ok).toBe(true)
    expect(fieldFighterCount(enc)).toBe(3)
    expect(canReinforceCombat(enc)).toBe(false)
    expect(reinforceCombat(save, 0, [extra.id], 2_000).ok).toBe(false)
    expect(save.bank.meal).toBe(1)
  })
})

describe('weakness break shields', () => {
  it('rolls shield by rank and keeps the fight-start max', () => {
    expect(ENEMY_SHIELD_COUNT).toEqual({
      minion: { min: 2, max: 3 },
      elite: { min: 4, max: 5 },
      boss: { min: 6, max: 8 },
    })
    expect(ENEMY_STUN_S).toEqual({ minion: 3, elite: 4, boss: 5 })
    expect(rollEnemyShield('minion', () => 0)).toBe(2)
    expect(rollEnemyShield('minion', () => 0.99)).toBe(3)
    expect(rollEnemyShield('elite', () => 0)).toBe(4)
    expect(rollEnemyShield('elite', () => 0.99)).toBe(5)
    expect(rollEnemyShield('boss', () => 0)).toBe(6)
    expect(rollEnemyShield('boss', () => 0.99)).toBe(8)
    expect(enemyStunMs('minion')).toBe(3_000)
    expect(enemyStunMs('elite')).toBe(4_000)
    expect(enemyStunMs('boss')).toBe(5_000)

    const save = createSave()
    const worker = spawnWorker(save)
    const minion = testEnemy({ enemyRank: 'minion' })
    const elite = testEnemy({ id: 'elite-enemy', enemyRank: 'elite', quality: 'purple' })
    const boss = testEnemy({ id: 'boss-enemy', enemyRank: 'boss', quality: 'orange' })
    const now = 10_000
    const minionCombat = beginEnemyCombat(minion, [worker], now)
    const eliteCombat = beginEnemyCombat(elite, [worker], now)
    const bossCombat = beginEnemyCombat(boss, [worker], now)
    expect(minionCombat.shieldMax).toBeGreaterThanOrEqual(2)
    expect(minionCombat.shieldMax).toBeLessThanOrEqual(3)
    expect(minionCombat.shield).toBe(minionCombat.shieldMax)
    expect(eliteCombat.shieldMax).toBeGreaterThanOrEqual(4)
    expect(eliteCombat.shieldMax).toBeLessThanOrEqual(5)
    expect(bossCombat.shieldMax).toBeGreaterThanOrEqual(6)
    expect(bossCombat.shieldMax).toBeLessThanOrEqual(8)
    expect(minionCombat.stunnedUntil).toBeNull()
  })

  it('deducts one shield per unique matched attr in that strike', () => {
    const save = createSave()
    const worker = spawnWorkerWith(save, 5, 'artisan', ['fire', 'ice', 'fire'])
    const enc = testEnemy({ weaknesses: ['fire', 'ice'], revealedWeaknesses: ['fire', 'ice'] })
    putEnemy(save, enc)
    const now = 20_000
    const combat = beginEnemyCombat(enc, [worker], now)
    combat.shieldMax = 5
    combat.shield = 5
    combat.stunnedUntil = null
    combat.workers[0].nextActAt = now + 1_000
    combat.enemy.nextActAt = now + 9_000
    stepEnemyCombat(save, enc, now + 1_000)
    expect(combat.shield).toBe(3)
    expect(isCombatStunned(combat, now + 1_000)).toBe(false)
    expect(combat.logs.some((row) => row.text === BREAK_TIP)).toBe(false)
  })

  it('reveals an unrevealed match then deducts on the same strike', () => {
    const save = createSave()
    const worker = spawnWorkerWith(save, 5, 'artisan', ['dark'])
    const enc = testEnemy({
      weaknesses: ['fire', 'dark'],
      revealedWeaknesses: ['fire'],
    })
    putEnemy(save, enc)
    const now = 30_000
    const combat = beginEnemyCombat(enc, [worker], now)
    enc.revealedWeaknesses = ['fire']
    combat.shieldMax = 4
    combat.shield = 4
    combat.stunnedUntil = null
    combat.workers[0].nextActAt = now + 1_000
    combat.enemy.nextActAt = now + 9_000
    stepEnemyCombat(save, enc, now + 1_000)
    expect(enc.revealedWeaknesses).toEqual(['fire', 'dark'])
    expect(combat.shield).toBe(3)
    expect(combat.logs.some((row) => row.text.includes('揭示弱点：暗'))).toBe(true)
  })

  it('does not deduct shield on a miss', () => {
    const save = createSave()
    const worker = spawnWorkerWith(save, 5, 'artisan', ['bow'])
    worker.combatAttrs = ['bow']
    const enc = testEnemy({ weaknesses: ['fire', 'ice'], revealedWeaknesses: ['fire'] })
    putEnemy(save, enc)
    const now = 40_000
    const combat = beginEnemyCombat(enc, [worker], now)
    combat.workers[0].combatAttrs = ['bow']
    combat.shieldMax = 3
    combat.shield = 3
    combat.stunnedUntil = null
    combat.workers[0].nextActAt = now + 1_000
    combat.enemy.nextActAt = now + 9_000
    const hp0 = combat.enemy.hp
    stepEnemyCombat(save, enc, now + 1_000)
    expect(combat.shield).toBe(3)
    expect(combat.enemy.hp).toBe(hp0 - combat.workers[0].atk)
    expect(isCombatStunned(combat, now + 1_000)).toBe(false)
  })

  it('stuns for rank duration, applies vuln, and floats 破防！', () => {
    const cases: { rank: 'minion' | 'elite' | 'boss'; quality: 'green' | 'purple' | 'orange' }[] = [
      { rank: 'minion', quality: 'green' },
      { rank: 'elite', quality: 'purple' },
      { rank: 'boss', quality: 'orange' },
    ]
    for (const { rank, quality } of cases) {
      const save = createSave()
      const worker = spawnWorkerWith(save, 5, 'artisan', ['fire'])
      worker.name = '甲'
      const enc = testEnemy({
        id: `break-${rank}`,
        quality,
        enemyRank: rank,
        weaknesses: ['fire'],
        revealedWeaknesses: ['fire'],
      })
      putEnemy(save, enc)
      const now = 50_000
      const combat = beginEnemyCombat(enc, [worker], now)
      combat.shieldMax = 1
      combat.shield = 1
      combat.stunnedUntil = null
      combat.workers[0].nextActAt = now + 1_000
      combat.enemy.nextActAt = now + 20_000
      const hp0 = combat.enemy.hp
      stepEnemyCombat(save, enc, now + 1_000)
      expect(combat.shield).toBe(0)
      expect(combat.stunnedUntil).toBe(now + 1_000 + enemyStunMs(rank))
      expect(isCombatStunned(combat, now + 1_000)).toBe(true)
      expect(isCombatStunned(combat, combat.stunnedUntil! - 1)).toBe(true)
      expect(isCombatStunned(combat, combat.stunnedUntil!)).toBe(false)
      expect(combat.logs.some((row) => row.text === BREAK_TIP)).toBe(true)
      expect(combat.enemy.hp).toBe(hp0 - Math.round(combat.workers[0].atk * 1.2 * BREAK_VULN_MUL))
      expect(combat.enemy.nextActAt).toBeGreaterThanOrEqual(combat.stunnedUntil ?? 0)
    }
  })

  it('does not deduct while stunned and resets shield after stun ends', () => {
    const save = createSave()
    const worker = spawnWorkerWith(save, 5, 'artisan', ['fire'])
    const enc = testEnemy({ weaknesses: ['fire'], revealedWeaknesses: ['fire'] })
    putEnemy(save, enc)
    const now = 60_000
    const combat = beginEnemyCombat(enc, [worker], now)
    combat.shieldMax = 2
    combat.shield = 2
    combat.stunnedUntil = null
    combat.workers[0].nextActAt = now + 1_000
    combat.enemy.nextActAt = now + 30_000
    stepEnemyCombat(save, enc, now + 1_000)
    expect(combat.shield).toBe(1)

    combat.workers[0].nextActAt = now + 2_000
    stepEnemyCombat(save, enc, now + 2_000)
    expect(combat.shield).toBe(0)
    expect(combat.logs.filter((row) => row.text === BREAK_TIP)).toHaveLength(1)
    const stunUntil = combat.stunnedUntil
    expect(stunUntil).toBe(now + 2_000 + enemyStunMs('minion'))

    combat.workers[0].nextActAt = now + 3_000
    const hpBeforeStunHit = combat.enemy.hp
    stepEnemyCombat(save, enc, now + 3_000)
    expect(combat.shield).toBe(0)
    expect(isCombatStunned(combat, now + 3_000)).toBe(true)
    expect(combat.enemy.hp).toBe(hpBeforeStunHit - Math.round(combat.workers[0].atk * 1.2 * BREAK_VULN_MUL))
    expect(combat.logs.filter((row) => row.text === BREAK_TIP)).toHaveLength(1)
    expect(combat.enemy.nextActAt).toBeGreaterThanOrEqual(stunUntil ?? 0)

    stepEnemyCombat(save, enc, stunUntil! - 1)
    expect(combat.shield).toBe(0)
    expect(combat.stunnedUntil).toBe(stunUntil)

    combat.workers[0].nextActAt = stunUntil! + 1_000
    combat.enemy.nextActAt = stunUntil! + 8_000
    stepEnemyCombat(save, enc, stunUntil!)
    expect(combat.shield).toBe(2)
    expect(combat.shieldMax).toBe(2)
    expect(combat.stunnedUntil).toBeNull()
    expect(isCombatStunned(combat, stunUntil!)).toBe(false)
  })

  it('fills missing shield fields on an old mid-fight save', () => {
    const save = createSave()
    const worker = spawnWorker(save)
    const enc = testEnemy()
    putEnemy(save, enc)
    const now = 70_000
    const combat = beginEnemyCombat(enc, [worker], now)
    delete combat.shieldMax
    delete combat.shield
    delete combat.stunnedUntil
    combat.workers[0].nextActAt = now + 9_000
    combat.enemy.nextActAt = now + 8_000
    stepEnemyCombat(save, enc, now + 1)
    expect(combat.shieldMax).toBeGreaterThanOrEqual(2)
    expect(combat.shieldMax).toBeLessThanOrEqual(3)
    expect(combat.shield).toBe(combat.shieldMax)
  })
})
