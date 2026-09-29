import { ref } from 'vue'
import { APP_VERSION } from '../generated/appVersion'
import { applyAppUpdate } from './applyAppUpdate'
import {
  loadDismissedUpdateVersion,
  saveDismissedUpdateVersion,
  shouldShowUpdateBubble,
  updateBubbleLines,
  type UpdateBubbleView,
} from './appUpdateBubble'
import { startAppUpdateWatch } from './appUpdateWatch'
import {
  APP_UPDATE_CHECK_MS,
  commitsBehind,
  hasRemoteUpdate,
  historyJsonUrl,
  parseHistory,
  parseRemoteVersion,
  sameCommitId,
  versionJsonUrl,
  type AppVersionInfo,
  type AppVersionNote,
  type UpdateGap,
} from './appVersion'
import { pushFloatTip } from './floatTips'

export const updateReady = ref(false)
export const updateChecking = ref(false)
export const updateDiffPending = ref(false)
export const updateGap = ref<UpdateGap | null>(null)
export const updateLatestNote = ref<AppVersionNote | null>(null)
export const updateBubble = ref<UpdateBubbleView | null>(null)

let watch: ReturnType<typeof startAppUpdateWatch> | null = null
let remoteTicket = 0

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

async function fetchHistory() {
  try {
    const url = historyJsonUrl(import.meta.env.BASE_URL, Date.now())
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    return parseHistory(await res.json())
  } catch {
    return null
  }
}

function latestNote(notes: readonly AppVersionNote[]): AppVersionNote | null {
  for (const note of notes) {
    const title = note?.title?.trim() ?? ''
    if (!title) continue
    return { at: note.at?.trim() ?? '', title }
  }
  return null
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

async function noteRemote(remote: AppVersionInfo, automatic: boolean) {
  const ticket = ++remoteTicket
  const ready = hasRemoteUpdate(APP_VERSION.version, remote)
  updateReady.value = ready
  updateLatestNote.value = latestNote(remote.notes)
  updateGap.value = null
  updateDiffPending.value = ready
  let gap: UpdateGap | null = null
  if (ready) {
    const history = await fetchHistory()
    if (ticket !== remoteTicket) return
    if (history && sameCommitId(history.version, remote.version)) {
      const found = commitsBehind(APP_VERSION.version, history.commits)
      if (found && found.behind > 0) gap = found
    }
  }
  if (ticket !== remoteTicket) return
  updateGap.value = gap
  updateDiffPending.value = false
  if (
    shouldShowUpdateBubble({
      currentVersion: APP_VERSION.version,
      remote,
      dismissedVersion: loadDismissedUpdateVersion(),
      automatic,
    })
  ) {
    updateBubble.value = {
      version: remote.version.trim(),
      lines: gap ? [] : updateBubbleLines(remote.notes),
      gap,
    }
    return
  }
  if (!ready) updateBubble.value = null
}

export function dismissUpdateBubble(): void {
  const version = updateBubble.value?.version
  if (version) saveDismissedUpdateVersion(version)
  updateBubble.value = null
}

export async function checkForAppUpdate(manual = false): Promise<void> {
  if (updateChecking.value) return
  updateChecking.value = true
  try {
    const remote = await fetchRemote()
    if (remote) {
      await noteRemote(remote, !manual)
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
    onUpdate: (ready, remote) => {
      if (remote) void noteRemote(remote, true)
      else updateReady.value = ready
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
