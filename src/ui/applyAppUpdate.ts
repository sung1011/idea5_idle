type ApplyEnv = {
  skipWaiting?: () => Promise<void> | void
  reload: () => void
  waitMs?: number
  sleep?: (ms: number) => Promise<void>
}

/** 只有玩家点刷新才走这里。先通知等待中的 Service Worker 接手，再重新载入。不改存档。 */
export async function applyAppUpdate(env?: ApplyEnv): Promise<void> {
  const used: ApplyEnv = env ?? browserApplyEnv()
  await used.skipWaiting?.()
  const wait = used.sleep ?? sleep
  await wait(used.waitMs ?? 400)
  used.reload()
}

function browserApplyEnv(): ApplyEnv {
  return {
    async skipWaiting() {
      if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
      const reg = await navigator.serviceWorker.getRegistration()
      if (!reg) return
      if (!reg.waiting) {
        try {
          await reg.update()
        } catch {
          /* 没有可接手的 worker 时仍然重新载入。 */
        }
        const start = Date.now()
        while (!reg.waiting && Date.now() - start < 1500) await sleep(100)
      }
      const waiting = reg.waiting
      if (!waiting) return
      const claimed = new Promise<void>((resolve) => {
        const done = () => {
          navigator.serviceWorker.removeEventListener('controllerchange', done)
          resolve()
        }
        navigator.serviceWorker.addEventListener('controllerchange', done)
      })
      waiting.postMessage({ type: 'SKIP_WAITING' })
      await Promise.race([claimed, sleep(1500)])
    },
    reload() {
      window.location.reload()
    },
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
