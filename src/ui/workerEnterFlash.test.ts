import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  WORKER_ENTER_MS,
  WORKER_ENTER_STAGGER_MS,
  announceWorkerStationEnters,
  clearWorkerEnterFlash,
  isWorkerEntering,
  workerEnterDelayMs,
} from './workerEnterFlash'
import workersPanelSource from './workersPanelV2.vue?raw'

describe('worker station enter flash', () => {
  afterEach(() => {
    vi.useRealTimers()
    clearWorkerEnterFlash()
  })

  it('marks workers who leave rest for a station, staggered in roster order', () => {
    vi.useFakeTimers()
    const before = new Map<string, string | null>([
      ['w-1', null],
      ['w-2', 'mining'],
      ['w-3', null],
      ['w-4', null],
    ])
    const entered = announceWorkerStationEnters(before, [
      { id: 'w-1', assignment: 'herbalism' },
      { id: 'w-2', assignment: 'cooking' },
      { id: 'w-3', assignment: null },
      { id: 'w-4', assignment: 'alchemy' },
      { id: 'w-new', assignment: 'mining' },
    ])
    expect(entered).toEqual(['w-1', 'w-4'])
    expect(isWorkerEntering('w-1')).toBe(true)
    expect(workerEnterDelayMs('w-1')).toBe(0)
    expect(isWorkerEntering('w-4')).toBe(true)
    expect(workerEnterDelayMs('w-4')).toBe(WORKER_ENTER_STAGGER_MS)
    expect(isWorkerEntering('w-2')).toBe(false)
    expect(isWorkerEntering('w-3')).toBe(false)
    expect(isWorkerEntering('w-new')).toBe(false)

    vi.advanceTimersByTime(WORKER_ENTER_MS)
    expect(isWorkerEntering('w-1')).toBe(false)
    expect(isWorkerEntering('w-4')).toBe(true)
    vi.advanceTimersByTime(WORKER_ENTER_STAGGER_MS)
    expect(isWorkerEntering('w-4')).toBe(false)
  })

  it('does not mark a withdraw back to rest', () => {
    const entered = announceWorkerStationEnters(new Map([['w-1', 'mining']]), [
      { id: 'w-1', assignment: null },
    ])
    expect(entered).toEqual([])
    expect(isWorkerEntering('w-1')).toBe(false)
  })

  it('wires the station avatar enter class in the workshop panel', () => {
    expect(workersPanelSource).toContain('announceWorkerStationEnters')
    expect(workersPanelSource).toContain('enter-land')
    expect(workersPanelSource).toContain('enter-slot')
    expect(workersPanelSource).toContain('worker-enter')
    expect(workersPanelSource).toContain('animation-delay: var(--enter-delay, 0ms)')
  })
})
