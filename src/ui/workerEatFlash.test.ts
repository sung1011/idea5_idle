import { afterEach, describe, expect, it, vi } from 'vitest'
import { WORKER_EAT_MS, announceWorkerEats, clearWorkerEatFlash, isWorkerEatFlashing, workerEatFlashText } from './workerEatFlash'
import { useFloatTips } from './floatTips'
import gameStoreSource from './gameStore.ts?raw'
import workersPanelSource from './workersPanelV2.vue?raw'

describe('worker eat flash', () => {
  afterEach(() => {
    vi.useRealTimers()
    clearWorkerEatFlash()
    useFloatTips().tips.value = []
  })

  it('floats the meal message and flashes only that worker', () => {
    vi.useFakeTimers()
    announceWorkerEats([
      { workerId: 'w-1', message: '吃了熟食 +25' },
      { workerId: 'w-2', message: '   ' },
    ])
    const tips = useFloatTips().tips.value
    expect(tips.map((tip) => tip.text)).toEqual(['吃了熟食 +25'])
    expect(tips[0]?.kind).toBe('ok')
    expect(isWorkerEatFlashing('w-1')).toBe(true)
    expect(workerEatFlashText('w-1')).toBe('吃了熟食 +25')
    expect(isWorkerEatFlashing('w-2')).toBe(false)

    vi.advanceTimersByTime(WORKER_EAT_MS)
    expect(isWorkerEatFlashing('w-1')).toBe(false)
    expect(workerEatFlashText('w-1')).toBe('')
    expect(useFloatTips().tips.value.map((tip) => tip.text)).toEqual(['吃了熟食 +25'])

    vi.advanceTimersByTime(700)
    expect(useFloatTips().tips.value).toHaveLength(0)
  })

  it('shows the glow and the float on the rest row', () => {
    expect(workersPanelSource).toContain("'eat-flash': isWorkerEatFlashing(row.id)")
    expect(workersPanelSource).toContain('class="eat-float"')
    expect(workersPanelSource).toContain('workerEatFlashText(row.id)')
    expect(workersPanelSource).toContain('eat-glow 0.7s')
    expect(gameStoreSource).toContain('announceWorkerEats')
    expect(gameStoreSource).toContain('takeRestEatNotices')
  })
})