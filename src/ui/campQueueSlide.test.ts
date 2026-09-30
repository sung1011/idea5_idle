import { describe, expect, it } from 'vitest'
import sheetSource from './campSheet.vue?raw'
import dragSource from './workerDrag.ts?raw'
import {
  CAMP_QUEUE_SLIDE_FUSE,
  CAMP_QUEUE_SLIDE_MS,
  campQueueHeadShift,
  setCampQueueSliding,
} from './campQueueSlide'

describe('camp queue head slide', () => {
  it('slides one cell when only the head leaves and at least two remain', () => {
    expect(CAMP_QUEUE_SLIDE_MS).toBe(300)
    const shift = campQueueHeadShift(['h', 'a', 'b', 'c'], ['a', 'b', 'c'])
    expect(shift).toEqual([
      { id: 'a', from: 1, to: 0 },
      { id: 'b', from: 2, to: 1 },
      { id: 'c', from: 3, to: 2 },
    ])
    expect(shift?.every((row) => row.from - row.to === 1)).toBe(true)
    expect(campQueueHeadShift(['h', 'a', 'b'], ['a', 'b', 'new'])).toEqual([
      { id: 'a', from: 1, to: 0 },
      { id: 'b', from: 2, to: 1 },
    ])
  })

  it('stays quiet for one person, a reorder, or a head that is still in camp', () => {
    expect(campQueueHeadShift(['h', 'a'], ['a'])).toBeNull()
    expect(campQueueHeadShift(['h'], [])).toBeNull()
    expect(campQueueHeadShift(['h', 'a', 'b'], ['a'])).toBeNull()
    expect(campQueueHeadShift(['h', 'a', 'b'], ['h', 'a'])).toBeNull()
    expect(campQueueHeadShift(['h', 'a', 'b', 'c'], ['a', 'c', 'b'])).toBeNull()
    expect(campQueueHeadShift(['h', 'a', 'b', 'c'], ['a', 'b', 'c', 'h'])).toBeNull()
    expect(campQueueHeadShift(['a', 'b', 'c', 'd'], ['b', 'c', 'd', 'a'])).toBeNull()
    expect(campQueueHeadShift([], ['a', 'b'])).toBeNull()
  })

  it('still shifts forward when the head leaves with another camp worker', () => {
    expect(campQueueHeadShift(['h', 'a', 'b', 'c'], ['b', 'c', 'fused'])).toEqual([
      { id: 'b', from: 2, to: 0 },
      { id: 'c', from: 3, to: 1 },
    ])
    expect(campQueueHeadShift(['h', 'a', 'b', 'c'], ['a', 'c'])).toEqual([
      { id: 'a', from: 1, to: 0 },
      { id: 'c', from: 3, to: 1 },
    ])
  })

  it('wires the slide on the camp sheet and blocks fuse while it plays', () => {
    expect(CAMP_QUEUE_SLIDE_FUSE).toBe('队列还在滑动')
    expect(sheetSource).toContain('campQueueHeadShift')
    expect(sheetSource).toContain('CAMP_QUEUE_SLIDE_MS')
    expect(sheetSource).toContain('isCampQueueSliding')
    expect(sheetSource).toContain("'queue-slide': slidingIds.includes(row.id)")
    expect(sheetSource).toContain('prefers-reduced-motion: reduce')
    const style = sheetSource.slice(sheetSource.indexOf('<style'))
    expect(style).toMatch(/\.row\.queue-slide\s*\{[^}]*transition:\s*transform 0\.3s linear/)
    const motion = style.slice(style.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(motion).toContain('.row.queue-slide')
    expect(motion).toContain('transition: none')
    const down = sheetSource.slice(
      sheetSource.indexOf('function onWorkerPointerDown'),
      sheetSource.indexOf('function onDragMove'),
    )
    expect(down).toContain('if (isCampQueueSliding()) return')
    const end = sheetSource.slice(
      sheetSource.indexOf('function onDragEnd'),
      sheetSource.indexOf('function restWorkerDropClass'),
    )
    expect(end.indexOf('isCampQueueSliding()')).toBeGreaterThanOrEqual(0)
    expect(end.indexOf('isCampQueueSliding()')).toBeLessThan(end.indexOf('game.dragAssign'))
    expect(dragSource).toContain('CAMP_QUEUE_SLIDE_FUSE')
    expect(dragSource).toContain('isCampQueueSliding()')
    setCampQueueSliding(false)
  })
})
