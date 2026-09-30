/** 草地衬底中段暗绿（tokens.css 里 42% 那一档），用来避免启动白闪。 */
export const PWA_THEME_COLOR = '#1c522c'

export const ADD_TO_HOME_LABEL = '添加到桌面'
export const ADD_TO_HOME_IOS_TITLE = '添加到主屏幕'
export const ADD_TO_HOME_IOS_STEPS = ['点底部「分享」', '再选「添加到主屏幕」'] as const
export const ADD_TO_HOME_EXTERNAL_TITLE = '用系统浏览器打开'
export const ADD_TO_HOME_EXTERNAL_TIP = '请点右上角，用系统浏览器打开。'
export const ADD_TO_HOME_WAIT_TITLE = '稍后再试'
export const ADD_TO_HOME_WAIT_TIP = '系统安装框还没准备好，请稍后再试。'

/** 气泡说明。 */
export const ADD_TO_HOME_BUBBLE_BODY = '下次一点就进部落'

/** 点过气泡 × 或「添加」（含设置卡片）之后不再弹。不进游戏存档。以前的红点也写这个键。 */
export const ADD_TO_HOME_DOT_KEY = 'idea5IdleAddToHomeDot'

/** 点「添加」后留在气泡里的说明。ios 是两步，其余是一句提示。 */
export type AddToHomeGuide = 'ios' | 'external' | 'wait'

/** 设置里「添加到桌面」点下去之后该做什么。 */
export type AddToHomeChoice = 'hidden' | 'native' | 'ios' | 'external'

export type AddToHomeClick = 'hidden' | 'prompted' | 'ios' | 'external' | 'wait'

export interface AddToHomeEnv {
  userAgent: string
  /** iPadOS 桌面 UA 靠触点数和 Safari 区分。 */
  maxTouchPoints: number
  displayStandalone: boolean
  navigatorStandalone: boolean
  /** 已经缓存 beforeinstallprompt。 */
  hasPrompt: boolean
  /** 已经收到 appinstalled。 */
  installed: boolean
}

export interface InstallPromptEvent {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  preventDefault: () => void
}

const IN_APP_UA =
  /MicroMessenger|QQ\/|MQQBrowser|Weibo|AlipayClient|DingTalk|BytedanceWebview|\baweme\b|wxwork|Instagram|FBAN|FBAV|Line\/|Twitter|TikTok/i

/** 微信、QQ 以及同类内置浏览器。这些环境没有系统安装框，也不走 Safari 的分享菜单。 */
export function isInAppBrowser(userAgent: string): boolean {
  return IN_APP_UA.test(userAgent)
}

/** 安卓 Chrome / Edge / 三星，以及桌面 Chrome / Edge。 */
export function isNativeInstallBrowser(userAgent: string): boolean {
  if (isInAppBrowser(userAgent)) return false
  if (/SamsungBrowser\//i.test(userAgent)) return true
  if (/EdgA?\//i.test(userAgent)) return true
  if (/OPR\/|Opera Mini|UCBrowser|CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent)) return false
  return /Chrome\/|Chromium\//i.test(userAgent)
}

/** iPhone / iPad 上的 Safari。iOS 上的 Chrome、Edge 和内置浏览器不算。 */
export function isIosSafari(userAgent: string, maxTouchPoints = 0): boolean {
  if (isInAppBrowser(userAgent)) return false
  if (/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|OPT\//i.test(userAgent)) return false
  const ipadDesktop = /Macintosh/i.test(userAgent) && maxTouchPoints > 1
  const ios = /iPhone|iPad|iPod/i.test(userAgent) || ipadDesktop
  if (!ios) return false
  return /Safari/i.test(userAgent) && !/Chrome|Chromium|Android/i.test(userAgent)
}

export function addToHomeChoice(env: AddToHomeEnv): AddToHomeChoice {
  if (env.installed || env.displayStandalone || env.navigatorStandalone) return 'hidden'
  if (isInAppBrowser(env.userAgent)) return 'external'
  if (isNativeInstallBrowser(env.userAgent)) return 'native'
  if (isIosSafari(env.userAgent, env.maxTouchPoints)) return 'ios'
  return 'external'
}

/**
 * 主线「出征」领奖之后才弹。还停在这一步、已关掉、或已经是桌面窗口，都不弹。
 * `guideQuestStep` 领完当前步才会加一，所以要比出征步号更大。
 */
export function shouldShowAddToHomeBubble(input: {
  choice: AddToHomeChoice
  dismissed: boolean
  guideQuestStep: number
  combatStep: number
}): boolean {
  if (input.dismissed || input.choice === 'hidden') return false
  const step = Number.isFinite(input.guideQuestStep) ? Math.floor(input.guideQuestStep) : 0
  const combat = Number.isFinite(input.combatStep) ? Math.floor(input.combatStep) : 0
  if (combat < 1) return false
  return step > combat
}

function storageOf(storage?: Storage | null): Storage | null {
  if (storage) return storage
  if (typeof localStorage === 'undefined') return null
  return localStorage
}

export function loadAddToHomeDismissed(storage?: Storage | null): boolean {
  const store = storageOf(storage)
  if (!store) return false
  try {
    const raw = store.getItem(ADD_TO_HOME_DOT_KEY)
    if (raw == null) return false
    const text = raw.trim().toLowerCase()
    return text === '1' || text === 'true' || text === 'seen'
  } catch {
    return false
  }
}

export function saveAddToHomeDismissed(storage?: Storage | null): void {
  const store = storageOf(storage)
  if (!store) return
  try {
    store.setItem(ADD_TO_HOME_DOT_KEY, '1')
  } catch {
    // quota / private mode
  }
}

function asInstallPrompt(ev: Event): InstallPromptEvent | null {
  const candidate = ev as Event & Partial<InstallPromptEvent>
  if (typeof candidate.prompt !== 'function') return null
  return candidate as InstallPromptEvent
}

/**
 * 缓存安装事件。判定只看环境快照，方便测试；浏览器监听由调用方接上。
 */
export function createAddToHomeSession(readEnv: () => Omit<AddToHomeEnv, 'hasPrompt' | 'installed'>, onChoice: (choice: AddToHomeChoice) => void) {
  let prompt: InstallPromptEvent | null = null
  let installed = false

  const snapshot = (): AddToHomeEnv => ({
    ...readEnv(),
    hasPrompt: prompt != null,
    installed,
  })

  const publish = () => onChoice(addToHomeChoice(snapshot()))

  publish()

  return {
    onBeforeInstall(ev: Event) {
      const next = asInstallPrompt(ev)
      if (!next) return
      ev.preventDefault()
      prompt = next
      publish()
    },
    onInstalled() {
      installed = true
      prompt = null
      publish()
    },
    async activate(): Promise<AddToHomeClick> {
      const choice = addToHomeChoice(snapshot())
      if (choice === 'hidden') return 'hidden'
      if (choice === 'ios') return 'ios'
      if (choice === 'external') return 'external'
      const pending = prompt
      if (!pending) return 'wait'
      prompt = null
      publish()
      try {
        await pending.prompt()
      } catch {
        return 'wait'
      }
      try {
        await pending.userChoice
      } catch {
        /* 选择结果不影响按钮是否还在。 */
      }
      publish()
      return 'prompted'
    },
  }
}
