/** 割完一块地的短动画。同时最多 3 个，多的短延迟排队，排满就丢掉。 */
export const HERB_CLEAR_FX_MS = 600
export const HERB_CLEAR_FX_CAP = 3
export const HERB_CLEAR_FX_GAP_MS = 200
export const HERB_CLEAR_FX_QUEUE_MAX = 3

export type HerbClearOffer = {
  plotIndex: number
  tone: 'self' | 'rival'
  text: string
  alert: boolean
}

export type HerbClearFx = HerbClearOffer & {
  id: number
  until: number
}

type HerbClearQueued = HerbClearOffer & {
  id: number
  readyAt: number
}

export type HerbClearBoard = {
  playing: HerbClearFx[]
  queued: HerbClearQueued[]
  nextId: number
}

export function createHerbClearBoard(): HerbClearBoard {
  return { playing: [], queued: [], nextId: 1 }
}

export function offerHerbClearFx(board: HerbClearBoard, events: readonly HerbClearOffer[], now: number): void {
  for (const event of events) {
    if (board.playing.length + board.queued.length >= HERB_CLEAR_FX_CAP + HERB_CLEAR_FX_QUEUE_MAX) continue
    const id = board.nextId
    board.nextId += 1
    if (board.playing.length < HERB_CLEAR_FX_CAP && board.queued.length === 0) {
      board.playing.push({ ...event, id, until: now + HERB_CLEAR_FX_MS })
      continue
    }
    board.queued.push({
      ...event,
      id,
      readyAt: now + HERB_CLEAR_FX_GAP_MS * (board.queued.length + 1),
    })
  }
}

export function pumpHerbClearFx(board: HerbClearBoard, now: number): void {
  board.playing = board.playing.filter((fx) => fx.until > now)
  while (board.playing.length < HERB_CLEAR_FX_CAP && board.queued.length > 0) {
    const next = board.queued[0]
    if (!next || next.readyAt > now) break
    board.queued.shift()
    board.playing.push({
      plotIndex: next.plotIndex,
      tone: next.tone,
      text: next.text,
      alert: next.alert,
      id: next.id,
      until: now + HERB_CLEAR_FX_MS,
    })
  }
}
