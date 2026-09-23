import { describe, expect, it } from 'vitest'
import { createSave } from './createSave'
import type { EnemyEncounter, Save, StationId, Worker } from './types'
import {
  BANTER_BUBBLE_MS,
  BANTER_CHANCE_MAX,
  BANTER_CHANCE_MIN,
  BANTER_DUETS,
  BANTER_GLOBAL_COOLDOWN_MAX_S,
  BANTER_GLOBAL_COOLDOWN_MIN_S,
  BANTER_POOLS,
  banterLines,
  banterTriggerChance,
  blankBanterFlags,
  blankBanterMemory,
  BANTER_ASSIGN_CHANCE,
  BANTER_FUSE_CHANCE,
  BANTER_POTION_CHANCE,
  actionBanterLines,
  considerActionBanter,
  considerWorkshopBanter,
  planWorkshopBanter,
  pickBanterPool,
  poolWeight,
  stationCandidateWeight,
  workerBanterWeight,
  type BanterMemory,
  type BanterRng,
} from './workshopBanter'

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

function put(save: Save, row: Worker): Worker {
  save.workers.push(row)
  return row
}

function rolls(values: number[]): BanterRng {
  let index = 0
  return () => {
    if (index >= values.length) throw new Error(`多余掷骰 #${index}`)
    return values[index++]
  }
}

function snapshot(save: Save): string {
  return JSON.stringify(save)
}

function run(
  save: Save,
  memory: BanterMemory,
  nowS: number,
  success: StationId[],
  rng: BanterRng,
  dragging = false,
  forced = false,
) {
  return considerWorkshopBanter({
    save,
    nowS,
    memory,
    dragging,
    successStationIds: success,
    rng,
    forced,
  })
}

describe('workshop banter weights', () => {
  it('lifts the check from 4% toward 8% per condition', () => {
    expect(banterTriggerChance(blankBanterFlags())).toBe(BANTER_CHANCE_MIN)
    expect(banterTriggerChance({ ...blankBanterFlags(), stalled: true })).toBe(0.05)
    expect(banterTriggerChance({ ...blankBanterFlags(), wounded: true })).toBe(0.05)
    expect(banterTriggerChance({ ...blankBanterFlags(), emptyHp: true })).toBe(0.05)
    expect(banterTriggerChance({ ...blankBanterFlags(), canFuse: true })).toBe(0.05)
    expect(banterTriggerChance({ ...blankBanterFlags(), isNew: true })).toBe(0.05)
    expect(
      banterTriggerChance({
        stalled: true,
        wounded: true,
        emptyHp: true,
        canFuse: true,
        isNew: true,
      }),
    ).toBe(BANTER_CHANCE_MAX)
  })

  it('shifts the line pool toward the matching condition', () => {
    const flat = blankBanterFlags()
    expect(pickBanterPool(flat, 0.15)).toBe('gripe')
    expect(pickBanterPool({ ...flat, canFuse: true }, 0.15)).toBe('fuseWish')
    expect(pickBanterPool(flat, 0.5)).toBe('gossip')
    expect(pickBanterPool({ ...flat, stalled: true }, 0.5)).toBe('idle')
    expect(pickBanterPool(flat, 0.3)).toBe('fuseWish')
    expect(pickBanterPool({ ...flat, isNew: true }, 0.3)).toBe('gossip')
    expect(pickBanterPool({ ...flat, wounded: true }, 0.3)).toBe('gripe')
    expect(poolWeight('fuseWish', { ...flat, canFuse: true })).toBeGreaterThan(poolWeight('gripe', flat))
    expect(poolWeight('idle', { ...flat, stalled: true })).toBeGreaterThan(poolWeight('idle', flat))
  })

  it('raises station and speaker weights without touching gameplay', () => {
    const flat = blankBanterFlags()
    expect(stationCandidateWeight(flat, true)).toBe(10)
    expect(stationCandidateWeight({ ...flat, stalled: true }, false)).toBe(8)
    expect(stationCandidateWeight({ ...flat, isNew: true }, false)).toBe(0)
    expect(stationCandidateWeight({ ...flat, canFuse: true, isNew: true }, true)).toBe(20)
    const plain = worker({ id: 'a' })
    expect(workerBanterWeight(plain)).toBe(10)
    expect(workerBanterWeight({ ...plain, isNew: true })).toBe(30)
    expect(workerBanterWeight({ ...plain, hp: 4, hpMax: 20 })).toBe(22)
    expect(workerBanterWeight({ ...plain, hp: 0 })).toBe(30)
    expect(workerBanterWeight({ ...plain, isNew: true, hp: 0 })).toBe(50)
  })

  it('keeps each solo pool in the short-line band', () => {
    for (const pool of BANTER_POOLS) {
      if (pool === 'byStation') continue
      const lines = banterLines(pool, 'herbalism')
      expect(lines.length).toBeGreaterThanOrEqual(8)
      expect(lines.length).toBeLessThanOrEqual(15)
    }
    expect(banterLines('byStation', 'cooking').length).toBeGreaterThanOrEqual(3)
    expect(BANTER_DUETS.length).toBeGreaterThanOrEqual(5)
    expect(BANTER_DUETS[0]).toEqual(['先做完这锅带着香味走', '你是高级材料'])
  })
})

describe('workshop banter trigger', () => {
  it('does not fire when nobody is on duty', () => {
    const save = createSave()
    put(save, worker({ id: 'rest', assignment: null, isNew: true }))
    const memory = blankBanterMemory()
    const before = snapshot(save)
    expect(run(save, memory, 10, ['herbalism'], rolls([]))).toBeNull()
    expect(memory).toEqual(blankBanterMemory())
    expect(snapshot(save)).toBe(before)
    expect(save.workers[0].isNew).toBe(true)
  })

  it('skips a miss and does not start cooldown', () => {
    const save = createSave()
    put(save, worker({ id: 'a', assignment: 'herbalism' }))
    const memory = blankBanterMemory()
    expect(run(save, memory, 4, ['herbalism'], rolls([0, 0.5]))).toBeNull()
    expect(memory).toEqual(blankBanterMemory())
  })

  it('holds a global cooldown of 45–75s and only one event at a time', () => {
    const save = createSave()
    put(save, worker({ id: 'a', assignment: 'herbalism' }))
    const memory = blankBanterMemory()
    const first = run(save, memory, 10, ['herbalism'], rolls([0, 0, 0, 0, 0]))
    expect(first?.kind).toBe('solo')
    expect(first?.beats[0].text).toBe(banterLines('gripe', 'herbalism')[0])
    expect(memory.cooldownS).toBe(BANTER_GLOBAL_COOLDOWN_MIN_S)
    expect(memory.lastEventS).toBe(10)
    expect(run(save, memory, 54, ['herbalism'], rolls([]))).toBeNull()

    memory.cooldownS = 0
    memory.workerAt.a = -1000
    expect(run(save, memory, 12, ['herbalism'], rolls([]))).toBeNull()

    const freeAt = 10 + BANTER_BUBBLE_MS / 1000
    const again = run(save, memory, freeAt, ['herbalism'], rolls([0, 0, 0, 0, 1]))
    expect(again?.kind).toBe('solo')
    expect(again?.beats[0].workerId).toBe('a')
    expect(memory.cooldownS).toBe(BANTER_GLOBAL_COOLDOWN_MAX_S)
    expect(run(save, memory, freeAt + 74, ['herbalism'], rolls([]))).toBeNull()
    expect(run(save, memory, freeAt + 75, ['herbalism'], rolls([]))).toBeNull()
  })

  it('speaks a duet in order, then blocks that pair until the worker cooldown', () => {
    const save = createSave()
    const left = put(save, worker({ id: 'a', assignment: 'cooking' }))
    const right = put(save, worker({ id: 'b', assignment: 'cooking', qualityTier: 2 }))
    const memory = blankBanterMemory()
    const before = snapshot(save)
    const event = run(save, memory, 20, ['cooking'], rolls([0, 0, 0, 0, 0, 0]))
    expect(event).toEqual({
      stationId: 'cooking',
      kind: 'duet',
      beats: [
        { workerId: left.id, stationId: 'cooking', text: '先做完这锅带着香味走', delayMs: 0 },
        { workerId: right.id, stationId: 'cooking', text: '你是高级材料', delayMs: 800 },
      ],
    })
    expect(snapshot(save)).toBe(before)
    expect(run(save, memory, 20 + 45, ['cooking'], rolls([]))).toBeNull()
    expect(run(save, memory, 20 + 119, ['cooking'], rolls([]))).toBeNull()
  })

  it('falls back to the free worker when the partner is still cooling down', () => {
    const save = createSave()
    put(save, worker({ id: 'a', assignment: 'alchemy' }))
    put(save, worker({ id: 'b', assignment: 'alchemy', qualityTier: 3 }))
    const memory = blankBanterMemory()
    memory.workerAt.a = 0
    const event = run(save, memory, 50, ['alchemy'], rolls([0, 0, 0, 0, 0]))
    expect(event?.kind).toBe('solo')
    expect(event?.beats).toHaveLength(1)
    expect(event?.beats[0].workerId).toBe('b')
    expect(event?.beats[0].text).toBe(banterLines('gripe', 'alchemy')[0])
  })

  it('does not speak while dragging or while that worker is in a fight', () => {
    const save = createSave()
    const onDuty = put(save, worker({ id: 'a', assignment: 'mining', isNew: true }))
    const memory = blankBanterMemory()
    expect(run(save, memory, 3, ['mining'], rolls([]), true)).toBeNull()
    expect(memory).toEqual(blankBanterMemory())

    save.encounters.push({
      id: 'enc-1',
      label: '狼',
      quality: 'green',
      kind: 'enemy',
      needs: {},
      lootGold: 0,
      departed: true,
      lootClaimed: false,
      enemyRank: 'minion',
      weaknesses: [],
      revealedWeaknesses: [],
      combat: {
        startedAt: 0,
        timeoutAt: 900,
        workerIds: [onDuty.id],
        workers: [{ id: onDuty.id, label: '甲', hp: 8, hpMax: 10, atk: 1, spd: 2, nextActAt: 0 }],
        enemy: { id: 'wolf', label: '狼', hp: 10, hpMax: 10, atk: 1, spd: 2, nextActAt: 0 },
        logs: [],
        outcome: null,
      },
    } as EnemyEncounter)
    expect(run(save, memory, 3, ['mining'], rolls([]))).toBeNull()
    expect(onDuty.isNew).toBe(true)
    expect(onDuty.assignment).toBe('mining')
  })

  it('prefers a stalled empty-hp station and an idle line', () => {
    const save = createSave()
    put(save, worker({ id: 'miner', assignment: 'mining' }))
    put(save, worker({ id: 'herb', assignment: 'herbalism', hp: 0, hpMax: 20 }))
    save.stations.herbalism.stallReason = 'emptyInput'
    const memory = blankBanterMemory()
    const event = run(save, memory, 8, ['mining'], rolls([0.99, 0, 0.7, 0, 0]))
    expect(event?.stationId).toBe('herbalism')
    expect(event?.kind).toBe('solo')
    expect(event?.beats[0].workerId).toBe('herb')
    expect(banterLines('idle', 'herbalism')).toContain(event?.beats[0].text)
  })

  it('pulls a fuse wish when the station can merge, and leaves isNew set', () => {
    const save = createSave()
    const newbie = put(save, worker({ id: 'a', assignment: 'inscription', isNew: true }))
    put(save, worker({ id: 'b', assignment: 'inscription', isNew: true }))
    const memory = blankBanterMemory()
    const before = snapshot(save)
    const event = run(save, memory, 6, ['inscription'], rolls([0, 0, 0.9, 0, 0.3, 0, 0]))
    expect(event?.kind).toBe('solo')
    expect(event?.beats[0].text).toBe('隔壁绿的骨架不错拼一下')
    expect(newbie.isNew).toBe(true)
    expect(save.workers[1].isNew).toBe(true)
    expect(snapshot(save)).toBe(before)
  })

  it('forces one entry line through both cooldowns, then the normal gates apply again', () => {
    const save = createSave()
    const onDuty = put(save, worker({ id: 'a', assignment: 'herbalism', isNew: true }))
    const memory = blankBanterMemory()
    memory.lastEventS = 0
    memory.cooldownS = BANTER_GLOBAL_COOLDOWN_MAX_S
    memory.workerAt.a = 0
    expect(run(save, memory, 10, ['herbalism'], rolls([]))).toBeNull()

    const before = snapshot(save)
    const forced = run(save, memory, 10, [], rolls([0, 0, 0, 0]), false, true)
    expect(forced?.kind).toBe('solo')
    expect(forced?.beats[0].workerId).toBe('a')
    expect(forced?.beats[0].text).toBe(banterLines('gripe', 'herbalism')[0])
    expect(memory.lastEventS).toBe(10)
    expect(memory.cooldownS).toBe(BANTER_GLOBAL_COOLDOWN_MIN_S)
    expect(memory.workerAt.a).toBe(10)
    expect(onDuty.isNew).toBe(true)
    expect(snapshot(save)).toBe(before)
    expect(run(save, memory, 11, ['herbalism'], rolls([]))).toBeNull()
  })

  it('skips the entry line when nobody is on duty and does not arm a replay', () => {
    const save = createSave()
    put(save, worker({ id: 'rest', assignment: null, isNew: true }))
    const memory = blankBanterMemory()
    memory.lastEventS = 3
    memory.cooldownS = 60
    memory.workerAt.rest = 3
    const beforeMemory = JSON.stringify(memory)
    const before = snapshot(save)
    expect(run(save, memory, 10, [], rolls([]), false, true)).toBeNull()
    expect(JSON.stringify(memory)).toBe(beforeMemory)
    expect(snapshot(save)).toBe(before)
    expect(save.workers[0].isNew).toBe(true)
  })

  it('holds the forced commit until the caller applies it', () => {
    const save = createSave()
    put(save, worker({ id: 'a', assignment: 'herbalism' }))
    const memory = blankBanterMemory()
    const planned = planWorkshopBanter({
      save,
      nowS: 10,
      memory,
      dragging: false,
      successStationIds: [],
      rng: rolls([0, 0, 0, 0]),
      forced: true,
    })
    expect(planned?.event.beats[0].text).toBe(banterLines('gripe', 'herbalism')[0])
    expect(memory).toEqual(blankBanterMemory())
    planned?.apply()
    expect(memory.lastEventS).toBe(10)
    expect(memory.cooldownS).toBe(BANTER_GLOBAL_COOLDOWN_MIN_S)
    expect(memory.workerAt.a).toBe(10)
  })
})

function act(
  save: Save,
  memory: BanterMemory,
  kind: 'assign' | 'fuse' | 'potion',
  rng: BanterRng,
  extra: { workerId?: string; stationId?: StationId | null; nowS?: number; dragging?: boolean } = {},
) {
  return considerActionBanter({
    save,
    nowS: extra.nowS ?? 10,
    memory,
    dragging: extra.dragging === true,
    rng,
    kind,
    workerId: extra.workerId,
    stationId: extra.stationId,
  })
}

describe('action banter', () => {
  it('speaks a solo station line for a successful assign and starts cooldown', () => {
    const save = createSave()
    put(save, worker({ id: 'a', assignment: 'cooking' }))
    const memory = blankBanterMemory()
    const event = act(save, memory, 'assign', rolls([0, 0, 0, 0]), { workerId: 'a', stationId: 'cooking' })
    expect(event?.kind).toBe('solo')
    expect(event?.beats).toHaveLength(1)
    expect(event?.beats[0]).toMatchObject({
      workerId: 'a',
      stationId: 'cooking',
      text: banterLines('byStation', 'cooking')[0],
    })
    expect(memory.lastEventS).toBe(10)
    expect(memory.workerAt.a).toBe(10)
    expect(memory.busyUntilS).toBeGreaterThan(10)
  })

  it('drops an assign miss and a rest worker without writing cooldown', () => {
    const save = createSave()
    put(save, worker({ id: 'a', assignment: 'cooking' }))
    const memory = blankBanterMemory()
    expect(act(save, memory, 'assign', rolls([BANTER_ASSIGN_CHANCE]), { workerId: 'a' })).toBeNull()
    expect(memory).toEqual(blankBanterMemory())
    put(save, worker({ id: 'rest', assignment: null }))
    expect(act(save, memory, 'assign', rolls([]), { workerId: 'rest' })).toBeNull()
    expect(memory).toEqual(blankBanterMemory())
  })

  it('fails on global, personal, and busy cooldowns without rolling past them', () => {
    const save = createSave()
    put(save, worker({ id: 'a', assignment: 'mining' }))
    const global = blankBanterMemory()
    global.lastEventS = 10
    global.cooldownS = 45
    expect(act(save, global, 'assign', rolls([]), { workerId: 'a', nowS: 20 })).toBeNull()
    expect(global.workerAt.a).toBeUndefined()

    const personal = blankBanterMemory()
    personal.workerAt.a = 10
    expect(act(save, personal, 'fuse', rolls([]), { workerId: 'a', nowS: 20 })).toBeNull()
    expect(personal.lastEventS).toBe(-1)

    const busy = blankBanterMemory()
    busy.busyUntilS = 21
    expect(act(save, busy, 'potion', rolls([]), { nowS: 20 })).toBeNull()
  })

  it('uses a fuse-wish line for the worker who stayed, and a short done line on the other roll', () => {
    const save = createSave()
    put(save, worker({ id: 'kept', assignment: 'alchemy' }))
    put(save, worker({ id: 'mate', assignment: 'alchemy' }))
    const memory = blankBanterMemory()
    const wish = act(save, memory, 'fuse', rolls([0, 0, 0, 0]), { workerId: 'kept', stationId: 'alchemy' })
    expect(wish?.kind).toBe('solo')
    expect(wish?.beats[0].workerId).toBe('kept')
    expect(wish?.beats[0].text).toBe(banterLines('fuseWish', 'alchemy')[0])

    const again = blankBanterMemory()
    const done = act(save, again, 'fuse', rolls([BANTER_FUSE_CHANCE - 0.01, 0.8, 0, 0]), {
      workerId: 'kept',
    })
    expect(done?.beats[0].text).toBe(actionBanterLines('fuse', 'alchemy', 0.8)[0])
    expect(done?.beats).toHaveLength(1)
  })

  it('prefers the potion station and skips when nobody on duty can hold a bubble', () => {
    const save = createSave()
    put(save, worker({ id: 'cook', assignment: 'cooking' }))
    put(save, worker({ id: 'mine', assignment: 'mining' }))
    const memory = blankBanterMemory()
    const event = act(save, memory, 'potion', rolls([0, 0, 0]), { stationId: 'cooking' })
    expect(event?.beats[0].workerId).toBe('cook')
    expect(event?.beats[0].text).toBe('这一口顶半班')
    expect(BANTER_POTION_CHANCE).toBe(0.25)
    expect(actionBanterLines('potion', 'cooking').length).toBeGreaterThanOrEqual(2)
    expect(actionBanterLines('potion', 'cooking')).toContain('药效先走')

    const empty = createSave()
    put(empty, worker({ id: 'rest', assignment: null }))
    expect(act(empty, blankBanterMemory(), 'potion', rolls([]))).toBeNull()
  })

  it('does not speak while a drag is active', () => {
    const save = createSave()
    put(save, worker({ id: 'a', assignment: 'herbalism' }))
    expect(act(save, blankBanterMemory(), 'assign', rolls([]), { workerId: 'a', dragging: true })).toBeNull()
  })
})
