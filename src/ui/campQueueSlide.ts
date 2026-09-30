/** 营地队列前移滑动。约 0.3 秒。 */
export const CAMP_QUEUE_SLIDE_MS = 300
/** 滑动期间拖合成的拒绝文案。 */
export const CAMP_QUEUE_SLIDE_FUSE = '队列还在滑动'

export type CampQueueShift = {
  id: string
  from: number
  to: number
}

let campQueueSliding = false

export function isCampQueueSliding(): boolean {
  return campQueueSliding
}

export function setCampQueueSliding(sliding: boolean): void {
  campQueueSliding = sliding
}

/**
 * 队首已经不在营地，且还留在队列里的人仍按原顺序往前排。
 * 每人的 from / to 是休息队列下标。只走掉队首时每人正好前移一格。
 * 队首还在队列里（手动改序）、后面的人被打乱、或营地只剩 0 / 1 人时返回 null。
 */
export function campQueueHeadShift(
  beforeIds: readonly string[],
  afterIds: readonly string[],
): CampQueueShift[] | null {
  if (beforeIds.length < 2 || afterIds.length < 2) return null
  const head = beforeIds[0]
  if (!head || afterIds.includes(head)) return null
  const indexAfter = new Map(afterIds.map((id, index) => [id, index]))
  const shifts: CampQueueShift[] = []
  let prev = -1
  for (let from = 1; from < beforeIds.length; from += 1) {
    const id = beforeIds[from]
    if (!id) continue
    const to = indexAfter.get(id)
    if (to == null) continue
    if (to >= from || to <= prev) return null
    prev = to
    shifts.push({ id, from, to })
  }
  if (shifts.length === 0) return null
  return shifts
}

/**
 * 合成带走了队首，且去掉新人后后面至少还有 2 人要前移。
 * 返回队尾那名新人的 id，界面先播前移，再把这个人放出来。
 * 队首还在、新人不是队尾、或前移播不出来时返回 null。
 */
export function campFuseTailHold(beforeIds: readonly string[], afterIds: readonly string[]): string | null {
  if (beforeIds.length < 4 || afterIds.length < 3) return null
  const newbornId = afterIds[afterIds.length - 1]
  if (!newbornId || beforeIds.includes(newbornId)) return null
  const shifted = afterIds.slice(0, -1)
  const removed = beforeIds.filter((id) => !shifted.includes(id))
  if (removed.length !== 2 || !removed.includes(beforeIds[0] ?? '')) return null
  const stayed = beforeIds.filter((id) => !removed.includes(id))
  if (stayed.length !== shifted.length) return null
  for (let i = 0; i < stayed.length; i += 1) {
    if (stayed[i] !== shifted[i]) return null
  }
  if (!campQueueHeadShift(beforeIds, shifted)) return null
  return newbornId
}

/**
 * 新出现在队尾的人，按队列顺序。
 * 前面留下的人必须仍是原来的相对顺序。插在中间或只是把旧人换到队尾时返回 null。
 */
export function campQueueTailEntries(beforeIds: readonly string[], afterIds: readonly string[]): string[] | null {
  if (afterIds.length === 0) return null
  const known = new Set(beforeIds)
  let split = afterIds.length
  while (split > 0 && !known.has(afterIds[split - 1] ?? '')) split -= 1
  const entries = afterIds.slice(split)
  if (entries.length === 0) return null
  let prev = -1
  for (const id of afterIds.slice(0, split)) {
    const at = beforeIds.indexOf(id)
    if (at < 0 || at <= prev) return null
    prev = at
  }
  return entries
}

/**
 * 队尾新人要等队首出队滑完再出现。出队播不出来时返回 null，新人当场进队尾。
 */
export function campQueueTailHold(beforeIds: readonly string[], afterIds: readonly string[]): string[] | null {
  const entries = campQueueTailEntries(beforeIds, afterIds)
  if (!entries) return null
  const prefix = afterIds.slice(0, afterIds.length - entries.length)
  if (!campQueueHeadShift(beforeIds, prefix)) return null
  return entries
}

/** 进队尾时从格子右侧外侧起步，滑进空位。 */
export function campQueueTailEnterOffset(cellWidth: number, gap: number): { x: number; y: number } {
  const width = Number.isFinite(cellWidth) && cellWidth > 0 ? cellWidth : 0
  const gutter = Number.isFinite(gap) && gap > 0 ? gap : 0
  return { x: width + gutter, y: 0 }
}
