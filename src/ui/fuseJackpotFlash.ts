import { ref } from 'vue'
import { pushFloatTip } from './floatTips'

/** 大成功时头像火花停留这么久。 */
export const FUSE_JACKPOT_MS = 900
/** 玩家看见的短句。 */
export const FUSE_JACKPOT_LINE = '成了！'

const flashingIds = ref<string[]>([])
const timers = new Map<string, ReturnType<typeof setTimeout>>()

export function isFuseJackpotFlashing(workerId: string): boolean {
  return flashingIds.value.includes(workerId)
}

export function clearFuseJackpotFlash(): void {
  for (const timer of timers.values()) clearTimeout(timer)
  timers.clear()
  flashingIds.value = []
}

export function markFuseJackpotFlash(workerId: string): void {
  if (!workerId) return
  if (!flashingIds.value.includes(workerId)) {
    flashingIds.value = [...flashingIds.value, workerId]
  }
  const prev = timers.get(workerId)
  if (prev) clearTimeout(prev)
  const later = typeof window !== 'undefined' ? window.setTimeout.bind(window) : setTimeout
  timers.set(
    workerId,
    later(() => {
      timers.delete(workerId)
      flashingIds.value = flashingIds.value.filter((id) => id !== workerId)
    }, FUSE_JACKPOT_MS),
  )
}

/** 合成大成功：漂一句短台词，并让新人头像短闪火花。 */
export function announceFuseJackpot(workerId: string): void {
  if (!workerId) return
  pushFloatTip(FUSE_JACKPOT_LINE, 'ok')
  markFuseJackpotFlash(workerId)
}
