import { afterEach, describe, expect, it } from 'vitest'
import { assignWorker } from './assign'
import { bankQty } from './bank'
import { createSave } from './createSave'
import {
  buildOfflineSummary,
  formatOfflineDuration,
  offlineSeconds,
  rawOfflineSeconds,
  settleOffline,
} from './offline'
import { recruitWorker } from './recruit'
import { setRollOverride } from './rng'
import { OFFLINE_CAP_S } from './tables'
import type { Save } from './types'

afterEach(() => {
  setRollOverride(null)
})

function roster(n: number): Save {
  const save = createSave()
  save.gold = 15 * n
  for (let i = 0; i < n; i++) {
    const result = recruitWorker(save)
    expect(result.ok).toBe(true)
  }
  return save
}

describe('offlineSeconds', () => {
  it('caps catch-up at 8 hours', () => {
    const now = 1_000_000
    const lastTick = now - (OFFLINE_CAP_S + 3600) * 1000
    expect(offlineSeconds(lastTick, now)).toBe(OFFLINE_CAP_S)
    expect(rawOfflineSeconds(lastTick, now)).toBe(OFFLINE_CAP_S + 3600)
  })

  it('returns 0 for invalid clocks', () => {
    expect(offlineSeconds(Number.NaN, 1000)).toBe(0)
    expect(offlineSeconds(1000, Number.NaN)).toBe(0)
  })
})

describe('formatOfflineDuration', () => {
  it('formats hours, minutes and seconds', () => {
    expect(formatOfflineDuration(0)).toBe('0 秒')
    expect(formatOfflineDuration(20)).toBe('20 秒')
    expect(formatOfflineDuration(65)).toBe('1 分钟 5 秒')
    expect(formatOfflineDuration(3600)).toBe('1 小时')
    expect(formatOfflineDuration(OFFLINE_CAP_S)).toBe('8 小时')
  })
})

describe('settleOffline', () => {
  it('replays applyTick for offline seconds and summarizes mining', () => {
    const save = roster(1)
    assignWorker(save, save.workers[0].id, 'mining')
    save.lastTick = 0
    const result = settleOffline(save, 80_000)
    expect(result.summary.seconds).toBe(80)
    expect(result.summary.capped).toBe(false)
    expect(bankQty(result.save, 'ore')).toBe(4)
    expect(result.summary.stations.some((s) => s.stationId === 'mining' && s.completed === 4)).toBe(true)
    expect(result.summary.bank.some((b) => b.itemId === 'ore' && b.delta === 4)).toBe(true)
    expect(result.summary.goldDelta).toBe(0)
    expect(result.summary.lines[0]).toBe('离线 1 分钟 20 秒')
    expect(result.summary.lines.some((l) => l.includes('采矿') && l.includes('完成 4 次'))).toBe(true)
    expect(result.summary.lines.some((l) => l.includes('铜矿 +4'))).toBe(true)
    expect(result.save.messages[0]?.title).toBe('离线收益')
    expect(result.save.messages[0]?.read).toBe(false)
    expect(result.save.offlineCount).toBe(1)
  })

  it('summarizes forging consume and produce', () => {
    setRollOverride(() => 0.99)
    const save = roster(1)
    save.stations.forging.selectedForgeToolId = 'miningTool01'
    save.bank.ore = 3
    assignWorker(save, save.workers[0].id, 'forging')
    save.lastTick = 0
    const result = settleOffline(save, 100_000)
    expect(result.summary.seconds).toBe(100)
    expect(bankQty(result.save, 'ore')).toBe(0)
    expect(bankQty(result.save, 'miningTool01')).toBe(3)
    expect(bankQty(result.save, 'tool')).toBe(0)
    expect(bankQty(result.save, 'weapon')).toBe(0)
    const forging = result.summary.stations.find((s) => s.stationId === 'forging')
    expect(forging?.completed).toBe(3)
    expect(forging?.stallReason).toBe('emptyInput')
    expect(result.summary.bank.some((b) => b.itemId === 'ore' && b.delta === -3)).toBe(true)
    expect(result.summary.bank.some((b) => b.itemId === 'miningTool01' && b.delta === 3)).toBe(true)
    expect(result.summary.lines.some((l) => l.includes('锻造') && l.includes('原料见底'))).toBe(true)
  })

  it('summarizes herbalism into the bank', () => {
    const save = roster(1)
    assignWorker(save, save.workers[0].id, 'herbalism')
    save.lastTick = 0
    const result = settleOffline(save, 80_000)
    expect(result.save.stations.herbalism.completed).toBe(4)
    expect(bankQty(result.save, 'herb') + bankQty(result.save, 'spice')).toBe(4)
    expect(result.summary.stations.some((s) => s.stationId === 'herbalism' && s.completed === 4)).toBe(true)
    expect(result.summary.lines.some((l) => l.includes('草') || l.includes('香料'))).toBe(true)
  })

  it('marks the 8h cap in the summary', () => {
    const save = roster(1)
    assignWorker(save, save.workers[0].id, 'mining')
    const now = 10_000_000
    save.lastTick = now - (OFFLINE_CAP_S + 120) * 1000
    const result = settleOffline(save, now)
    expect(result.summary.seconds).toBe(OFFLINE_CAP_S)
    expect(result.summary.capped).toBe(true)
    expect(result.summary.lines[0]).toContain('已达 8 小时上限')
    expect(bankQty(result.save, 'ore')).toBe(result.save.stations.mining.completed)
    expect(result.save.stations.mining.completed).toBeLessThan(OFFLINE_CAP_S / 20)
    expect(result.save.stations.mining.completed).toBeGreaterThan(1200)
    expect(result.save.stations.mining.stallReason).toBeNull()
    expect(result.summary.stations.some((s) => s.stationId === 'mining' && s.completed > 0)).toBe(true)
  })

  it('returns an empty summary when already caught up', () => {
    const save = createSave()
    const now = save.lastTick
    const result = settleOffline(save, now)
    expect(result.summary.seconds).toBe(0)
    expect(result.summary.lines).toEqual([])
    expect(result.save).toBe(save)
    expect(result.save.offlineCount).toBe(0)
  })

  it('omits gold line when gold does not change', () => {
    const save = roster(1)
    assignWorker(save, save.workers[0].id, 'mining')
    save.lastTick = 0
    save.gold = 40
    const result = settleOffline(save, 10_000)
    expect(result.summary.goldBefore).toBe(40)
    expect(result.summary.goldAfter).toBe(40)
    expect(result.summary.goldDelta).toBe(0)
    expect(result.summary.lines.some((l) => l.startsWith('金币'))).toBe(false)
  })

  it('includes gold change in summary lines when gold moved', () => {
    const before = createSave()
    before.gold = 20
    const after = createSave()
    after.gold = 32
    const summary = buildOfflineSummary(before, after, 90, false)
    expect(summary.goldDelta).toBe(12)
    expect(summary.lines).toContain('金币 +12')
  })
})
