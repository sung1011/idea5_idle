import { describe, expect, it } from 'vitest'
import type { HerbClashEvent } from '../sim/herbPvp'
import { herbClashResultText } from '../sim/herbPvp'
import panel from './herbPvpPanel.vue?raw'
import {
  HERB_CLASH_RESULT_MS,
  HERB_CLASH_STRIKE_MS,
  createHerbClashBoard,
  herbClashBars,
  herbClashFloat,
  herbClashMotion,
  herbClashOpeningKill,
  offerHerbClashes,
  pumpHerbClash,
  skipHerbClash,
} from './herbClashFx'

function duel(patch: Partial<HerbClashEvent> = {}): HerbClashEvent {
  return {
    plotIndex: 3,
    attacker: 'player',
    player: { name: '甲', avatarId: '', classId: 'herbalist', hpMax: 100, hpStart: 100, hpEnd: 80 },
    rival: { name: '乙', avatarId: 'helm', classId: '', hpMax: 50, hpStart: 50, hpEnd: 20 },
    playerDamage: 30,
    rivalDamage: 20,
    result: 'lost',
    ...patch,
  }
}

describe('herb clash playback', () => {
  it('plays one duel at a time and skips the counter when the first hit kills', () => {
    const board = createHerbClashBoard()
    const kill = duel({
      rival: { name: '乙', avatarId: 'helm', classId: '', hpMax: 50, hpStart: 30, hpEnd: 0 },
      player: { name: '甲', avatarId: '', classId: 'herbalist', hpMax: 100, hpStart: 100, hpEnd: 100 },
      playerDamage: 30,
      rivalDamage: 0,
      result: 'took',
    })
    const second = duel({ plotIndex: 4 })
    offerHerbClashes(board, [kill, second], 0)
    expect(board.playing?.event.plotIndex).toBe(3)
    expect(board.playing?.phase).toBe('strike')
    expect(board.queued).toHaveLength(1)
    expect(herbClashOpeningKill(kill)).toBe(true)
    expect(herbClashMotion(kill, 'strike')).toEqual({ lunge: 'player', hurt: 'rival' })
    expect(herbClashFloat(kill, 'strike')).toEqual({ side: 'rival', amount: 30 })
    expect(herbClashResultText('took')).toBe('抢下这块地')

    pumpHerbClash(board, HERB_CLASH_STRIKE_MS)
    expect(board.playing?.phase).toBe('result')
    expect(board.queued).toHaveLength(1)

    pumpHerbClash(board, HERB_CLASH_STRIKE_MS + HERB_CLASH_RESULT_MS)
    expect(board.playing?.event.plotIndex).toBe(4)
    expect(board.playing?.phase).toBe('strike')
    expect(board.queued).toHaveLength(0)
  })

  it('shows the counter then the result, and a click skips to the next duel', () => {
    const board = createHerbClashBoard()
    const trade = duel()
    const next = duel({ plotIndex: 9, attacker: 'rival', result: 'held' })
    offerHerbClashes(board, [trade, next], 0)
    expect(herbClashOpeningKill(trade)).toBe(false)
    expect(herbClashMotion(trade, 'counter')).toEqual({ lunge: 'rival', hurt: 'player' })
    expect(herbClashFloat(trade, 'counter')).toEqual({ side: 'player', amount: 20 })
    expect(herbClashResultText('lost')).toBe('没打过')
    expect(herbClashResultText('held')).toBe('还在除')

    const bars = herbClashBars(trade, 'strike')
    expect(bars.rival.to).toBeLessThan(bars.rival.from)
    expect(bars.player.from).toBe(bars.player.to)

    pumpHerbClash(board, HERB_CLASH_STRIKE_MS)
    expect(board.playing?.phase).toBe('counter')
    pumpHerbClash(board, HERB_CLASH_STRIKE_MS * 2)
    expect(board.playing?.phase).toBe('result')
    expect(board.playing?.until).toBe(HERB_CLASH_STRIKE_MS * 2 + HERB_CLASH_RESULT_MS)

    skipHerbClash(board, 50)
    expect(board.playing?.event.plotIndex).toBe(9)
    expect(board.playing?.phase).toBe('strike')
    expect(herbClashMotion(next, 'strike')).toEqual({ lunge: 'rival', hurt: 'player' })
  })

  it('wires the popup on the herb map and drops motion to a flash', () => {
    expect(panel).toContain('skipHerbClash')
    expect(panel).toContain('herbClashResultText')
    expect(panel).toContain('clash-card')
    expect(panel).toContain('prefers-reduced-motion')
    expect(panel).toContain('herb-lunge-right')
  })
})
