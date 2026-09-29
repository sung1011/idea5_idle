import { describe, expect, it } from 'vitest'
import { CAMP_DISPATCH_LABEL, campDispatchEntries, campDockCount, campDockTone, campQueueBlocked } from './campDock'
import { createSave } from './createSave'
import type { EnemyEncounter, HerbPvpState, Save, TreasureMine, Worker } from './types'

function worker(patch: Partial<Worker> & Pick<Worker, 'id'>): Worker {
  return {
    assignment: null,
    qualityTier: 1,
    foodSlot: null,
    fatigueDebt: 0,
    isNew: false,
    hp: 20,
    hpMax: 20,
    level: 1,
    xp: 0,
    combatAttrs: [],
    ...patch,
  }
}

function saveWith(...rows: Worker[]): Save {
  const save = createSave()
  save.workers.push(...rows)
  return save
}

function markFighting(save: Save, workerId: string) {
  const enc = save.encounters.find((row): row is EnemyEncounter => row.kind === 'enemy')
  if (!enc) throw new Error('no enemy')
  enc.combat = {
    startedAt: 0,
    timeoutAt: 1,
    workerIds: [],
    workers: [],
    enemy: { id: 'e', label: 'e', hp: 1, hpMax: 1, atk: 1, spd: 1, nextActAt: 1 },
    logs: [],
    outcome: null,
    incoming: [{ id: workerId, arrivesAt: 1, startedAt: 0, reinforced: false }],
  }
}

describe('camp dock count', () => {
  it('counts only full-hp workers who can leave camp immediately', () => {
    const save = saveWith(
      worker({ id: 'ready' }),
      worker({ id: 'heal', hp: 12, hpMax: 20 }),
      worker({ id: 'debt', hp: 20, hpMax: 20, fatigueDebt: 0.4 }),
      worker({ id: 'duty', assignment: 'herbalism' }),
      worker({ id: 'fight' }),
      worker({ id: 'dig' }),
      worker({ id: 'weed' }),
      worker({ id: 'beast' }),
    )
    markFighting(save, 'fight')
    save.treasureMines.mines.push({ id: 'm', crewIds: ['dig'], raid: null } as TreasureMine)
    save.herbPvp = { plots: [{ workerId: 'weed', cleared: false }] } as HerbPvpState
    save.beastPvp = { fight: { workers: [{ id: 'beast' }] } } as Save['beastPvp']
    expect(campDockCount(save)).toBe(1)
    expect(campQueueBlocked(save)).toBe(false)
  })

  it('still counts full workers waiting behind a wounded head', () => {
    const save = saveWith(
      worker({ id: 'head', hp: 8, hpMax: 20 }),
      worker({ id: 'behind' }),
    )
    expect(campDockCount(save)).toBe(1)
    expect(campQueueBlocked(save)).toBe(true)
  })
})

describe('camp dock tone', () => {
  it('stays quiet when nobody can be sent', () => {
    expect(campDockTone(createSave())).toBe('quiet')
    expect(campDockTone(saveWith(worker({ id: 'duty', assignment: 'cooking' })))).toBe('quiet')
  })

  it('turns ready and would show the count when someone is full', () => {
    const save = saveWith(worker({ id: 'a' }), worker({ id: 'b', hp: 4, hpMax: 20 }))
    expect(campDockTone(save)).toBe('ready')
    expect(campDockCount(save)).toBe(1)
  })

  it('shows blocked ahead of the ready count when the head is not full', () => {
    const wounded = saveWith(worker({ id: 'head', hp: 19, hpMax: 20 }), worker({ id: 'full' }))
    expect(campDockTone(wounded)).toBe('blocked')
    const debt = saveWith(worker({ id: 'head', fatigueDebt: 1 }))
    expect(campDockTone(debt)).toBe('blocked')
    expect(campDockCount(debt)).toBe(0)
  })
})

describe('camp dispatch entries', () => {
  it('offers herb dispatch only after herb unlocks', () => {
    const save = createSave()
    expect(CAMP_DISPATCH_LABEL).toEqual({ herb: '派去割草' })
    expect(campDispatchEntries(save)).toEqual([])
    save.knightLevel = 9
    expect(campDispatchEntries(save)).toEqual([])
    save.openedModules = ['herb']
    expect(campDispatchEntries(save)).toEqual(['herb'])
    save.openedModules = []
    save.knightLevel = 10
    expect(campDispatchEntries(save)).toEqual(['herb'])
  })
})
