import { afterEach, describe, expect, it } from 'vitest'
import { assignWorker } from './assign'
import { bankQty } from './bank'
import { createSave } from './createSave'
import { exploreCost } from './encounters'
import { fuseWorkers } from './fuse'
import { settleOffline } from './offline'
import { currentSpeed } from './query'
import { recruitWorker, spawnWorker } from './recruit'
import { setRollOverride } from './rng'
import { completeCycle } from './stations'
import {
  BLUEPRINT_TECH_POINTS,
  CRAFT_TECH_POINTS,
  TECH_TREE,
  exchangeBlueprint,
  fuseStayAssigned,
  grantCraftTechPoint,
  hasTech,
  hydrateTechFields,
  hydrateUnlockedTechIds,
  nextTech,
  normalizeTechPoints,
  offlineCapHours,
  offlineCapS,
  recruitCost,
  researchNextTech,
  resonanceBonusEvery,
  resonanceSpeedMul,
  stationTechSpeedMul,
} from './tech'
import { OFFLINE_CAP_S, RECRUIT_COST, RESONANCE_BONUS_EVERY, RESONANCE_SPEED_MUL } from './tables'
import { ticks } from './tick'
import { equipStationTool } from './tools'
import type { Save, TechId } from './types'

afterEach(() => {
  setRollOverride(null)
})

function unlockThrough(save: Save, id: TechId): void {
  for (const node of TECH_TREE) {
    if (hasTech(save, node.id)) continue
    save.techPoints = node.cost
    expect(researchNextTech(save).ok).toBe(true)
    if (node.id === id) break
  }
}

describe('tech tree table', () => {
  it('is a linear 10-node list with unique ids and rising costs', () => {
    expect(TECH_TREE).toHaveLength(10)
    expect(TECH_TREE.length).toBeGreaterThanOrEqual(8)
    expect(TECH_TREE.length).toBeLessThanOrEqual(12)
    const ids = TECH_TREE.map((node) => node.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const node of TECH_TREE) {
      expect(node.name.length).toBeGreaterThan(0)
      expect(node.desc.length).toBeGreaterThan(0)
      expect(node.cost).toBeGreaterThan(0)
    }
    for (let i = 1; i < TECH_TREE.length; i++) {
      expect(TECH_TREE[i].cost).toBeGreaterThanOrEqual(TECH_TREE[i - 1].cost)
    }
  })
})

describe('hydrate tech fields', () => {
  it('fills missing or dirty points and drops skipped / unknown ids', () => {
    expect(normalizeTechPoints(undefined)).toBe(0)
    expect(normalizeTechPoints(-4)).toBe(0)
    expect(normalizeTechPoints(3.8)).toBe(3)
    expect(hydrateUnlockedTechIds(undefined)).toEqual([])
    expect(hydrateUnlockedTechIds(['workshopLedger', 'notATech', 'recruitDeal'])).toEqual([
      'workshopLedger',
      'recruitDeal',
    ])
    expect(hydrateUnlockedTechIds(['recruitDeal'])).toEqual([])
    expect(hydrateUnlockedTechIds(['workshopLedger', 'exploreMap'])).toEqual(['workshopLedger'])

    const save = createSave()
    delete (save as { techPoints?: number }).techPoints
    delete (save as { unlockedTechIds?: TechId[] }).unlockedTechIds
    hydrateTechFields(save as Save)
    expect(save.techPoints).toBe(0)
    expect(save.unlockedTechIds).toEqual([])
  })
})

describe('researchNextTech', () => {
  it('unlocks in order, spends points, and rejects skips or short funds', () => {
    const save = createSave()
    expect(nextTech(save)?.id).toBe('workshopLedger')
    expect(researchNextTech(save)).toEqual({ ok: false, reason: '科技点不足：还差 4' })
    expect(save.unlockedTechIds).toEqual([])

    save.techPoints = 4
    expect(researchNextTech(save)).toEqual({ ok: true, message: '研究完成：工坊账本' })
    expect(save.techPoints).toBe(0)
    expect(save.unlockedTechIds).toEqual(['workshopLedger'])
    expect(hasTech(save, 'workshopLedger')).toBe(true)
    expect(hasTech(save, 'recruitDeal')).toBe(false)

    save.techPoints = 100
    expect(researchNextTech(save).ok).toBe(true)
    expect(save.unlockedTechIds[1]).toBe('recruitDeal')
    expect(save.techPoints).toBe(94)
  })

  it('stops after the last node', () => {
    const save = createSave()
    save.techPoints = 999
    for (const node of TECH_TREE) {
      expect(researchNextTech(save)).toEqual({ ok: true, message: `研究完成：${node.name}` })
    }
    expect(researchNextTech(save)).toEqual({ ok: false, reason: '科技已全部解锁' })
    expect(save.unlockedTechIds).toEqual(TECH_TREE.map((node) => node.id))
    expect(nextTech(save)).toBeNull()
  })
})

describe('tech point sources', () => {
  it('grants 1 point only when a craft station finishes a cycle', () => {
    const save = createSave()
    grantCraftTechPoint(save, 'mining')
    grantCraftTechPoint(save, 'fishing')
    expect(save.techPoints).toBe(0)
    grantCraftTechPoint(save, 'forging')
    grantCraftTechPoint(save, 'cooking')
    grantCraftTechPoint(save, 'alchemy')
    expect(save.techPoints).toBe(3 * CRAFT_TECH_POINTS)
  })

  it('cooking / forging / alchemy ticks add points; gathering does not', () => {
    setRollOverride(() => 0.99)
    const cook = createSave()
    spawnWorker(cook)
    assignWorker(cook, cook.workers[0].id, 'cooking')
    cook.bank.fish = 1
    const cooked = ticks(cook, 28)
    expect(cooked.stations.cooking.completed).toBe(1)
    expect(cooked.techPoints).toBe(1)

    const forge = createSave()
    spawnWorker(forge)
    assignWorker(forge, forge.workers[0].id, 'forging')
    forge.bank.ore = 1
    const forged = ticks(forge, 32)
    expect(forged.stations.forging.completed).toBe(1)
    expect(forged.techPoints).toBe(1)

    const mine = createSave()
    spawnWorker(mine)
    assignWorker(mine, mine.workers[0].id, 'mining')
    const mined = ticks(mine, 20)
    expect(mined.stations.mining.completed).toBe(1)
    expect(mined.techPoints).toBe(0)
  })

  it('exchanges one blueprint for 3 points and fails when empty', () => {
    const save = createSave()
    expect(exchangeBlueprint(save)).toEqual({ ok: false, reason: '图纸见底' })
    save.bank.blueprint = 2
    expect(exchangeBlueprint(save)).toEqual({ ok: true, message: `兑换科技点 +${BLUEPRINT_TECH_POINTS}` })
    expect(bankQty(save, 'blueprint')).toBe(1)
    expect(save.techPoints).toBe(3)
  })
})

describe('tech effects in sim', () => {
  it('cheapens recruit after recruitDeal / masterPlan', () => {
    const save = createSave()
    expect(recruitCost(save)).toBe(RECRUIT_COST)
    unlockThrough(save, 'recruitDeal')
    expect(recruitCost(save)).toBe(13)
    save.gold = 13
    expect(recruitWorker(save).ok).toBe(true)
    expect(save.gold).toBe(0)

    const broke = createSave()
    unlockThrough(broke, 'recruitDeal')
    broke.gold = 12
    expect(recruitWorker(broke)).toEqual({ ok: false, reason: '金币不足' })

    unlockThrough(save, 'masterPlan')
    expect(recruitCost(save)).toBe(11)
  })

  it('raises offline cap and explore discount', () => {
    const save = createSave()
    expect(offlineCapS(save)).toBe(OFFLINE_CAP_S)
    expect(offlineCapHours(save)).toBe(8)
    expect(exploreCost(save)).toBe(8)
    unlockThrough(save, 'workshopLedger')
    expect(offlineCapHours(save)).toBe(9)
    unlockThrough(save, 'exploreMap')
    expect(exploreCost(save)).toBe(7)
    unlockThrough(save, 'longWatch')
    expect(offlineCapHours(save)).toBe(12)
    unlockThrough(save, 'masterPlan')
    expect(exploreCost(save)).toBe(6)
  })

  it('lets a longer offline catch-up run after longWatch', () => {
    const save = createSave()
    spawnWorker(save)
    assignWorker(save, save.workers[0].id, 'mining')
    unlockThrough(save, 'longWatch')
    const now = 20_000_000
    save.lastTick = now - (11 * 3600 + 60) * 1000
    const result = settleOffline(save, now)
    expect(result.summary.capped).toBe(false)
    expect(result.summary.seconds).toBe(11 * 3600 + 60)
    expect(result.summary.lines[0]).not.toContain('已达 8 小时上限')
  })

  it('speeds craft stations and tooled stations', () => {
    const save = createSave()
    spawnWorker(save)
    assignWorker(save, save.workers[0].id, 'cooking')
    const bare = currentSpeed(save, 'cooking')
    unlockThrough(save, 'craftRhythm')
    expect(stationTechSpeedMul(save, 'cooking')).toBeCloseTo(1.08)
    expect(currentSpeed(save, 'cooking')).toBeCloseTo(bare * 1.08)
    expect(stationTechSpeedMul(save, 'mining')).toBe(1)

    save.bank.tool = 1
    save.forgedTools.push({ itemId: 'tool', matchStationId: 'cooking' })
    expect(equipStationTool(save, 'cooking', 'tool').ok).toBe(true)
    unlockThrough(save, 'toolReady')
    expect(stationTechSpeedMul(save, 'cooking')).toBeCloseTo(1.08 * 1.06)
  })

  it('raises resonance speed and shortens bonus streak', () => {
    const save = createSave()
    expect(resonanceSpeedMul(save)).toBe(RESONANCE_SPEED_MUL)
    expect(resonanceBonusEvery(save)).toBe(RESONANCE_BONUS_EVERY)
    unlockThrough(save, 'resonanceTune')
    expect(resonanceSpeedMul(save)).toBe(1.3)
    unlockThrough(save, 'deepResonance')
    expect(resonanceBonusEvery(save)).toBe(3)
  })

  it('keeps the fused worker at the station after mergeInsight', () => {
    const before = createSave()
    const a = spawnWorker(before)
    const b = spawnWorker(before)
    assignWorker(before, a.id, 'mining')
    assignWorker(before, b.id, 'mining')
    expect(fuseStayAssigned(before)).toBe(false)
    expect(fuseWorkers(before, a.id, b.id).ok).toBe(true)
    expect(before.workers[0].assignment).toBeNull()

    const after = createSave()
    const c = spawnWorker(after)
    const d = spawnWorker(after)
    assignWorker(after, c.id, 'mining')
    assignWorker(after, d.id, 'mining')
    unlockThrough(after, 'mergeInsight')
    expect(fuseStayAssigned(after)).toBe(true)
    expect(fuseWorkers(after, c.id, d.id).ok).toBe(true)
    expect(after.workers[0].assignment).toBe('mining')
  })

  it('still grants a point on a forging soft-fail cycle', () => {
    setRollOverride(() => 0)
    const save = createSave()
    spawnWorker(save)
    assignWorker(save, save.workers[0].id, 'forging')
    save.bank.ore = 1
    expect(completeCycle(save, 'forging')).toBe(true)
    expect(save.stations.forging.craftNotice).toContain('软失败')
    expect(save.techPoints).toBe(1)
  })
})
