import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSave } from '../sim/createSave'
import { spawnWorker } from '../sim/recruit'
import { useFloatTips } from './floatTips'
import { announceWorkerLevelUps, clearWorkerLevelFlash, isWorkerLevelFlashing } from './workerLevelFlash'

describe('worker level-up feedback', () => {
  afterEach(() => {
    vi.useRealTimers()
    clearWorkerLevelFlash()
    useFloatTips().tips.value = []
  })

  it('floats the reached level and flashes that worker only', () => {
    vi.useFakeTimers()
    const save = createSave()
    const worker = spawnWorker(save)
    worker.name = '阿铁'
    worker.level = 3
    const stranger = spawnWorker(save)
    stranger.name = '新人'
    stranger.level = 4

    announceWorkerLevelUps(new Map([[worker.id, 1]]), [worker, stranger])
    const tips = useFloatTips().tips.value
    expect(tips.map((tip) => tip.text)).toEqual(['阿铁 升至 Lv3'])
    expect(tips[0]?.kind).toBe('ok')
    expect(isWorkerLevelFlashing(worker.id)).toBe(true)
    expect(isWorkerLevelFlashing(stranger.id)).toBe(false)

    announceWorkerLevelUps(new Map([[worker.id, 3]]), [worker])
    expect(useFloatTips().tips.value.map((tip) => tip.text)).toEqual(['阿铁 升至 Lv3'])

    vi.advanceTimersByTime(1400)
    expect(isWorkerLevelFlashing(worker.id)).toBe(false)
    expect(useFloatTips().tips.value).toHaveLength(0)
  })
})