import { describe, expect, it } from 'vitest'
import { assignWorker } from './assign'
import { bankQty } from './bank'
import { createSave } from './createSave'
import { offlineSeconds, settleOffline } from './offline'
import { recruitWorker } from './recruit'
import { OFFLINE_CAP_S } from './tables'

describe('offline', () => {
  it('caps catch-up at 8 hours', () => {
    const now = 1_000_000
    const lastTick = now - (OFFLINE_CAP_S + 3600) * 1000
    expect(offlineSeconds(lastTick, now)).toBe(OFFLINE_CAP_S)
  })

  it('replays applyTick for offline seconds', () => {
    const save = createSave()
    save.gold = 15
    recruitWorker(save)
    assignWorker(save, save.workers[0].id, 'mining')
    save.lastTick = 0
    const result = settleOffline(save, 20_000)
    expect(result.summary.seconds).toBe(20)
    expect(bankQty(result.save, 'ore')).toBe(4)
  })
})
