import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import app from './app.vue?raw'
import settings from './settingsPanel.vue?raw'
import {
  ADD_TO_HOME_EXTERNAL_TIP,
  ADD_TO_HOME_IOS_STEPS,
  ADD_TO_HOME_LABEL,
  ADD_TO_HOME_WAIT_TIP,
  PWA_THEME_COLOR,
  addToHomeChoice,
  createAddToHomeSession,
  type AddToHomeChoice,
  type AddToHomeEnv,
  type InstallPromptEvent,
} from './addToHome'

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
  })
})
