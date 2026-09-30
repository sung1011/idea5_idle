import { describe, expect, it } from 'vitest'
import { assignRestingToFirstEmpty, restingWorkers } from './assign'
import { bankQty } from './bank'
import { createSave } from './createSave'
import { grantOpenedModules } from './moduleUnlock'
import { spawnWorker } from './recruit'
import { ticks } from './tick'
import {
  AUTO_BADGE,
  AUTO_FULL_TIP,
  AUTO_QUEUE_TIP,
  AUTO_QUOTA_TIP,
  CAMP_EMPTY_TIP,
  CLEAR_MANUAL_QUEUE_LABEL,
  CLEAR_MANUAL_QUEUE_NOTE,
  ROUND_BADGE_TIP,
  applyManualQualityOutput,
  autoLineQuota,
  canClearStationWork,
  clearManualQueue,
  dispatchManualRound,
  manualQueueLeft,
  pullWaitingManualRounds,
  stationRoundBadge,
  stationRoundBadgeAria,
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
    const next = fullWorker(line)
    hand.assignment = 'herbalism'
    line.stations.herbalism.auto = true
    line.stations.herbalism.progress = 0.99
    const produced = ticks(line, 1)
    expect(produced.stations.herbalism.completed).toBeGreaterThanOrEqual(1)
    expect(produced.workers.find((worker) => worker.id === hand.id)?.assignment).toBeNull()
    expect(restingWorkers(produced).at(-1)?.id).toBe(hand.id)
    expect(produced.workers.find((worker) => worker.id === next.id)?.assignment).toBe('herbalism')
    expect(produced.stations.herbalism.auto).toBe(true)
  })

  it('clears the queue, sends the worker to the camp tail, and stops progress', () => {
    expect(CLEAR_MANUAL_QUEUE_LABEL).toBe('清空')
    expect(CLEAR_MANUAL_QUEUE_NOTE).toContain('回营地队尾')
    expect(CLEAR_MANUAL_QUEUE_NOTE).toContain('自动线关闭')
    expect(CLEAR_MANUAL_QUEUE_NOTE).not.toContain('照常做完')
    const save = createSave()
    const first = fullWorker(save)
    const second = fullWorker(save)
    first.assignment = 'herbalism'
    save.stations.herbalism.manualRounds = 4
    save.stations.herbalism.progress = 0.4
    expect(manualQueueLeft(save, 'herbalism')).toBe(3)
    expect(canClearStationWork(save, 'herbalism')).toBe(true)

    expect(clearManualQueue(save, 'herbalism').ok).toBe(true)
    expect(save.stations.herbalism.manualRounds).toBe(0)
    expect(save.stations.herbalism.progress).toBe(0)
    expect(save.stations.herbalism.auto).toBe(false)
    expect(first.assignment).toBeNull()
    expect(second.assignment).toBeNull()
    expect(restingWorkers(save).map((worker) => worker.id)).toEqual([second.id, first.id])
    expect(manualQueueLeft(save, 'herbalism')).toBe(0)
    expect(stationRoundBadge(save, 'herbalism')).toBe('0')
    expect(canClearStationWork(save, 'herbalism')).toBe(false)
    expect(clearManualQueue(save, 'herbalism').ok).toBe(false)

    const done = ticks(save, 40)
    expect(done.stations.herbalism.completed ?? 0).toBe(0)
    expect(done.stations.herbalism.progress).toBe(0)
    expect(done.stations.herbalism.manualRounds).toBe(0)
    expect(done.workers.find((worker) => worker.id === first.id)?.assignment).toBeNull()
  })

  it('labels a queued station with later rounds and an idle station with headcount', () => {
    expect(ROUND_BADGE_TIP).toContain('后续轮次')
    expect(ROUND_BADGE_TIP).toContain('站里的人数')
    expect(ROUND_BADGE_TIP).toContain('∞')
    expect(ROUND_BADGE_TIP).toContain('不再留人常驻')
    expect(ROUND_BADGE_TIP).not.toContain('还剩几轮')
    const save = createSave()
    expect(stationRoundBadge(save, 'herbalism')).toBe('0')
    expect(stationRoundBadgeAria(save, 'herbalism')).toBe('站内 0 人，查看排队说明')

    const first = fullWorker(save)
    first.assignment = 'herbalism'
    save.stations.herbalism.manualRounds = 3
    expect(stationRoundBadge(save, 'herbalism')).toBe('×2')
    expect(stationRoundBadgeAria(save, 'herbalism')).toBe('后续排队 2 轮，查看排队说明')

    expect(clearManualQueue(save, 'herbalism').ok).toBe(true)
    expect(stationRoundBadge(save, 'herbalism')).toBe('0')
    expect(stationRoundBadgeAria(save, 'herbalism')).toBe('站内 0 人，查看排队说明')

    const waiting = createSave()
    fullWorker(waiting)
    waiting.stations.herbalism.manualRounds = 3
    expect(stationRoundBadge(waiting, 'herbalism')).toBe('×3')

    grantOpenedModules(save, ['alchemy'])
    const hand = fullWorker(save)
    expect(toggleStationAuto(save, 'alchemy').ok).toBe(true)
    hand.assignment = 'alchemy'
    expect(stationRoundBadge(save, 'alchemy')).toBe(AUTO_BADGE)
    expect(stationRoundBadgeAria(save, 'alchemy')).toBe('自动，无限排队，查看排队说明')
    expect(stationRoundBadge(save, 'mining')).toBe('0')
  })

  it('drops a waiting queue and also shuts an auto line', () => {
    const save = createSave()
    const waiting = fullWorker(save)
    save.stations.herbalism.manualRounds = 3
    save.stations.herbalism.progress = 0.2
    expect(manualQueueLeft(save, 'herbalism')).toBe(3)
    expect(clearManualQueue(save, 'herbalism').ok).toBe(true)
    expect(save.stations.herbalism.manualRounds).toBe(0)
    expect(save.stations.herbalism.progress).toBe(0)
    expect(waiting.assignment).toBeNull()
    pullWaitingManualRounds(save)
    expect(waiting.assignment).toBeNull()

    grantOpenedModules(save, ['alchemy'])
    const camper = fullWorker(save)
    const hand = fullWorker(save)
    expect(toggleStationAuto(save, 'alchemy').ok).toBe(true)
    hand.assignment = 'alchemy'
    save.stations.alchemy.progress = 0.55
    expect(save.stations.alchemy.auto).toBe(true)
    expect(stationRoundBadge(save, 'alchemy')).toBe(AUTO_BADGE)
    expect(clearManualQueue(save, 'alchemy').ok).toBe(true)
    expect(save.stations.alchemy.auto).toBe(false)
    expect(save.stations.alchemy.manualRounds).toBe(0)
    expect(save.stations.alchemy.progress).toBe(0)
    expect(hand.assignment).toBeNull()
    expect(stationRoundBadge(save, 'alchemy')).toBe('0')
    expect(restingWorkers(save).at(-1)?.id).toBe(hand.id)
    expect(restingWorkers(save).some((worker) => worker.id === camper.id)).toBe(true)
    const done = ticks(save, 40)
    expect(done.stations.alchemy.completed ?? 0).toBe(0)
    expect(done.stations.alchemy.auto).toBe(false)
    expect(done.workers.find((worker) => worker.id === hand.id)?.assignment).toBeNull()
  })

  it('refuses a click on an auto line', () => {
    const save = createSave()
    grantOpenedModules(save, ['alchemy'])
    fullWorker(save)
    expect(toggleStationAuto(save, 'herbalism').ok).toBe(true)
    expect(dispatchManualRound(save, 'herbalism')).toEqual({ ok: false, reason: '这条线已挂自动' })
  })

  it('rotates an auto line without a round cap and keeps pulling an empty station', () => {
    const save = createSave()
    grantOpenedModules(save, ['alchemy', 'tech'])
    const first = fullWorker(save)
    const second = fullWorker(save)
    const third = fullWorker(save)
    expect(toggleStationAuto(save, 'herbalism').ok).toBe(true)
    expect(toggleStationAuto(save, 'alchemy').ok).toBe(true)
    save.stations.herbalism.progress = 0.99
    first.assignment = 'herbalism'
    const done = ticks(save, 1)
    expect(done.stations.herbalism.auto).toBe(true)
    expect(done.stations.herbalism.manualRounds).toBe(0)
    expect(done.workers.find((worker) => worker.id === first.id)?.assignment).toBeNull()
    expect(restingWorkers(done).at(-1)?.id).toBe(first.id)
    expect(done.workers.find((worker) => worker.id === second.id)?.assignment).toBe('herbalism')
    expect(done.workers.find((worker) => worker.id === third.id)?.assignment).toBe('alchemy')
    expect(stationRoundBadge(done, 'herbalism')).toBe(AUTO_BADGE)

    const wounded = createSave()
    grantOpenedModules(wounded, ['alchemy'])
    const hurt = fullWorker(wounded)
    hurt.hp = 1
    expect(toggleStationAuto(wounded, 'herbalism').ok).toBe(true)
    const skipped = ticks(wounded, 3)
    expect(skipped.workers[0]?.assignment).toBeNull()
    expect(skipped.stations.herbalism.auto).toBe(true)

    const sealed = createSave()
    grantOpenedModules(sealed, ['alchemy'])
    const camper = fullWorker(sealed)
    expect(toggleStationAuto(sealed, 'herbalism').ok).toBe(true)
    sealed.stations.herbalism.closed = true
    const held = ticks(sealed, 2)
    expect(held.workers.find((worker) => worker.id === camper.id)?.assignment).toBeNull()
  })

  it('finishes the current auto round as one manual round when switched off', () => {
    const save = createSave()
    grantOpenedModules(save, ['alchemy'])
    const hand = fullWorker(save)
    const spare = fullWorker(save)
    expect(toggleStationAuto(save, 'herbalism').ok).toBe(true)
    hand.assignment = 'herbalism'
    save.stations.herbalism.progress = 0.99
    expect(toggleStationAuto(save, 'herbalism').ok).toBe(true)
    expect(save.stations.herbalism.auto).toBe(false)
    expect(save.stations.herbalism.manualRounds).toBe(1)
    expect(hand.assignment).toBe('herbalism')

    const done = ticks(save, 1)
    expect(done.stations.herbalism.auto).toBe(false)
    expect(done.stations.herbalism.manualRounds).toBe(0)
    expect(done.workers.find((worker) => worker.id === hand.id)?.assignment).toBeNull()
    expect(restingWorkers(done).at(-1)?.id).toBe(hand.id)
    expect(done.workers.find((worker) => worker.id === spare.id)?.assignment).toBeNull()
    const later = ticks(done, 30)
    expect(later.stations.herbalism.completed).toBe(done.stations.herbalism.completed)
    expect(later.workers.every((worker) => worker.assignment == null)).toBe(true)
  })
})
