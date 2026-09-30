import { describe, expect, it } from 'vitest'
import sheetSource from './campSheet.vue?raw'
import dragSource from './workerDrag.ts?raw'
import {
  CAMP_QUEUE_SLIDE_FUSE,
  CAMP_QUEUE_SLIDE_MS,
  campFuseTailHold,
  campQueueHeadShift,
  campQueueTailEnterOffset,
  campQueueTailEntries,
  campQueueTailHold,
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

  it('holds the fused newcomer until the head shift can play', () => {
    expect(campFuseTailHold(['h', 'a', 'b', 'c'], ['b', 'c', 'new'])).toBe('new')
    expect(campQueueHeadShift(['h', 'a', 'b', 'c'], ['b', 'c'])).toEqual([
      { id: 'b', from: 2, to: 0 },
      { id: 'c', from: 3, to: 1 },
    ])
    expect(campFuseTailHold(['h', 'a', 'b', 'c'], ['a', 'b', 'new'])).toBe('new')
    expect(campFuseTailHold(['h', 'a', 'b', 'c'], ['h', 'c', 'new'])).toBeNull()
    expect(campFuseTailHold(['h', 'a', 'b'], ['b', 'new'])).toBeNull()
    expect(campFuseTailHold(['h', 'a'], ['new'])).toBeNull()
    expect(campFuseTailHold(['h', 'a', 'b', 'c'], ['b', 'new', 'c'])).toBeNull()
  })

  it('finds people who arrived at the tail and holds them when a head shift comes first', () => {
    expect(campQueueTailEnterOffset(72, 8)).toEqual({ x: 80, y: 0 })
    expect(campQueueTailEntries(['h', 'a'], ['h', 'a', 'new'])).toEqual(['new'])
    expect(campQueueTailEntries([], ['new'])).toEqual(['new'])
    expect(campQueueTailEntries(['h'], ['h', 'r1', 'r2'])).toEqual(['r1', 'r2'])
    expect(campQueueTailEntries(['h', 'a', 'b', 'c'], ['h', 'c', 'new'])).toEqual(['new'])
    expect(campQueueTailEntries(['h', 'a', 'b', 'c'], ['b', 'c', 'new'])).toEqual(['new'])
    expect(campQueueTailEntries(['h', 'a'], ['new'])).toEqual(['new'])
    expect(campQueueTailHold(['h', 'a', 'b', 'c'], ['b', 'c', 'new'])).toEqual(['new'])
    expect(campQueueTailHold(['h', 'a', 'b'], ['a', 'b', 'back'])).toEqual(['back'])
    expect(campQueueTailHold(['h', 'a'], ['h', 'a', 'new'])).toBeNull()
    expect(campQueueTailHold(['h', 'a', 'b'], ['b', 'new'])).toBeNull()
    expect(campQueueTailEntries(['h', 'a', 'b'], ['a', 'b', 'h'])).toBeNull()
    expect(campQueueTailEntries(['h', 'a'], ['h', 'new', 'a'])).toBeNull()
    expect(campQueueTailEntries(['a', 'b', 'c'], ['c', 'a', 'b'])).toBeNull()
  })

  it('wires the slide on the camp sheet and blocks fuse while it plays', () => {
    expect(CAMP_QUEUE_SLIDE_FUSE).toBe('队列还在滑动')
    expect(sheetSource).toContain('campQueueHeadShift')
    expect(sheetSource).toContain('campQueueTailHold(before, after)')
    expect(sheetSource).toContain('campQueueTailEntries(before, after)')
    expect(sheetSource).toContain('playCampQueueTailEnter')
    expect(sheetSource).toContain('v-for="row in shownRows"')
    expect(sheetSource).toContain("'queue-enter': enteringIds.includes(row.id)")
    expect(sheetSource.indexOf('campQueueTailHold(before, after)')).toBeLessThan(
      sheetSource.indexOf('campQueueHeadShift(before, after)'),
    )
    expect(sheetSource).toContain('CAMP_QUEUE_SLIDE_MS')
    expect(sheetSource).toContain('isCampQueueSliding')
    expect(sheetSource).toContain("'queue-slide': slidingIds.includes(row.id)")
    expect(sheetSource).toContain('prefers-reduced-motion: reduce')
    const style = sheetSource.slice(sheetSource.indexOf('<style'))
    expect(style).toMatch(/\.row\.queue-slide,[\s\S]*?\.row\.queue-enter\s*\{[^}]*transition:\s*transform 0\.3s linear/)
    const motion = style.slice(style.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(motion).toContain('.row.queue-slide')
    expect(motion).toContain('.row.queue-enter')
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
