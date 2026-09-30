import { describe, expect, it } from 'vitest'
import { assignRestingToFirstEmpty, restingWorkers } from './assign'
import { bankQty } from './bank'
import { createSave } from './createSave'
import { grantOpenedModules } from './moduleUnlock'
import { spawnWorker } from './recruit'
import { ticks } from './tick'
import {
  AUTO_FULL_TIP,
  AUTO_QUEUE_TIP,
  AUTO_QUOTA_TIP,
  CAMP_EMPTY_TIP,
  applyManualQualityOutput,
  autoLineQuota,
  dispatchManualRound,
  toggleStationAuto,
} from './workshopDispatch'

function fullWorker(save: ReturnType<typeof createSave>) {
  const worker = spawnWorker(save)
  worker.hp = worker.hpMax
  worker.fatigueDebt = 0
  return worker
}

describe('workshop manual dispatch and auto lines', () => {
  it('starts with no auto quota, then 1 after alchemy and 2 after tech', () => {
    const save = createSave()
    expect(autoLineQuota(save)).toBe(0)
    expect(toggleStationAuto(save, 'herbalism')).toEqual({ ok: false, reason: AUTO_QUOTA_TIP })
    grantOpenedModules(save, ['alchemy'])
    expect(autoLineQuota(save)).toBe(1)
    expect(toggleStationAuto(save, 'herbalism').ok).toBe(true)
    expect(toggleStationAuto(save, 'alchemy')).toEqual({ ok: false, reason: AUTO_FULL_TIP })
    grantOpenedModules(save, ['tech'])
    expect(autoLineQuota(save)).toBe(2)
    expect(toggleStationAuto(save, 'alchemy').ok).toBe(true)
  })

  it('dispatches the camp head for one round and queues up to 5', () => {
    const save = createSave()
    expect(dispatchManualRound(save, 'herbalism')).toEqual({ ok: false, reason: CAMP_EMPTY_TIP })
    const first = fullWorker(save)
    const second = fullWorker(save)
    expect(dispatchManualRound(save, 'herbalism').ok).toBe(true)
    expect(first.assignment).toBe('herbalism')
    expect(save.stations.herbalism.manualRounds).toBe(1)
    expect(dispatchManualRound(save, 'herbalism').ok).toBe(true)
    expect(save.stations.herbalism.manualRounds).toBe(2)
    save.stations.herbalism.manualRounds = 5
    expect(dispatchManualRound(save, 'herbalism')).toEqual({ ok: false, reason: AUTO_QUEUE_TIP })
    expect(second.assignment).toBeNull()
  })

  it('refuses a wounded head and does not enqueue', () => {
    const save = createSave()
    const head = fullWorker(save)
    head.hp = 1
    expect(dispatchManualRound(save, 'herbalism')).toEqual({ ok: false, reason: CAMP_EMPTY_TIP })
    expect(save.stations.herbalism.manualRounds).toBe(0)
    expect(head.assignment).toBeNull()
  })

  it('returns the worker to the tail and pulls the next head', () => {
    const save = createSave()
    const first = fullWorker(save)
    const second = fullWorker(save)
    save.stations.herbalism.manualRounds = 2
    save.stations.herbalism.progress = 1
    first.assignment = 'herbalism'
    const done = ticks(save, 1)
    expect(done.workers.find((worker) => worker.id === first.id)?.assignment).toBeNull()
    expect(restingWorkers(done).at(-1)?.id).toBe(first.id)
    expect(done.workers.find((worker) => worker.id === second.id)?.assignment).toBe('herbalism')
    expect(done.stations.herbalism.manualRounds).toBe(1)
  })

  it('does not auto-fill a manual station', () => {
    const save = createSave()
    fullWorker(save)
    expect(assignRestingToFirstEmpty(save).ok).toBe(false)
    expect(save.workers[0].assignment).toBeNull()
    save.stations.herbalism.auto = true
    expect(assignRestingToFirstEmpty(save).ok).toBe(true)
    expect(save.workers[0].assignment).toBe('herbalism')
  })

  it('scales a manual lot by quality and leaves an auto lot alone', () => {
    const manual = createSave()
    const worker = fullWorker(manual)
    worker.qualityTier = 3
    worker.assignment = 'herbalism'
    const lots = [{ itemId: 'herb' as const, qty: 2 }]
    applyManualQualityOutput(manual, 'herbalism', lots)
    expect(lots[0]?.qty).toBe(6)
    expect(bankQty(manual, 'herb')).toBe(4)

    const auto = createSave()
    const busy = fullWorker(auto)
    busy.qualityTier = 4
    busy.assignment = 'herbalism'
    auto.stations.herbalism.auto = true
    const same = [{ itemId: 'herb' as const, qty: 2 }]
    applyManualQualityOutput(auto, 'herbalism', same)
    expect(same[0]?.qty).toBe(2)
    expect(bankQty(auto, 'herb')).toBe(0)
  })

  it('finishes queued manual rounds offline and leaves an idle manual station quiet', () => {
    const queued = createSave()
    const a = fullWorker(queued)
    const b = fullWorker(queued)
    queued.stations.herbalism.manualRounds = 2
    queued.stations.herbalism.progress = 0.99
    a.assignment = 'herbalism'
    const done = ticks(queued, 40)
    expect(done.stations.herbalism.completed).toBeGreaterThanOrEqual(1)
    expect(done.stations.herbalism.manualRounds).toBeLessThan(2)
    expect([a.id, b.id]).toContain(done.workers.find((worker) => worker.assignment === 'herbalism')?.id ?? b.id)

    const idle = createSave()
    const parked = fullWorker(idle)
    parked.assignment = 'herbalism'
    idle.stations.herbalism.manualRounds = 0
    const quiet = ticks(idle, 30)
    expect(quiet.stations.herbalism.completed).toBe(0)
    expect(bankQty(quiet, 'herb')).toBe(0)

    const line = createSave()
    const hand = fullWorker(line)
    hand.assignment = 'herbalism'
    line.stations.herbalism.auto = true
    line.stations.herbalism.progress = 0.99
    const produced = ticks(line, 40)
    expect(produced.stations.herbalism.completed).toBeGreaterThanOrEqual(1)
    expect(produced.workers.find((worker) => worker.id === hand.id)?.assignment).toBe('herbalism')
  })

  it('refuses a click on an auto line', () => {
    const save = createSave()
    grantOpenedModules(save, ['alchemy'])
    fullWorker(save)
    expect(toggleStationAuto(save, 'herbalism').ok).toBe(true)
    expect(dispatchManualRound(save, 'herbalism').ok).toBe(false)
  })
})
