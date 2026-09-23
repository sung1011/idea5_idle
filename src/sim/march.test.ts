import { describe, expect, it } from 'vitest'
import { isWorkerInCombat, stepEnemyCombat } from './combat'
import { createSave } from './createSave'
import { claimLoot, reinforceCombat, startCombat } from './encounters'
import { marchDurationMs, marchDurationS } from './tech'
import { combatPhaseOf } from './march'
import { settleOffline } from './offline'
import { spawnWorkerWith } from './recruit'
import { attackIntervalMul } from './tech'
import { isWorkerInTreasureMine } from './treasureMineQuery'
import { startTreasureRaid, stepTreasureMines } from './treasureMine'
import type { EnemyEncounter, Save, TreasureMine } from './types'

function testEnemy(): EnemyEncounter {
  return {
    kind: 'enemy',
    id: 'march-enemy',
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
    targetRuleId: 'lowestHp',
  }
}

function put(save: Save, enc: EnemyEncounter) {
  save.encounters[0] = enc
  save.bank.meal = 4
}

function restingIds(save: Save): string[] {
  return save.workers
    .filter((worker) => worker.assignment === null && !isWorkerInCombat(save, worker.id) && !isWorkerInTreasureMine(save, worker.id))
    .map((worker) => worker.id)
}

function ensureGarrison(mine: TreasureMine): TreasureMine {
  mine.owner = 'shadow'
  mine.shadows = [
    {
      id: `${mine.id}-shadow`,
      name: '青石',
      level: 1,
      hp: 40,
      hpMax: 40,
      atk: 1,
      spd: 30,
      runeId: 'runeSharp',
    },
  ]
  return mine
}

describe('march duration', () => {
  it('cuts 5s per fast-relay level and floors at 8s without touching attack interval', () => {
    const save = createSave()
    expect(marchDurationS(save)).toBe(20)
    expect(marchDurationMs(save)).toBe(20_000)
    expect(attackIntervalMul(save)).toBe(1)

    save.techLevels = { rapidForm: 1 }
    save.unlockedTechIds = ['rapidForm']
    expect(marchDurationS(save)).toBe(20)
    expect(attackIntervalMul(save)).toBeCloseTo(0.9)

    save.techLevels = { fastRelay: 1 }
    save.unlockedTechIds = ['fastRelay']
    expect(marchDurationS(save)).toBe(15)
    expect(attackIntervalMul(save)).toBe(1)

    save.techLevels = { fastRelay: 3 }
    expect(marchDurationS(save)).toBe(8)
    save.techLevels = { fastRelay: 9 }
    expect(marchDurationS(save)).toBe(8)
  })
})

describe('combat march phases', () => {
  it('does not start the fight before the march ends, then starts on time', () => {
    const save = createSave()
    const worker = spawnWorkerWith(save, 1, 'laborer')
    const enc = testEnemy()
    put(save, enc)
    const now = 50_000
    expect(startCombat(save, 0, [worker.id], now).ok).toBe(true)
    expect(enc.combat?.phase).toBe('marchOut')
    expect(enc.combat?.workers).toEqual([])
    expect(restingIds(save)).not.toContain(worker.id)
    expect(isWorkerInCombat(save, worker.id)).toBe(true)

    stepEnemyCombat(save, enc, now + marchDurationMs(save) - 1)
    expect(combatPhaseOf(enc.combat)).toBe('marchOut')
    expect(enc.combat?.workers).toEqual([])
    expect(enc.combat?.logs.some((row) => row.text.includes('出战'))).toBe(false)

    stepEnemyCombat(save, enc, now + marchDurationMs(save))
    expect(combatPhaseOf(enc.combat)).toBe('fighting')
    expect(enc.combat?.workers.map((row) => row.id)).toEqual([worker.id])
    expect(enc.combat?.logs.some((row) => row.text.includes('出战'))).toBe(true)
    expect(restingIds(save)).not.toContain(worker.id)
  })

  it('keeps winners and losers out of rest until the return clock, and loot can be claimed early', () => {
    const save = createSave()
    const worker = spawnWorkerWith(save, 1, 'laborer')
    const enc = testEnemy()
    put(save, enc)
    const now = 80_000
    expect(startCombat(save, 0, [worker.id], now).ok).toBe(true)
    const marchEnd = now + marchDurationMs(save)
    stepEnemyCombat(save, enc, marchEnd)
    const combat = enc.combat
    expect(combat).toBeTruthy()
    if (!combat) return
    combat.enemy.hp = 0
    stepEnemyCombat(save, enc, marchEnd + 1)
    expect(combat.outcome).toBe('win')
    expect(combat.phase).toBe('marchHomeWin')
    expect(restingIds(save)).not.toContain(worker.id)
    expect(claimLoot(save, 0, marchEnd + 1).ok).toBe(true)
    expect(isWorkerInCombat(save, worker.id)).toBe(true)

    const homeAt = combat.phaseEndsAt ?? 0
    stepEnemyCombat(save, enc, homeAt - 1)
    expect(restingIds(save)).not.toContain(worker.id)
    stepEnemyCombat(save, enc, homeAt)
    expect(isWorkerInCombat(save, worker.id)).toBe(false)
    expect(restingIds(save)).toContain(worker.id)

    const loser = createSave()
    const tired = spawnWorkerWith(loser, 1, 'laborer')
    const lost = testEnemy()
    put(loser, lost)
    expect(startCombat(loser, 0, [tired.id], now).ok).toBe(true)
    const lostMarch = now + marchDurationMs(loser)
    stepEnemyCombat(loser, lost, lostMarch)
    const lostCombat = lost.combat
    expect(lostCombat).toBeTruthy()
    if (!lostCombat) return
    lostCombat.workers[0].nextActAt = lostCombat.timeoutAt + 5_000
    lostCombat.enemy.nextActAt = lostCombat.timeoutAt + 5_000
    stepEnemyCombat(loser, lost, lostCombat.timeoutAt)
    expect(lostCombat.outcome).toBe('lose')
    expect(lostCombat.phase).toBe('marchHomeLose')
    expect(restingIds(loser)).not.toContain(tired.id)
    const backAt = lostCombat.phaseEndsAt ?? 0
    stepEnemyCombat(loser, lost, backAt - 1)
    expect(isWorkerInCombat(loser, tired.id)).toBe(true)
    stepEnemyCombat(loser, lost, backAt)
    expect(isWorkerInCombat(loser, tired.id)).toBe(false)
    expect(restingIds(loser)).toContain(tired.id)
  })

  it('sends a downed fighter on the retreat clock and applies camp bandage only on arrival', () => {
    const save = createSave()
    save.techLevels = { rematchSupply: 1 }
    save.unlockedTechIds = ['rematchSupply']
    const front = spawnWorkerWith(save, 1, 'laborer')
    const enc = testEnemy()
    put(save, enc)
    const now = 90_000
    expect(startCombat(save, 0, [front.id], now).ok).toBe(true)
    const marchEnd = now + marchDurationMs(save)
    stepEnemyCombat(save, enc, marchEnd)
    const combat = enc.combat
    expect(combat).toBeTruthy()
    if (!combat) return
    combat.workers[0].hp = 1
    front.hp = 1
    combat.workers[0].nextActAt = marchEnd + 9_000
    combat.enemy.nextActAt = marchEnd + 1_000
    combat.enemy.atk = 3
    const hitAt = marchEnd + 1_000
    stepEnemyCombat(save, enc, hitAt)
    expect(combat.workers.find((row) => row.id === front.id)).toBeUndefined()
    expect(combat.returning?.some((row) => row.id === front.id && row.reason === 'down')).toBe(true)
    expect(front.hp).toBe(0)
    expect(restingIds(save)).not.toContain(front.id)
    expect(isWorkerInCombat(save, front.id)).toBe(true)
    const until = combat.returning?.find((row) => row.id === front.id)?.until ?? 0
    stepEnemyCombat(save, enc, until - 1)
    expect(front.hp).toBe(0)
    expect(restingIds(save)).not.toContain(front.id)
    stepEnemyCombat(save, enc, until)
    expect(front.hp).toBeGreaterThan(0)
    expect(isWorkerInCombat(save, front.id)).toBe(false)
    expect(restingIds(save)).toContain(front.id)
  })

  it('marches reinforcements and only rosters them on arrival', () => {
    const save = createSave()
    const front = spawnWorkerWith(save, 1, 'laborer')
    const bench = spawnWorkerWith(save, 1, 'wanderer')
    const enc = testEnemy()
    put(save, enc)
    const now = 100_000
    expect(startCombat(save, 0, [front.id], now).ok).toBe(true)
    const marchEnd = now + marchDurationMs(save)
    stepEnemyCombat(save, enc, marchEnd)
    expect(reinforceCombat(save, 0, [bench.id], marchEnd + 500).ok).toBe(true)
    expect(enc.combat?.workers.map((row) => row.id)).toEqual([front.id])
    expect(enc.combat?.incoming?.map((row) => row.id)).toEqual([bench.id])
    expect(restingIds(save)).not.toContain(bench.id)
    const arrives = enc.combat?.incoming?.[0]?.arrivesAt ?? 0
    stepEnemyCombat(save, enc, arrives - 1)
    expect(enc.combat?.workers.map((row) => row.id)).toEqual([front.id])
    stepEnemyCombat(save, enc, arrives)
    expect(enc.combat?.workers.map((row) => row.id)).toContain(bench.id)
    expect(enc.combat?.incoming ?? []).toEqual([])
  })

  it('jumps march, fight, and return in one step and via offline catch-up', () => {
    const save = createSave()
    const worker = spawnWorkerWith(save, 1, 'laborer')
    const enc = testEnemy()
    put(save, enc)
    const now = 200_000
    expect(startCombat(save, 0, [worker.id], now).ok).toBe(true)
    const far = now + (20 + 900 + 20) * 1000
    stepEnemyCombat(save, enc, far)
    expect(enc.combat?.outcome).toBe('lose')
    expect(combatPhaseOf(enc.combat)).toBe('settled')
    expect(isWorkerInCombat(save, worker.id)).toBe(false)
    expect(restingIds(save)).toContain(worker.id)

    const offlineSave = createSave()
    const traveler = spawnWorkerWith(offlineSave, 8, 'knight')
    const live = testEnemy()
    put(offlineSave, live)
    const t0 = 5_000_000
    expect(startCombat(offlineSave, 0, [traveler.id], t0).ok).toBe(true)
    offlineSave.lastTick = t0
    const caught = settleOffline(offlineSave, t0 + 25_000)
    const after = caught.save.encounters[0]
    expect(after.kind).toBe('enemy')
    if (after.kind !== 'enemy') return
    expect(combatPhaseOf(after.combat)).toBe('fighting')
    expect(after.combat?.workers.some((row) => row.id === traveler.id)).toBe(true)
    expect(isWorkerInCombat(caught.save, traveler.id)).toBe(true)
  })
})

describe('treasure raid march', () => {
  it('holds the hole through march and return, and one elapsed jump can cross every phase', () => {
    const save = createSave()
    const raider = spawnWorkerWith(save, 6, 'knight')
    raider.hp = raider.hpMax
    raider.fatigueDebt = 0
    const mine = ensureGarrison(save.treasureMines.mines[0])
    expect(startTreasureRaid(save, mine.id, [raider.id]).ok).toBe(true)
    expect(mine.raid?.phase).toBe('marchOut')
    expect(restingIds(save)).not.toContain(raider.id)
    const marchEnd = mine.raid?.phaseEndsAtS ?? 0
    save.elapsedS = marchEnd - 1
    stepTreasureMines(save)
    expect(mine.raid?.phase).toBe('marchOut')
    expect(mine.shadows[0].hp).toBe(40)

    save.elapsedS = marchEnd
    stepTreasureMines(save)
    expect(mine.raid?.phase).toBe('fighting')
    expect(mine.owner).toBe('shadow')
    expect(restingIds(save)).not.toContain(raider.id)

    const jumped = createSave()
    const winner = spawnWorkerWith(jumped, 8, 'knight')
    winner.hp = winner.hpMax
    winner.fatigueDebt = 0
    const hole = ensureGarrison(jumped.treasureMines.mines[0])
    hole.shadows[0].hp = 1
    hole.shadows[0].hpMax = 1
    hole.shadows[0].atk = 1
    hole.shadows[0].spd = 30
    expect(startTreasureRaid(jumped, hole.id, [winner.id]).ok).toBe(true)
    const started = jumped.elapsedS
    jumped.elapsedS = started + marchDurationS(jumped) + 40 + marchDurationS(jumped)
    stepTreasureMines(jumped)
    expect(hole.raid).toBeNull()
    expect(hole.owner).toBe('player')
    expect(hole.crewIds).toContain(winner.id)
    expect(isWorkerInTreasureMine(jumped, winner.id)).toBe(true)
  })
})
