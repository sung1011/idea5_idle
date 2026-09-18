import { describe, expect, it } from 'vitest'
import {
  ASSIST_WORKER_ID,
  createAssistWorker,
  findCombatPartyWorker,
  isAssistWorker,
  pickCombatCandidates,
  playerAssistCaps,
} from './combatAssist'
import { combatPartyBlockReason } from './combat'
import { createSave } from './createSave'
import { claimLoot, startCombat } from './encounters'
import { spawnWorker, spawnWorkerWith } from './recruit'
import { QUALITY_MIN } from './tables'
import type { EnemyEncounter, Save, Worker } from './types'
import { WORKER_LEVEL_MIN, workerLootXp } from './workerLevel'

function seqRoll(values: number[]): () => number {
  let i = 0
  return () => {
    const v = values[Math.min(i, values.length - 1)] ?? 0
    i += 1
    return v
  }
}

function testEnemy(overrides: Partial<EnemyEncounter> = {}): EnemyEncounter {
  return {
    kind: 'enemy',
    id: 'assist-enemy',
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

function stock(save: Save) {
  save.bank.meal = 8
}

function putEnemy(save: Save, enc: EnemyEncounter) {
  save.encounters[0] = enc
}

describe('combat assist invite', () => {
  it('does not appear until created, then pins to the top of the pick list', () => {
    const save = createSave()
    const a = spawnWorker(save)
    const rest = [a]
    expect(pickCombatCandidates(rest).map((w) => w.id)).toEqual([a.id])
    expect(pickCombatCandidates(rest, null).map((w) => w.id)).toEqual([a.id])
    const assist = createAssistWorker(save, seqRoll([0, 0, 0, 0, 0]))
    expect(isAssistWorker(assist)).toBe(true)
    expect(pickCombatCandidates(rest, assist).map((w) => w.id)).toEqual([ASSIST_WORKER_ID, a.id])
  })

  it('rolls quality and level within the current roster caps and never writes the roster', () => {
    const save = createSave()
    const low = spawnWorker(save)
    const high = spawnWorkerWith(save, 5, 'cook')
    high.level = 7
    const nextId = save.nextWorkerId
    const rosterSize = save.workers.length
    const rng = save.rngState
    const caps = playerAssistCaps(save)
    expect(caps).toEqual({ maxQuality: 5, maxLevel: 7 })

    const minAssist = createAssistWorker(save, seqRoll([0, 0, 0, 0, 0, 0]))
    expect(minAssist.qualityTier).toBe(QUALITY_MIN)
    expect(minAssist.level).toBe(WORKER_LEVEL_MIN)
    expect(minAssist.guest).toBe(true)
    expect(minAssist.id).toBe(ASSIST_WORKER_ID)
    expect(minAssist.name?.startsWith('助战·')).toBe(true)

    const maxAssist = createAssistWorker(save, seqRoll([0.999, 0.999, 0.999, 0.999, 0.999]))
    expect(maxAssist.qualityTier).toBe(5)
    expect(maxAssist.level).toBe(7)

    expect(save.workers).toHaveLength(rosterSize)
    expect(save.workers.every((w) => !isAssistWorker(w))).toBe(true)
    expect(save.nextWorkerId).toBe(nextId)
    expect(save.rngState).toBe(rng)
    expect(low.id).not.toBe(ASSIST_WORKER_ID)
  })

  it('replaces the same single guest slot and looks up guests without touching save.workers', () => {
    const save = createSave()
    spawnWorker(save)
    const high = spawnWorkerWith(save, 4, 'hunter')
    high.level = 5
    const first = createAssistWorker(save, seqRoll([0, 0, 0, 0, 0]))
    const second = createAssistWorker(save, seqRoll([0.999, 0.999, 0.999, 0.999, 0.999]))
    expect(first.id).toBe(second.id)
    expect(second.qualityTier).not.toBe(first.qualityTier)
    expect(findCombatPartyWorker(save, ASSIST_WORKER_ID)).toBeUndefined()
    expect(findCombatPartyWorker(save, ASSIST_WORKER_ID, [second])).toBe(second)
    expect(combatPartyBlockReason(save, [ASSIST_WORKER_ID])).toBe('没有这个工人')
    expect(combatPartyBlockReason(save, [ASSIST_WORKER_ID], [second])).toBeNull()
  })

  it('can start a fight with the guest, then skips persist xp and roster write-back', () => {
    const save = createSave()
    const own = spawnWorker(save)
    own.xp = 0
    const assist = createAssistWorker(save, seqRoll([0, 0, 0, 0, 0]))
    putEnemy(save, testEnemy())
    stock(save)
    const rosterIds = save.workers.map((w) => w.id)

    expect(startCombat(save, 0, [own.id, assist.id], 1_000, undefined, [assist]).ok).toBe(true)
    const enc = save.encounters[0] as EnemyEncounter
    expect(enc.combat?.workerIds).toEqual([own.id, assist.id])
    expect(save.workers.map((w) => w.id)).toEqual(rosterIds)
    expect(save.workers.some((w) => isAssistWorker(w))).toBe(false)

    enc.combat!.outcome = 'win'
    enc.combat!.enemy.hp = 0
    const xpBefore = own.xp
    expect(claimLoot(save, 0).ok).toBe(true)
    expect(own.xp).toBe(xpBefore + workerLootXp('minion', 1))
    expect(save.workers).toHaveLength(1)
    expect(findCombatPartyWorker(save, ASSIST_WORKER_ID)).toBeUndefined()
  })

  it('lets the guest fight alone without joining the roster', () => {
    const save = createSave()
    spawnWorkerWith(save, 3, 'wanderer')
    const assist = createAssistWorker(save, seqRoll([0.5, 0.5, 0.5, 0.5, 0.5]))
    putEnemy(save, testEnemy())
    stock(save)
    expect(startCombat(save, 0, [assist.id], 2_000, undefined, [assist]).ok).toBe(true)
    expect(save.workers).toHaveLength(1)
    expect(isAssistWorker(save.workers[0] as Worker)).toBe(false)
  })
})
