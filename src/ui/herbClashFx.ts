import type { HerbClashEvent } from '../sim/herbPvp'
import { herbClashResultText } from '../sim/herbPvp'

/** 一击约 0.7 秒，还手再 0.7 秒，结果停留约 1 秒。有还手时整段约 2.4 秒。 */
export const HERB_CLASH_STRIKE_MS = 700
export const HERB_CLASH_RESULT_MS = 1000

export type HerbClashPhase = 'strike' | 'counter' | 'result'

export type HerbClashPlaying = {
  event: HerbClashEvent
  phase: HerbClashPhase
  until: number
}

export type HerbClashBoard = {
  playing: HerbClashPlaying | null
  queued: HerbClashEvent[]
}

export function createHerbClashBoard(): HerbClashBoard {
  return { playing: null, queued: [] }
}

/** 第一下就把对方打死时，没有还手。 */
export function herbClashOpeningKill(event: HerbClashEvent): boolean {
  if (event.attacker === 'player') return event.rivalDamage <= 0 && event.rival.hpEnd <= 0
  return event.playerDamage <= 0 && event.player.hpEnd <= 0
}

function phaseMs(phase: HerbClashPhase): number {
  return phase === 'result' ? HERB_CLASH_RESULT_MS : HERB_CLASH_STRIKE_MS
}

function startPlaying(event: HerbClashEvent, now: number): HerbClashPlaying {
  return { event, phase: 'strike', until: now + HERB_CLASH_STRIKE_MS }
}

function advance(playing: HerbClashPlaying, now: number): HerbClashPlaying | null {
  if (playing.phase === 'strike') {
    const phase: HerbClashPhase = herbClashOpeningKill(playing.event) ? 'result' : 'counter'
    return { event: playing.event, phase, until: now + phaseMs(phase) }
  }
  if (playing.phase === 'counter') {
    return { event: playing.event, phase: 'result', until: now + HERB_CLASH_RESULT_MS }
  }
  return null
}

function pullNext(board: HerbClashBoard, now: number): void {
  const next = board.queued.shift()
  board.playing = next ? startPlaying(next, now) : null
}

/** 多场排队，同一时间只播一场。 */
export function offerHerbClashes(board: HerbClashBoard, events: readonly HerbClashEvent[], now: number): void {
  for (const event of events) {
    if (!board.playing && board.queued.length === 0) {
      board.playing = startPlaying(event, now)
      continue
    }
    board.queued.push(event)
  }
}

export function pumpHerbClash(board: HerbClashBoard, now: number): void {
  if (!board.playing) {
    pullNext(board, now)
    return
  }
  if (board.playing.until > now) return
  const next = advance(board.playing, now)
  if (next) {
    board.playing = next
    return
  }
  board.playing = null
  pullNext(board, now)
}

/** 点一下结束当前这场，马上播下一场。 */
export function skipHerbClash(board: HerbClashBoard, now: number): void {
  board.playing = null
  pullNext(board, now)
}

export type HerbClashMotion = {
  lunge: 'player' | 'rival' | null
  hurt: 'player' | 'rival' | null
}

export function herbClashMotion(event: HerbClashEvent, phase: HerbClashPhase): HerbClashMotion {
  if (phase === 'result') return { lunge: null, hurt: null }
  if (phase === 'strike') {
    return event.attacker === 'player' ? { lunge: 'player', hurt: 'rival' } : { lunge: 'rival', hurt: 'player' }
  }
  return event.attacker === 'player' ? { lunge: 'rival', hurt: 'player' } : { lunge: 'player', hurt: 'rival' }
}

export function herbClashFloat(event: HerbClashEvent, phase: HerbClashPhase): { side: 'player' | 'rival'; amount: number } | null {
  if (phase === 'result') return null
  if (phase === 'strike') {
    const amount = event.attacker === 'player' ? event.playerDamage : event.rivalDamage
    if (amount <= 0) return null
    return { side: event.attacker === 'player' ? 'rival' : 'player', amount }
  }
  const amount = event.attacker === 'player' ? event.rivalDamage : event.playerDamage
  if (amount <= 0) return null
  return { side: event.attacker === 'player' ? 'player' : 'rival', amount }
}

export type HerbClashBar = { from: number; to: number }

function ratio(hp: number, hpMax: number): number {
  const cap = Math.max(1, hpMax)
  return Math.min(1, Math.max(0, hp) / cap)
}

export function herbClashBars(event: HerbClashEvent, phase: HerbClashPhase): { player: HerbClashBar; rival: HerbClashBar } {
  const playerStrike = event.attacker === 'player' ? event.player.hpStart : Math.max(0, event.player.hpStart - event.rivalDamage)
  const rivalStrike = event.attacker === 'rival' ? event.rival.hpStart : Math.max(0, event.rival.hpStart - event.playerDamage)
  if (phase === 'strike') {
    return {
      player: { from: ratio(event.player.hpStart, event.player.hpMax), to: ratio(playerStrike, event.player.hpMax) },
      rival: { from: ratio(event.rival.hpStart, event.rival.hpMax), to: ratio(rivalStrike, event.rival.hpMax) },
    }
  }
  if (phase === 'counter') {
    return {
      player: { from: ratio(playerStrike, event.player.hpMax), to: ratio(event.player.hpEnd, event.player.hpMax) },
      rival: { from: ratio(rivalStrike, event.rival.hpMax), to: ratio(event.rival.hpEnd, event.rival.hpMax) },
    }
  }
  return {
    player: { from: ratio(event.player.hpEnd, event.player.hpMax), to: ratio(event.player.hpEnd, event.player.hpMax) },
    rival: { from: ratio(event.rival.hpEnd, event.rival.hpMax), to: ratio(event.rival.hpEnd, event.rival.hpMax) },
  }
}

export { herbClashResultText }
