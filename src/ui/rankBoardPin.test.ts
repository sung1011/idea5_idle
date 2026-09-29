import { describe, expect, it } from 'vitest'
import beast from './beastPvpPanel.vue?raw'
import herb from './herbPvpPanel.vue?raw'
import board from './rankBoard.vue?raw'
import {
  RANK_LIST_MAX_HEIGHT,
  RANK_ROW_GAP,
  RANK_ROW_MIN_HEIGHT,
  rankSelfNeedsPin,
} from './rankBoardPin'

const view = {
  rowCount: 50,
  scrollTop: 0,
  viewHeight: RANK_LIST_MAX_HEIGHT,
  rowHeight: RANK_ROW_MIN_HEIGHT,
  rowGap: RANK_ROW_GAP,
}

describe('rank self pin', () => {
  it('hides the pin when the self row is inside the visible window', () => {
    expect(rankSelfNeedsPin({ ...view, selfIndex: 0 })).toBe(false)
    expect(rankSelfNeedsPin({ ...view, selfIndex: 4 })).toBe(false)
  })

  it('pins when the self row is scrolled out or not among the visible rows', () => {
    expect(rankSelfNeedsPin({ ...view, selfIndex: -1 })).toBe(true)
    expect(rankSelfNeedsPin({ ...view, selfIndex: 20 })).toBe(true)
    const stride = RANK_ROW_MIN_HEIGHT + RANK_ROW_GAP
    expect(rankSelfNeedsPin({ ...view, selfIndex: 2, scrollTop: 3 * stride })).toBe(true)
    expect(rankSelfNeedsPin({ ...view, selfIndex: 8, scrollTop: 8 * stride })).toBe(false)
  })

  it('keeps a short list from pinning a row that is already on screen', () => {
    expect(
      rankSelfNeedsPin({
        selfIndex: 1,
        rowCount: 3,
        scrollTop: 0,
        viewHeight: RANK_LIST_MAX_HEIGHT,
        rowHeight: RANK_ROW_MIN_HEIGHT,
        rowGap: RANK_ROW_GAP,
      }),
    ).toBe(false)
  })

  it('shares one amber row style and a bottom pin on both boards', () => {
    expect(herb).toContain('<RankBoard')
    expect(beast).toContain('<RankBoard')
    expect(herb).not.toContain('class="ranks"')
    expect(beast).not.toMatch(/\.board li\.self\s*\{[^}]*font-weight/)
    expect(board).toContain('class="rank-pin rank-row self"')
    expect(board).toContain('aria-label="我的名次"')
    expect(board).toContain('rankSelfNeedsPin')
    const selfRule = board.match(/\.rank-row\.self\s*\{[^}]*\}/)
    expect(selfRule?.[0]).toContain('background: #f6d59a')
    expect(selfRule?.[0]).toContain('border-left-color: #e07a12')
    expect(selfRule?.[0]).not.toContain('font-weight')
    expect(board).toContain('font-weight: 400')
    expect(board).toContain('min-height: 36px')
    expect(board).toContain('gap: 4px')
    expect(board).toContain('max-height: 220px')
    expect(board).toContain('min-width: 0')
    expect(board).toContain('text-overflow: ellipsis')
    expect(board).toContain('tabular-nums')
    expect(board).toContain('border-left: 3px solid transparent')
  })
})
