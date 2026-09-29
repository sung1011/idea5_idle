import { APP_UPDATE_CHECK_MS, hasRemoteUpdate, type AppVersionInfo } from './appVersion'

export type AppUpdateWatch = {
  check: () => Promise<void>
  onVisible: () => Promise<void>
  stop: () => void
}

export function startAppUpdateWatch(opts: {
  currentVersion: string
  intervalMs?: number
  fetchVersion: () => Promise<AppVersionInfo | null>
  onUpdate: (ready: boolean, remote?: AppVersionInfo) => void
  setInterval?: (fn: () => void, ms: number) => ReturnType<typeof setInterval>
  clearInterval?: (id: ReturnType<typeof setInterval>) => void
  listenVisible?: (fn: () => void) => () => void
}): AppUpdateWatch {
  const intervalMs = opts.intervalMs ?? APP_UPDATE_CHECK_MS
  const setTimer = opts.setInterval ?? ((fn, ms) => setInterval(fn, ms))
  const clearTimer = opts.clearInterval ?? ((id) => clearInterval(id))
  let stopped = false

  async function check() {
    if (stopped) return
    let remote: AppVersionInfo | null
    try {
      remote = await opts.fetchVersion()
    } catch {
      return
    }
    if (stopped || !remote) return
    opts.onUpdate(hasRemoteUpdate(opts.currentVersion, remote), remote)
  }

  const timer = setTimer(() => {
    void check()
  }, intervalMs)
  const stopVisible = opts.listenVisible?.(() => {
    void check()
  })
  void check()

  return {
    check,
    onVisible: check,
    stop() {
      stopped = true
      clearTimer(timer)
      stopVisible?.()
    },
  }
}
