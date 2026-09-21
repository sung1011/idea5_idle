import { afterEach, describe, expect, it } from 'vitest'
import { assignWorker } from './assign'
import { bankQty } from './bank'
import { createSave } from './createSave'
import { loadFood } from './food'
import { fuseWorkers } from './fuse'
import { hydrateWorker, hydrateWorkers, recruitWorker, spawnWorker } from './recruit'
import { setRollOverride } from './rng'
import {
  CLASS_MIN_QUALITY,
  CLASS_PLACEHOLDERS,
  classPoolForQuality,
  migrateQualityTierFromGrayTable,
  QUALITY_MAX,
  QUALITY_MIN,
  RECRUIT_COST,
  START_DIAMONDS,
  START_GOLD,
  QUALITY_TIERS,
  WORKER_NAME_POOL,
  WORKER_QUALITY_REV,
  WORKER_QUALITY_TABLE,
} from './tables'
import { selectStationTool } from './tools'

afterEach(() => {
  setRollOverride(null)
})

describe('worker quality table', () => {
  it('has ten color tiers from white to rainbow, with pink before red', () => {
    expect(QUALITY_TIERS).toHaveLength(10)
    expect(QUALITY_MIN).toBe(1)
    expect(QUALITY_MAX).toBe(10)
    expect(Object.keys(WORKER_QUALITY_TABLE).map(Number)).toEqual([...QUALITY_TIERS])
    expect(QUALITY_TIERS.map((tier) => WORKER_QUALITY_TABLE[tier].id)).toEqual([
      'white',
      'green',
      'blue',
      'cyan',
      'purple',
      'orange',
      'pink',
      'red',
      'gold',
      'rainbow',
    ])
    expect(QUALITY_TIERS.map((tier) => WORKER_QUALITY_TABLE[tier].id)).not.toContain('gray')
    expect(WORKER_QUALITY_TABLE[7].color).toBe('#ff7aad')
    expect(WORKER_QUALITY_TABLE[7].color).not.toBe(WORKER_QUALITY_TABLE[10].color)
    expect(new Set(QUALITY_TIERS.map((tier) => WORKER_QUALITY_TABLE[tier].color)).size).toBe(10)
  })

  it('grows the class pool as quality rises', () => {
    expect(classPoolForQuality(1)).toEqual(CLASS_PLACEHOLDERS)
    expect(classPoolForQuality(2)).toContain('miner')
    expect(classPoolForQuality(2)).not.toContain('knight')
    expect(classPoolForQuality(10)).toContain('knight')
    expect(classPoolForQuality(10)).toHaveLength(Object.keys(CLASS_MIN_QUALITY).length)
  })
})

describe('recruitWorker', () => {
  it('spends diamonds not gold, and rejects when diamonds are short', () => {
    const save = createSave()
    const gold0 = save.gold
    const diamonds0 = save.diamonds
    expect(diamonds0).toBe(START_DIAMONDS)
    expect(recruitWorker(save).ok).toBe(true)
    expect(save.gold).toBe(gold0)
    expect(save.gold).toBe(START_GOLD)
    expect(save.diamonds).toBe(diamonds0 - RECRUIT_COST)
    expect(save.workers).toHaveLength(1)

    save.diamonds = RECRUIT_COST - 1
    expect(recruitWorker(save)).toEqual({ ok: false, reason: '钻石不足' })
    expect(save.diamonds).toBe(RECRUIT_COST - 1)
    expect(save.workers).toHaveLength(1)
  })
})

describe('spawn / hydrate quality', () => {
  it('recruits at the lowest tier', () => {
    const save = createSave()
    const worker = spawnWorker(save)
    expect(worker.qualityTier).toBe(QUALITY_MIN)
    expect(worker.classId).toBe('laborer')
    expect(worker.name).toBe(WORKER_NAME_POOL[0])
    expect(worker.combatAttrs).toEqual([])
    expect(worker.level).toBe(1)
    expect(worker.xp).toBe(0)
  })

  it('hydrates missing or dirty quality to the lowest tier', () => {
    expect(hydrateWorker({ id: 'w-old', assignment: null }).qualityTier).toBe(1)
    expect(hydrateWorker({ id: 'w-bad', qualityTier: 0 }).qualityTier).toBe(1)
    expect(hydrateWorker({ id: 'w-high', qualityTier: 99 }).qualityTier).toBe(1)
    expect(hydrateWorker({ id: 'w-ok', qualityTier: 7, classId: 'smith' }).qualityTier).toBe(7)
    expect(hydrateWorker({ id: 'w-ok', qualityTier: 7, classId: 'smith' }).classId).toBe('smith')
    expect(hydrateWorker({ id: 'w-x', classId: 'not-a-job' }).classId).toBeUndefined()
    const full = hydrateWorker({ id: 'w-old', assignment: null, classId: 'laborer' })
    expect(full.hp).toBe(full.hpMax)
    expect(full.hp).toBeGreaterThan(0)
    expect(hydrateWorker({ id: 'w-hurt', classId: 'laborer', hp: 6 }).hp).toBe(6)
    expect(hydrateWorker({ id: 'w-old', assignment: null }).level).toBe(1)
    expect(hydrateWorker({ id: 'w-old', assignment: null }).xp).toBe(0)
  })

  it('maps the old gray table once, then leaves the new table alone', () => {
    expect(QUALITY_TIERS.map(migrateQualityTierFromGrayTable)).toEqual([1, 1, 2, 3, 4, 5, 6, 8, 9, 10])
    expect(QUALITY_TIERS.map(migrateQualityTierFromGrayTable)).not.toContain(7)

    const oldBoard = hydrateWorkers(
      [
        { id: 'w-gray', qualityTier: 1 },
        { id: 'w-white', qualityTier: 2 },
        { id: 'w-green', qualityTier: 3 },
        { id: 'w-orange', qualityTier: 7 },
        { id: 'w-red', qualityTier: 8 },
        { id: 'w-rainbow', qualityTier: 10 },
      ],
      1,
    )
    expect(oldBoard.map((w) => w.qualityTier)).toEqual([1, 1, 2, 6, 8, 10])

    const alreadyNew = hydrateWorkers(
      [
        { id: 'w-white', qualityTier: 1 },
        { id: 'w-green', qualityTier: 2 },
        { id: 'w-pink', qualityTier: 7 },
        { id: 'w-red', qualityTier: 8 },
      ],
      WORKER_QUALITY_REV,
    )
    expect(alreadyNew.map((w) => w.qualityTier)).toEqual([1, 2, 7, 8])
  })
})

describe('fuseWorkers', () => {
  it('consumes two same-tier workers and yields one higher tier', () => {
    const save = createSave()
    const a = spawnWorker(save)
    const b = spawnWorker(save)
    expect(assignWorker(save, a.id, 'mining').ok).toBe(true)
    expect(assignWorker(save, b.id, 'mining').ok).toBe(true)
    const result = fuseWorkers(save, a.id, b.id)
    expect(result.ok).toBe(true)
    expect(save.workers).toHaveLength(1)
    expect(save.workers[0].qualityTier).toBe(2)
    expect(save.workers[0].assignment).toBe('mining')
    expect(save.workers[0].foodSlot).toBeNull()
    expect(save.workers[0].id).toBe('w-3')
    expect(save.workers[0].name).toBe(WORKER_NAME_POOL[2])
    expect(classPoolForQuality(2)).toContain(save.workers[0].classId)
  })

  it('can roll a class neither parent had', () => {
    const save = createSave()
    const a = spawnWorker(save)
    const b = spawnWorker(save)
    a.classId = 'laborer'
    b.classId = 'laborer'
    expect(assignWorker(save, a.id, 'cooking').ok).toBe(true)
    expect(assignWorker(save, b.id, 'cooking').ok).toBe(true)
    setRollOverride(() => 0.99)
    expect(fuseWorkers(save, a.id, b.id).ok).toBe(true)
    expect(save.workers[0].classId).toBe('miner')
    expect(save.workers[0].classId).not.toBe('laborer')
  })

  it('returns leftover food to the bank; selected station tool stays; new worker stays assigned', () => {
    const save = createSave()
    const a = spawnWorker(save)
    const b = spawnWorker(save)
    save.stations.mining.stationLevel = 5
    save.bank.miningTool01 = 1
    save.bank.meal = 2
    expect(selectStationTool(save, 'mining', 'miningTool01').ok).toBe(true)
    expect(loadFood(save, a.id, 'meal', 2).ok).toBe(true)
    expect(assignWorker(save, a.id, 'mining').ok).toBe(true)
    expect(assignWorker(save, b.id, 'mining').ok).toBe(true)
    expect(bankQty(save, 'miningTool01')).toBe(1)
    expect(bankQty(save, 'meal')).toBe(0)

    expect(fuseWorkers(save, a.id, b.id).ok).toBe(true)
    expect(bankQty(save, 'miningTool01')).toBe(1)
    expect(save.stations.mining.selectedToolId).toBe('miningTool01')
    expect(bankQty(save, 'meal')).toBe(1)
    expect(save.workers[0].assignment).toBe('mining')
    expect(save.workers.every((w) => w.assignment === 'mining')).toBe(true)
  })

  it('rejects missing, same, mixed-tier, and max-tier pairs', () => {
    const save = createSave()
    const a = spawnWorker(save)
    const b = spawnWorker(save)
    expect(fuseWorkers(save, a.id, a.id)).toEqual({ ok: false, reason: '不能合成同一个人' })
    expect(fuseWorkers(save, a.id, 'w-missing')).toEqual({ ok: false, reason: '没有这个工人' })
    expect(fuseWorkers(save, '', b.id)).toEqual({ ok: false, reason: '请选两个同品质工人' })

    expect(assignWorker(save, a.id, 'herbalism').ok).toBe(true)
    expect(assignWorker(save, b.id, 'herbalism').ok).toBe(true)
    b.qualityTier = 2
    expect(fuseWorkers(save, a.id, b.id)).toEqual({ ok: false, reason: '品质不同，不能合成' })
    expect(save.workers).toHaveLength(2)

    a.qualityTier = QUALITY_MAX
    b.qualityTier = QUALITY_MAX
    expect(fuseWorkers(save, a.id, b.id)).toEqual({ ok: false, reason: '已是最高品质' })
    expect(save.workers).toHaveLength(2)
  })
})
