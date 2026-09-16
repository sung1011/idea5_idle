import { afterEach, describe, expect, it, vi } from 'vitest'
import { pushFloatTip, useFloatTips } from './floatTips'

describe('floatTips', () => {
  afterEach(() => {
    vi.useRealTimers()
    const { tips } = useFloatTips()
    tips.value = []
  })

  it('stacks short tips and drops them after the fade', () => {
    vi.useFakeTimers()
    const { tips } = useFloatTips()
    pushFloatTip('没有空闲工人', 'err')
    pushFloatTip('金币不足', 'err')
    expect(tips.value).toHaveLength(2)
    expect(tips.value.map((tip) => tip.text)).toEqual(['没有空闲工人', '金币不足'])
    vi.advanceTimersByTime(1400)
    expect(tips.value).toHaveLength(0)
  })

  it('ignores blank text', () => {
    const { tips } = useFloatTips()
    pushFloatTip('   ')
    expect(tips.value).toHaveLength(0)
  })
})
