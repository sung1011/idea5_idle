import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FUSE_JACKPOT_LINE,
  FUSE_JACKPOT_MS,
  announceFuseJackpot,
  clearFuseJackpotFlash,
  isFuseJackpotFlashing,
} from './fuseJackpotFlash'
import { useFloatTips } from './floatTips'
import gameStoreSource from './gameStore.ts?raw'
import sheetSource from './campSheet.vue?raw'

describe('fuse jackpot flash', () => {
  afterEach(() => {
    vi.useRealTimers()
    clearFuseJackpotFlash()
    useFloatTips().tips.value = []
  })

  it('says 成了 and sparks only that worker, then fades', () => {
    vi.useFakeTimers()
    announceFuseJackpot('w-9')
    announceFuseJackpot('')
    const tips = useFloatTips().tips.value
    expect(tips.map((tip) => tip.text)).toEqual([FUSE_JACKPOT_LINE])
    expect(FUSE_JACKPOT_LINE).toBe('成了！')
    expect(tips[0]?.kind).toBe('ok')
    expect(isFuseJackpotFlashing('w-9')).toBe(true)

    vi.advanceTimersByTime(FUSE_JACKPOT_MS)
    expect(isFuseJackpotFlashing('w-9')).toBe(false)
  })

  it('hangs the spark and the line on the camp avatar', () => {
    expect(sheetSource).toContain("'jackpot-flash': isFuseJackpotFlashing(row.id)")
    expect(sheetSource).toContain('class="jackpot-line"')
    expect(sheetSource).toContain('FUSE_JACKPOT_LINE')
    expect(sheetSource).toContain('jackpot-spark')
    expect(gameStoreSource).toContain('announceFuseJackpot')
    expect(gameStoreSource).toContain('result.fuseJackpot')
  })
})