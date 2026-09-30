import { ref } from 'vue'
import {
  addToHomeChoice,
  createAddToHomeSession,
  loadAddToHomeDismissed,
  saveAddToHomeDismissed,
  type AddToHomeChoice,
  type AddToHomeClick,
} from './addToHome'

export const addToHomeChoiceNow = ref<AddToHomeChoice>('external')
export const addToHomeDismissedNow = ref(loadAddToHomeDismissed())

/** 点 × 或「添加」一次就记下，不论后面是安装框、说明还是没装上。 */
export function markAddToHomeDismissed(storage?: Storage | null) {
  saveAddToHomeDismissed(storage)
  addToHomeDismissedNow.value = true
}

let session: ReturnType<typeof createAddToHomeSession> | null = null

function readEnv() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { userAgent: '', maxTouchPoints: 0, displayStandalone: false, navigatorStandalone: false }
  }
  const nav = navigator as Navigator & { standalone?: boolean }
  let displayStandalone = false
  try {
    displayStandalone = window.matchMedia('(display-mode: standalone)').matches
  } catch {
    displayStandalone = false
  }
  return {
    userAgent: nav.userAgent ?? '',
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    displayStandalone,
    navigatorStandalone: nav.standalone === true,
  }
}

export function startAddToHomeWatch(): () => void {
  const next = createAddToHomeSession(readEnv, (choice) => {
    addToHomeChoiceNow.value = choice
  })
  const onPrompt = (ev: Event) => next.onBeforeInstall(ev)
  const onInstalled = () => next.onInstalled()
  window.addEventListener('beforeinstallprompt', onPrompt)
  window.addEventListener('appinstalled', onInstalled)
  session = next
  return () => {
    window.removeEventListener('beforeinstallprompt', onPrompt)
    window.removeEventListener('appinstalled', onInstalled)
    if (session === next) session = null
  }
}

export function requestAddToHome(): Promise<AddToHomeClick> {
  if (!session) {
    const choice = addToHomeChoice({ ...readEnv(), hasPrompt: false, installed: false })
    if (choice === 'native') return Promise.resolve('wait')
    return Promise.resolve(choice)
  }
  return session.activate()
}
