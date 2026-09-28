import { describe, expect, it } from 'vitest'
import panel from './herbPvpPanel.vue?raw'
import {
  HERB_CLEAR_FLASH_MS,
  HERB_CLEAR_FX_CAP,
  HERB_CLEAR_FX_MS,
  HERB_CLEAR_FX_QUEUE_MAX,
  createHerbClearBoard,
  herbClearCaption,
  offerHerbClearFx,
  pumpHerbClearFx,
  type HerbClearOffer,
} from './herbClearFx'

function offer(index: number): HerbClearOffer {
  return { plotIndex: index, tone: 'rival', text: '甲 割走了', alert: index === 1 }
}

describe('herb clear fx', () => {
  it('plays at most three and queues a short delay, dropping the rest', () => {
    const board = createHerbClearBoard()
    offerHerbClearFx(
      board,
      Array.from({ length: 8 }, (_, index) => offer(index)),
      0,
    )
    expect(HERB_CLEAR_FLASH_MS).toBe(1500)
    expect(HERB_CLEAR_FX_MS).toBe(2500)
    expect(board.playing).toHaveLength(HERB_CLEAR_FX_CAP)
    expect(board.queued).toHaveLength(HERB_CLEAR_FX_QUEUE_MAX)
    expect(board.playing.map((fx) => fx.plotIndex)).toEqual([0, 1, 2])
    expect(board.queued.map((fx) => fx.plotIndex)).toEqual([3, 4, 5])
    expect(board.playing[1]?.alert).toBe(true)

    pumpHerbClearFx(board, 1500)
    expect(board.playing.map((fx) => fx.plotIndex)).toEqual([0, 1, 2])
    expect(board.queued).toHaveLength(3)

    pumpHerbClearFx(board, 2500)
    expect(board.playing.map((fx) => fx.plotIndex)).toEqual([3, 4, 5])
    expect(board.queued).toHaveLength(0)
    expect(board.playing.every((fx) => fx.until === 5000)).toBe(true)
  })

  it('lets a queued clear start once a slot is free after the short delay', () => {
    const board = createHerbClearBoard()
    offerHerbClearFx(board, [offer(0), offer(1), offer(2), offer(3)], 0)
    expect(board.playing).toHaveLength(3)
    expect(board.queued.map((fx) => fx.readyAt)).toEqual([200])
    pumpHerbClearFx(board, 1500)
    expect(board.playing.map((fx) => fx.plotIndex)).toEqual([0, 1, 2])
    pumpHerbClearFx(board, 2500)
    expect(board.playing.map((fx) => fx.plotIndex)).toEqual([3])
    expect(board.playing[0]?.until).toBe(5000)
    expect(board.queued).toHaveLength(0)
  })

  it('only animates live clears on the herb map, and reduces motion to a flash', () => {
    expect(panel).toContain('discardHerbClearEvents')
    expect(panel).toContain('takeHerbClearEvents')
    expect(panel).toContain('offerHerbClearFx')
    expect(panel).toContain('class="leaf"')
    expect(panel).toContain('1.5s')
    expect(panel).toContain('2.5s')
    expect(panel).not.toContain('0.6s')
    expect(panel).toContain('prefers-reduced-motion')
    expect(panel).toContain('herb-flash')
    expect(panel).toContain('herb-flash-still')
    expect(herbClearCaption({ tone: 'self', text: '草 ×2' })).toBe('+草 ×2')
    expect(herbClearCaption({ tone: 'self', text: '荒芜' })).toBe('荒芜')
    expect(herbClearCaption({ tone: 'rival', text: '甲 割走了' })).toBe('甲 割走了')
  })
})