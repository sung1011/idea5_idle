import { afterEach, describe, expect, it, vi } from 'vitest'
import app from './app.vue?raw'
import settings from './settingsPanel.vue?raw'
import { applyAppUpdate } from './applyAppUpdate'
import { startAppUpdateWatch } from './appUpdateWatch'
import {
  APP_UPDATE_CHECK_MS,
  APP_VERSION_NOTE_LIMIT,
  dueForUpdateCheck,
  commitsBehind,
  formatBeijingDateTime,
  hasRemoteUpdate,
  historyJsonUrl,
  parseCommitLog,
  parseHistory,
  parseRemoteVersion,
  updateBehindLabel,
  updateEarlierLabel,
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
    expect(historyJsonUrl('/idea5_idle/', 12)).toBe('/idea5_idle/history.json?t=12')
    expect(historyJsonUrl('/idea5_idle', 12)).toBe('/idea5_idle/history.json?t=12')
  })

  it('lists commits between the local hash and the online head, newest first', () => {
    const commits = Array.from({ length: 12 }, (_, index) => ({
      version: `abc${index.toString(16).padStart(4, '0')}`,
      at: `2026-09-28T01:${String(12 - index).padStart(2, '0')}:00.000Z`,
      title: `说明 ${index}`,
    }))
    commits[3] = { version: 'bbbbbbb', at: '2026-09-28T01:09:00.000Z', title: '本地这一条' }
    const near = commitsBehind('bbbbbbb', commits)
    expect(near).toEqual({
      behind: 3,
      earlier: 0,
      notes: [
        { at: commits[0]!.at, title: '说明 0' },
        { at: commits[1]!.at, title: '说明 1' },
        { at: commits[2]!.at, title: '说明 2' },
      ],
    })
    expect(updateBehindLabel(near?.behind ?? 0)).toBe('落后 3 个版本')
    expect(updateEarlierLabel(0)).toBe('')

    const far = commitsBehind('bbbbbbb', [
      ...commits.slice(0, 3),
      ...Array.from({ length: 9 }, (_, index) => ({
        version: `def${index.toString(16).padStart(4, '0')}`,
        at: `2026-09-27T00:${String(index).padStart(2, '0')}:00.000Z`,
        title: `更早 ${index}`,
      })),
      { version: 'bbbbbbb', at: '2026-09-26T00:00:00.000Z', title: '本地' },
    ])
    expect(far?.behind).toBe(12)
    expect(far?.notes).toHaveLength(10)
    expect(far?.notes[0]?.title).toBe('说明 0')
    expect(far?.notes[9]?.title).toBe('更早 6')
    expect(far?.earlier).toBe(2)
    expect(updateEarlierLabel(2)).toBe('还有 2 条更早的更新')
    expect(updateBehindLabel(12)).toBe('落后 12 个版本')

    expect(commitsBehind('bbbbbbb', commits.slice(0, 3)) ).toBeNull()
    expect(commitsBehind('dev', commits)).toBeNull()
    expect(commitsBehind('bbbbbbb', [])).toBeNull()
    expect(commitsBehind('bbbbbbb', null)).toBeNull()
    expect(commitsBehind('bbbbbbbfull', [{ version: 'bbbbbbb', at: '2026-09-28T00:00:00.000Z', title: '头' }])?.behind).toBe(0)
    expect(
      commitsBehind('abc0000', [{ version: 'abc0000fullhash', at: '2026-09-28T00:00:00.000Z', title: '同一条' }])?.behind,
    ).toBe(0)
  })

  it('parses the online history and drops a broken payload', () => {
    expect(parseHistory(null)).toBeNull()
    expect(parseHistory({ version: 'abc1234' })).toBeNull()
    expect(parseHistory({ version: 'dev', commits: [{ version: 'abc1234', at: '2026-09-28T00:00:00.000Z', title: 'x' }] })).toBeNull()
    expect(
      parseHistory({
        version: ' abc1234 ',
        commits: [
          { version: 'abc1234', at: '2026-09-28T01:36:00.000Z', title: '  新的 \n第二行' },
          { version: '', at: '2026-09-28T00:00:00.000Z', title: '缺哈希' },
          { version: 'bbbbbbb', at: '2026-09-27T00:00:00.000Z', title: '更早' },
        ],
      }),
    ).toEqual({
      version: 'abc1234',
      commits: [
        { version: 'abc1234', at: '2026-09-28T01:36:00.000Z', title: '新的' },
        { version: 'bbbbbbb', at: '2026-09-27T00:00:00.000Z', title: '更早' },
      ],
    })
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
