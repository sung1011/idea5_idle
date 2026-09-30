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
