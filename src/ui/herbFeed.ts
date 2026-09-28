import { herbClashResultText, type HerbClashResult } from '../sim/herbPvp'

/** 地图下方可回看的记录。只收眼前实时事件，离线补算不会进这里。 */
export const HERB_FEED_LIMIT = 5

export type HerbFeedKind = 'self' | 'rival' | 'clash'

export type HerbFeedLine = {
  id: number
  kind: HerbFeedKind
  text: string
}

export function herbClashFeedText(event: { rival: { name: string }; result: HerbClashResult }): string {
  return `撞上${event.rival.name}，${herbClashResultText(event.result)}`
}

/** 新的排在最前。空批次（离线没有事件）不改记录。超出上限丢掉最旧的。 */
export function pushHerbFeed(
  current: readonly HerbFeedLine[],
  incoming: readonly HerbFeedLine[],
  limit = HERB_FEED_LIMIT,
): HerbFeedLine[] {
  if (!incoming.length) return current.slice()
  const next = current.slice()
  for (const line of incoming) next.unshift(line)
  return next.slice(0, Math.max(0, limit))
}
