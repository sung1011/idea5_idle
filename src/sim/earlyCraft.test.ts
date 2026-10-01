import { describe, expect, it } from 'vitest'
import { assignWorker } from './assign'
import { bankQty } from './bank'
import { createSave } from './createSave'
import { grantOpenedModules } from './moduleUnlock'
import {
  EARLY_CRAFT_STATION_LEVEL_CAP,
  EARLY_HERB_ALCHEMY_CYCLE_MUL,
  earlyHerbAlchemyCycleMul,
  isEarlyHerbAlchemyPace,
} from './earlyCraft'
import { mainlineStepOf } from './mainlineQuest'
import { currentSpeed, stationCycleS } from './query'
import { recruitWorker } from './recruit'
import { ticks } from './tick'
import { SOLO_STAFF_MUL } from './tech'

function withWorker(): ReturnType<typeof createSave> {
  const save = createSave()
  save.diamonds = 15
  grantOpenedModules(save, ['alchemy'])
  expect(recruitWorker(save).ok).toBe(true)
  return save
}

describe('early herb/alchemy cycle', () => {
  it('shortens tutorial herb and alchemy pots, not mining or late/high-level pots', () => {
    const save = createSave()
    expect(isEarlyHerbAlchemyPace(save)).toBe(true)
    expect(earlyHerbAlchemyCycleMul(save, 'herbalism')).toBe(EARLY_HERB_ALCHEMY_CYCLE_MUL)
    expect(earlyHerbAlchemyCycleMul(save, 'alchemy')).toBe(EARLY_HERB_ALCHEMY_CYCLE_MUL)
    expect(earlyHerbAlchemyCycleMul(save, 'mining')).toBe(1)
    expect(stationCycleS(save, 'herbalism')).toBeCloseTo(20 * EARLY_HERB_ALCHEMY_CYCLE_MUL)
    expect(stationCycleS(save, 'alchemy')).toBeCloseTo(40 * EARLY_HERB_ALCHEMY_CYCLE_MUL)
    expect(stationCycleS(save, 'mining')).toBeCloseTo(20)

    save.stations.herbalism.stationLevel = EARLY_CRAFT_STATION_LEVEL_CAP
    expect(stationCycleS(save, 'herbalism')).toBeCloseTo(20)
    expect(stationCycleS(save, 'alchemy')).toBeCloseTo(40 * EARLY_HERB_ALCHEMY_CYCLE_MUL)

    save.guideQuestStep = mainlineStepOf('huntStart')
    expect(isEarlyHerbAlchemyPace(save)).toBe(false)
    expect(stationCycleS(save, 'herbalism')).toBeCloseTo(20)
    expect(stationCycleS(save, 'alchemy')).toBeCloseTo(40)
  })

  it('lets a tutorial alchemy pot finish in a few seconds, while late pots still take the table time', () => {
    const early = withWorker()
    early.bank.herb = 1
    expect(assignWorker(early, early.workers[0].id, 'alchemy').ok).toBe(true)
    const earlySpeed = currentSpeed(early, 'alchemy')
    expect(earlySpeed).toBeCloseTo((1 / (40 * EARLY_HERB_ALCHEMY_CYCLE_MUL)) * SOLO_STAFF_MUL)
    const done = ticks(early, 8)
    expect(done.stations.alchemy.completed).toBe(1)
    expect(bankQty(done, 'herb')).toBe(0)

    const late = withWorker()
    late.guideQuestStep = mainlineStepOf('huntStart')
    late.bank.herb = 1
    expect(assignWorker(late, late.workers[0].id, 'alchemy').ok).toBe(true)
    expect(ticks(late, 8).stations.alchemy.completed ?? 0).toBe(0)
    expect(ticks(late, 32).stations.alchemy.completed).toBe(1)
  })
})
