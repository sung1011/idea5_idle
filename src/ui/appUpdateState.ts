import { ref } from 'vue'
import { APP_VERSION } from '../generated/appVersion'
import { applyAppUpdate } from './applyAppUpdate'
import { startAppUpdateWatch } from './appUpdateWatch'
import { APP_UPDATE_CHECK_MS, hasRemoteUpdate, parseRemoteVersion, versionJsonUrl } from './appVersion'
import { pushFloatTip } from './floatTips'

export const updateReady = ref(false)
export const updateChecking = ref(false)

let watch: ReturnType<typeof startAppUpdateWatch> | null = null

async function fetchRemote() {
  try {
    const url = versionJsonUrl(import.meta.env.BASE_URL, Date.now())
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    return parseRemoteVersion(await res.json())
  } catch {
    return null
  }
}

async function nudgeServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    await reg?.update()
  } catch {
    /* 检测以 version.json 为准，Service Worker 刷新失败不挡红点。 */
  }
}

export async function checkForAppUpdate(manual = false): Promise<void> {
  if (updateChecking.value) return
  updateChecking.value = true
  try {
    const remote = await fetchRemote()
    if (remote) {
      updateReady.value = hasRemoteUpdate(APP_VERSION.version, remote)
      if (manual) pushFloatTip(updateReady.value ? '有新版本' : '已是当前版本')
    } else if (manual) {
      pushFloatTip('暂时查不到新版本', 'err')
    }
    await nudgeServiceWorker()
  } finally {
    updateChecking.value = false
  }
}

export function startAppUpdateSchedule(): () => void {
  watch?.stop()
  watch = startAppUpdateWatch({
    currentVersion: APP_VERSION.version,
    intervalMs: APP_UPDATE_CHECK_MS,
    fetchVersion: async () => {
      const remote = await fetchRemote()
      await nudgeServiceWorker()
      return remote
    },
    onUpdate: (ready) => {
      updateReady.value = ready
    },
    listenVisible(fn) {
      const onVis = () => {
        if (document.visibilityState === 'visible') fn()
      }
      document.addEventListener('visibilitychange', onVis)
      return () => document.removeEventListener('visibilitychange', onVis)
    },
  })
  return () => watch?.stop()
}

export async function refreshToNewVersion(): Promise<void> {
  await applyAppUpdate()
}
