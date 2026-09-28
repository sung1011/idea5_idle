import { afterEach, describe, expect, it, vi } from 'vitest'
import app from './app.vue?raw'
import settings from './settingsPanel.vue?raw'
import { applyAppUpdate } from './applyAppUpdate'
import { startAppUpdateWatch } from './appUpdateWatch'
import {
  APP_UPDATE_CHECK_MS,
  APP_VERSION_NOTE_LIMIT,
  dueForUpdateCheck,
  formatBeijingDateTime,
  hasRemoteUpdate,
  parseCommitLog,
  parseRemoteVersion,
  versionInfoFromCommitLog,
  versionJsonUrl,
} from './appVersion'

const log = [
  '4ce787c\t2026-09-28T01:36:00.000Z\t割草撞车只有打死抢到地才扣体力',
  'c2c58f3\t2026-09-28T01:32:00.000Z\t割草体力上限改为 100，旧档按十倍换算，派人改用通用选苦工面板',
  'd5e6af5\t2026-09-28T01:00:00.000Z\t第一行说明\n这行不该进标题',
].join('\n')

describe('app version log', () => {
  it('keeps the newest 10 commit subjects and the short hash', () => {
    const extra = Array.from({ length: 12 }, (_, index) => `abc${index}\t2026-09-01T00:00:0${index % 10}.000Z\t说明 ${index}`).join('\n')
    const notes = parseCommitLog(`${log}\n${extra}`)
    expect(notes).toHaveLength(APP_VERSION_NOTE_LIMIT)
    expect(notes[0]).toMatchObject({ version: '4ce787c', title: '割草撞车只有打死抢到地才扣体力' })
    expect(notes[2]?.title).toBe('第一行说明')
    const info = versionInfoFromCommitLog(log)
    expect(info.version).toBe('4ce787c')
    expect(info.releasedAt).toBe('2026-09-28T01:36:00.000Z')
    expect(info.notes.map((note) => note.title)).toEqual([
      '割草撞车只有打死抢到地才扣体力',
      '割草体力上限改为 100，旧档按十倍换算，派人改用通用选苦工面板',
      '第一行说明',
    ])
  })

  it('falls back to the current version label when the log is missing', () => {
    expect(versionInfoFromCommitLog('')).toEqual({ version: 'dev', releasedAt: '', notes: [] })
    expect(versionInfoFromCommitLog('not a commit line')).toEqual({ version: 'dev', releasedAt: '', notes: [] })
  })
})

describe('app version compare', () => {
  it('treats a different short hash as an update and ignores dev or empty payloads', () => {
    const remote = { version: 'bbbbbbb', releasedAt: '2026-09-28T01:36:00.000Z', notes: [] }
    expect(hasRemoteUpdate('aaaaaaa', remote)).toBe(true)
    expect(hasRemoteUpdate('bbbbbbb', remote)).toBe(false)
    expect(hasRemoteUpdate('  bbbbbbb  ', { ...remote, version: 'bbbbbbb' })).toBe(false)
    expect(hasRemoteUpdate('dev', remote)).toBe(false)
    expect(hasRemoteUpdate('aaaaaaa', { ...remote, version: 'dev' })).toBe(false)
    expect(hasRemoteUpdate('aaaaaaa', null)).toBe(false)
    expect(hasRemoteUpdate('aaaaaaa', { ...remote, version: '  ' })).toBe(false)
  })

  it('parses a version json and drops broken notes', () => {
    expect(parseRemoteVersion(null)).toBeNull()
    expect(parseRemoteVersion({ releasedAt: '2026-09-28T00:00:00.000Z' })).toBeNull()
    expect(
      parseRemoteVersion({
        version: ' abc1234 ',
        releasedAt: '2026-09-28T01:36:00.000Z',
        notes: [
          { at: '2026-09-28T01:36:00.000Z', title: '  有新版本说明 \n第二行' },
          { at: '', title: '缺时间' },
          { title: '缺字段' },
        ],
      }),
    ).toEqual({
      version: 'abc1234',
      releasedAt: '2026-09-28T01:36:00.000Z',
      notes: [{ at: '2026-09-28T01:36:00.000Z', title: '有新版本说明' }],
    })
  })

  it('formats Beijing time and busts the version json cache', () => {
    expect(formatBeijingDateTime('2026-09-28T01:36:00.000Z')).toBe('2026-09-28 09:36')
    expect(formatBeijingDateTime('2026-09-28T16:00:00.000Z')).toBe('2026-09-29 00:00')
    expect(formatBeijingDateTime('')).toBe('')
    expect(formatBeijingDateTime('nope')).toBe('')
    expect(versionJsonUrl('/idea5_idle/', 1_700_000_000_123)).toBe('/idea5_idle/version.json?t=1700000000123')
    expect(versionJsonUrl('/idea5_idle', 12)).toBe('/idea5_idle/version.json?t=12')
  })

  it('checks on open, then again after 30 minutes', () => {
    expect(APP_UPDATE_CHECK_MS).toBe(30 * 60 * 1000)
    expect(dueForUpdateCheck(null, 1_000)).toBe(true)
    expect(dueForUpdateCheck(1_000, 1_000 + APP_UPDATE_CHECK_MS - 1)).toBe(false)
    expect(dueForUpdateCheck(1_000, 1_000 + APP_UPDATE_CHECK_MS)).toBe(true)
  })
})

describe('app update watch', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('checks when opened, on the timer, and when the page is shown again', async () => {
    const seen: boolean[] = []
    let ticks = 0
    const hooks: { visible: (() => void) | null; timer: (() => void) | null } = { visible: null, timer: null }
    const watch = startAppUpdateWatch({
      currentVersion: 'aaaaaaa',
      intervalMs: 50,
      fetchVersion: async () => {
        ticks += 1
        return { version: ticks === 1 ? 'bbbbbbb' : 'aaaaaaa', releasedAt: '', notes: [] }
      },
      onUpdate: (ready) => seen.push(ready),
      setInterval: (fn) => {
        hooks.timer = fn
        return 1 as unknown as ReturnType<typeof setInterval>
      },
      clearInterval: () => {
        hooks.timer = null
      },
      listenVisible: (fn) => {
        hooks.visible = fn
        return () => {
          hooks.visible = null
        }
      },
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(seen).toEqual([true])
    hooks.timer?.()
    await Promise.resolve()
    await Promise.resolve()
    expect(seen).toEqual([true, false])
    hooks.visible?.()
    await Promise.resolve()
    await Promise.resolve()
    expect(ticks).toBe(3)
    watch.stop()
    expect(hooks.timer).toBeNull()
    expect(hooks.visible).toBeNull()
  })

  it('keeps the previous result when the check fails', async () => {
    const seen: boolean[] = []
    const watch = startAppUpdateWatch({
      currentVersion: 'aaaaaaa',
      fetchVersion: async () => {
        throw new Error('offline')
      },
      onUpdate: (ready) => seen.push(ready),
      setInterval: () => 1 as unknown as ReturnType<typeof setInterval>,
      clearInterval: () => {},
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(seen).toEqual([])
    watch.stop()
  })
})

describe('version tab', () => {
  it('puts the red dot on settings and the version tab, and refreshes only from the button', () => {
    expect(settings).toContain("label: '版本'")
    expect(settings).toContain('有新版本，点击刷新')
    expect(settings).toContain('检查更新')
    expect(settings).toContain("p.id === 'version' && updateReady")
    expect(app).toContain('updateReady')
    expect(app).toContain('设置，有新版本')
    expect(settings).not.toContain('localStorage')
    expect(app).not.toContain('location.reload')
  })
})

describe('apply app update', () => {
  it('asks the waiting worker to take over and only then reloads', async () => {
    const order: string[] = []
    await applyAppUpdate({
      skipWaiting: async () => {
        order.push('skip')
      },
      reload: () => {
        order.push('reload')
      },
      waitMs: 1,
      sleep: async () => {
        order.push('wait')
      },
    })
    expect(order).toEqual(['skip', 'wait', 'reload'])
  })
})
