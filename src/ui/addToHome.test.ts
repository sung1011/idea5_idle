import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mainlineStepOf } from '../sim/mainlineQuest'
import app from './app.vue?raw'
import bubble from './addToHomeBubble.vue?raw'
import settings from './settingsPanel.vue?raw'
import { UPDATE_BUBBLE_DISMISS_KEY } from './appUpdateBubble'
import {
  ADD_TO_HOME_BUBBLE_BODY,
  ADD_TO_HOME_DOT_KEY,
  ADD_TO_HOME_EXTERNAL_TIP,
  ADD_TO_HOME_IOS_STEPS,
  ADD_TO_HOME_LABEL,
  ADD_TO_HOME_WAIT_TIP,
  PWA_THEME_COLOR,
  addToHomeChoice,
  createAddToHomeSession,
  loadAddToHomeDismissed,
  saveAddToHomeDismissed,
  shouldShowAddToHomeBubble,
  type AddToHomeChoice,
  type AddToHomeEnv,
  type InstallPromptEvent,
} from './addToHome'
import { addToHomeChoiceNow, addToHomeDismissedNow, markAddToHomeDismissed } from './addToHomeState'

const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
const EDGE_ANDROID =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 EdgA/120.0.0.0'
const SAMSUNG =
  'Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36'
const CHROME_DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const EDGE_DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const SAFARI_IPAD =
  'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
const WECHAT_ANDROID =
  'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/98.0.4758.102 Mobile Safari/537.36 MicroMessenger/8.0.0'
const WECHAT_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.0 Safari/604.1'
const QQ_ANDROID =
  'Mozilla/5.0 (Linux; U; Android 12; zh-cn) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/89.0.4389.72 MQQBrowser/6.2 Mobile Safari/537.36 QQ/8.9.0.1234'
const FIREFOX =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
const CRIOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1'
const OPERA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0'

function env(patch: Partial<AddToHomeEnv> & Pick<AddToHomeEnv, 'userAgent'>): AddToHomeEnv {
  return {
    maxTouchPoints: 0,
    displayStandalone: false,
    navigatorStandalone: false,
    hasPrompt: false,
    installed: false,
    ...patch,
  }
}

function fakePrompt(): InstallPromptEvent & { preventDefault: ReturnType<typeof vi.fn>; prompt: ReturnType<typeof vi.fn> } {
  return {
    preventDefault: vi.fn(),
    prompt: vi.fn(async () => {}),
    userChoice: Promise.resolve({ outcome: 'dismissed' as const }),
  }
}

describe('add to home choice', () => {
  it('hides in standalone, on an iOS home screen, and after install', () => {
    expect(addToHomeChoice(env({ userAgent: CHROME_ANDROID, hasPrompt: true, displayStandalone: true }))).toBe('hidden')
    expect(addToHomeChoice(env({ userAgent: SAFARI_IPHONE, navigatorStandalone: true }))).toBe('hidden')
    expect(addToHomeChoice(env({ userAgent: EDGE_DESKTOP, hasPrompt: true, installed: true }))).toBe('hidden')
  })

  it('uses the system prompt on Android Chrome, Edge, Samsung and desktop Chrome, Edge', () => {
    for (const userAgent of [CHROME_ANDROID, EDGE_ANDROID, SAMSUNG, CHROME_DESKTOP, EDGE_DESKTOP]) {
      expect(addToHomeChoice(env({ userAgent, hasPrompt: true }))).toBe('native')
      expect(addToHomeChoice(env({ userAgent, hasPrompt: false }))).toBe('native')
    }
  })

  it('shows the share-sheet guide on iOS Safari, including iPad desktop UA', () => {
    expect(addToHomeChoice(env({ userAgent: SAFARI_IPHONE }))).toBe('ios')
    expect(addToHomeChoice(env({ userAgent: SAFARI_IPAD }))).toBe('ios')
    expect(addToHomeChoice(env({ userAgent: SAFARI_MAC, maxTouchPoints: 5 }))).toBe('ios')
    expect(addToHomeChoice(env({ userAgent: SAFARI_MAC, maxTouchPoints: 0 }))).toBe('external')
  })

  it('tells WeChat, QQ and unsupported browsers to open the system browser', () => {
    expect(addToHomeChoice(env({ userAgent: WECHAT_ANDROID, hasPrompt: true }))).toBe('external')
    expect(addToHomeChoice(env({ userAgent: WECHAT_IOS }))).toBe('external')
    expect(addToHomeChoice(env({ userAgent: QQ_ANDROID, hasPrompt: true }))).toBe('external')
    expect(addToHomeChoice(env({ userAgent: FIREFOX }))).toBe('external')
    expect(addToHomeChoice(env({ userAgent: CRIOS }))).toBe('external')
    expect(addToHomeChoice(env({ userAgent: OPERA, hasPrompt: true }))).toBe('external')
  })
})

describe('add to home session', () => {
  it('caches the install event and only calls prompt for a native browser', async () => {
    const state = env({ userAgent: CHROME_DESKTOP })
    const seen: AddToHomeChoice[] = []
    const session = createAddToHomeSession(() => state, (choice) => seen.push(choice))
    expect(seen.at(-1)).toBe('native')
    expect(await session.activate()).toBe('wait')

    const prompt = fakePrompt()
    session.onBeforeInstall(prompt as unknown as Event)
    expect(prompt.preventDefault).toHaveBeenCalledOnce()
    expect(seen.at(-1)).toBe('native')
    expect(await session.activate()).toBe('prompted')
    expect(prompt.prompt).toHaveBeenCalledOnce()
    expect(await session.activate()).toBe('wait')
  })

  it('does not call a cached prompt inside WeChat', async () => {
    const state = env({ userAgent: WECHAT_ANDROID })
    const session = createAddToHomeSession(() => state, () => {})
    const prompt = fakePrompt()
    session.onBeforeInstall(prompt as unknown as Event)
    expect(prompt.preventDefault).toHaveBeenCalledOnce()
    expect(await session.activate()).toBe('external')
    expect(prompt.prompt).not.toHaveBeenCalled()
  })

  it('hides after appinstalled and leaves an iOS tap on the guide', async () => {
    const state = env({ userAgent: SAFARI_IPHONE })
    const seen: AddToHomeChoice[] = []
    const session = createAddToHomeSession(() => state, (choice) => seen.push(choice))
    expect(await session.activate()).toBe('ios')
    session.onInstalled()
    expect(seen.at(-1)).toBe('hidden')
    expect(await session.activate()).toBe('hidden')
  })

  it('hides when the page is already a standalone display', async () => {
    const state = env({ userAgent: CHROME_ANDROID, displayStandalone: true })
    const session = createAddToHomeSession(() => state, () => {})
    const prompt = fakePrompt()
    session.onBeforeInstall(prompt as unknown as Event)
    expect(await session.activate()).toBe('hidden')
    expect(prompt.prompt).not.toHaveBeenCalled()
  })
})

function memoryStorage(seed: Record<string, string> = {}) {
  const data = { ...seed }
  return {
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null
    },
    setItem(key: string, value: string) {
      data[key] = value
    },
    removeItem(key: string) {
      delete data[key]
    },
  } as Storage
}

describe('add to home bubble', () => {
  const combatStep = mainlineStepOf('combat')

  function show(patch: Partial<Parameters<typeof shouldShowAddToHomeBubble>[0]> = {}) {
    return shouldShowAddToHomeBubble({
      choice: 'native',
      dismissed: false,
      guideQuestStep: combatStep + 1,
      combatStep,
      ...patch,
    })
  }

  afterEach(() => {
    addToHomeChoiceNow.value = 'external'
    addToHomeDismissedNow.value = false
  })

  it('waits until the combat step is claimed, and never shows once dismissed or installed', () => {
    expect(combatStep).toBe(9)
    expect(show({ guideQuestStep: combatStep })).toBe(false)
    expect(show({ guideQuestStep: combatStep - 1 })).toBe(false)
    expect(show({ guideQuestStep: 1 })).toBe(false)
    expect(show()).toBe(true)
    expect(show({ choice: 'ios' })).toBe(true)
    expect(show({ choice: 'external' })).toBe(true)
    expect(show({ choice: 'hidden' })).toBe(false)
    expect(show({ dismissed: true })).toBe(false)
    expect(show({ guideQuestStep: Number.NaN })).toBe(false)
    expect(show({ combatStep: 0 })).toBe(false)
  })

  it('remembers the click in local storage and keeps the version bubble key', () => {
    const store = memoryStorage({ [UPDATE_BUBBLE_DISMISS_KEY]: 'abc1234' })
    expect(loadAddToHomeDismissed(store)).toBe(false)
    saveAddToHomeDismissed(store)
    expect(store.getItem(ADD_TO_HOME_DOT_KEY)).toBe('1')
    expect(loadAddToHomeDismissed(store)).toBe(true)
    expect(loadAddToHomeDismissed(memoryStorage({ [ADD_TO_HOME_DOT_KEY]: ' seen ' }))).toBe(true)
    expect(store.getItem(UPDATE_BUBBLE_DISMISS_KEY)).toBe('abc1234')
    expect(show({ dismissed: loadAddToHomeDismissed(store) })).toBe(false)
  })

  it('marks the bubble dismissed as soon as add is used, without waiting for install', () => {
    const store = memoryStorage()
    expect(addToHomeDismissedNow.value).toBe(false)
    markAddToHomeDismissed(store)
    expect(addToHomeDismissedNow.value).toBe(true)
    expect(loadAddToHomeDismissed(store)).toBe(true)
    expect(show({ dismissed: addToHomeDismissedNow.value })).toBe(false)
  })
})

describe('add to home surface', () => {
  it('keeps the grass green on the manifest and the theme-color meta', () => {
    expect(PWA_THEME_COLOR).toBe('#1c522c')
    const html = readFileSync('index.html', 'utf8')
    const vite = readFileSync('vite.config.ts', 'utf8')
    expect(html).toContain(`name="theme-color" content="${PWA_THEME_COLOR}"`)
    expect(vite).toContain(`theme_color: '${PWA_THEME_COLOR}'`)
    expect(vite).toContain(`background_color: '${PWA_THEME_COLOR}'`)
    expect(html).not.toContain('#fff8ee')
    expect(vite).not.toContain('#fff8ee')
  })

  it('puts the button on the settings panel without touching the version check', () => {
    expect(ADD_TO_HOME_LABEL).toBe('添加到桌面')
    expect(ADD_TO_HOME_IOS_STEPS).toEqual(['点底部「分享」', '再选「添加到主屏幕」'])
    expect(ADD_TO_HOME_EXTERNAL_TIP).toContain('右上角')
    expect(ADD_TO_HOME_WAIT_TIP).toContain('系统安装框')
    expect(settings).toContain('ADD_TO_HOME_LABEL')
    expect(settings).toContain('ADD_TO_HOME_IOS_STEPS')
    expect(settings).toContain('ADD_TO_HOME_EXTERNAL_TIP')
    expect(settings).toContain("addToHomeChoiceNow !== 'hidden'")
    expect(settings).toContain('添加到主屏幕')
    expect(settings).toContain('有新版本，点击刷新')
    expect(settings).toContain('检查更新')
    expect(app).toContain('startAddToHomeWatch')
    expect(app).toContain('startAppUpdateSchedule')
    expect(settings).not.toContain('localStorage')
  })

  it('pops the home bubble after the version bubble and drops the add-to-home dots', () => {
    const versionDot = settings.indexOf("p.id === 'version' && updateReady")
    const click = settings.indexOf('async function onAddToHome')
    const mark = settings.indexOf('markAddToHomeDismissed()', click)
    const request = settings.indexOf('requestAddToHome()', click)
    const versionBubble = app.indexOf('<AppUpdateBubble')
    const homeBubble = app.indexOf('<AddToHomeBubble')
    expect(versionDot).toBeGreaterThan(0)
    expect(mark).toBeGreaterThan(click)
    expect(request).toBeGreaterThan(mark)
    expect(homeBubble).toBeGreaterThan(versionBubble)
    expect(ADD_TO_HOME_BUBBLE_BODY).toBe('下次一点就进部落')
    expect(bubble).toContain('ADD_TO_HOME_LABEL')
    expect(bubble).toContain('ADD_TO_HOME_BUBBLE_BODY')
    expect(bubble).toContain('ADD_TO_HOME_IOS_STEPS')
    expect(bubble).toContain('tone="produce"')
    expect(bubble).toContain('aria-label="关闭"')
    expect(bubble).toContain('>添加</ActButton>')
    expect(app).toContain('!updateBubble && !settingsOpen && (addToHomeBubbleOn || addToHomeFollow)')
    expect(app).toContain('updateBubble && !settingsOpen')
    expect(app).toContain("updateReady ? '设置，有新版本' : '设置'")
    expect(app).toContain('v-if="updateReady"')
    expect(app).not.toContain('addToHomeDot')
    expect(app).not.toContain('可添加到桌面')
    expect(settings).not.toContain('addToHomeDot')
    expect(settings).toContain("addToHomeChoiceNow !== 'hidden'")
    expect(settings).toContain('class="add"')
  })
})
