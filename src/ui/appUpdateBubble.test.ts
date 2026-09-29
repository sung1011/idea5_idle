import { describe, expect, it } from 'vitest'
import app from './app.vue?raw'
import bubble from './appUpdateBubble.vue?raw'
import state from './appUpdateState.ts?raw'
import type { AppVersionInfo } from './appVersion'
import {
  UPDATE_BUBBLE_DISMISS_KEY,
  loadDismissedUpdateVersion,
  saveDismissedUpdateVersion,
  shouldShowUpdateBubble,
  updateBubbleArrowLeft,
  updateBubbleFrame,
  updateBubbleLines,
  updateBubbleTitle,
} from './appUpdateBubble'

function remote(version: string, titles: string[] = ['说明一', '说明二', '说明三', '说明四']): AppVersionInfo {
  return {
    version,
    releasedAt: '2026-09-28T01:36:00.000Z',
    notes: titles.map((title) => ({ at: '2026-09-28T01:36:00.000Z', title })),
  }
}

function memory(): Storage {
  const bag = new Map<string, string>()
  return {
    get length() {
      return bag.size
    },
    clear: () => bag.clear(),
    getItem: (key) => bag.get(key) ?? null,
    key: (index) => [...bag.keys()][index] ?? null,
    removeItem: (key) => bag.delete(key),
    setItem: (key, value) => bag.set(key, value),
  }
}

describe('update bubble decision', () => {
  it('pops when a new version is found and has not been closed', () => {
    expect(
      shouldShowUpdateBubble({
        currentVersion: 'aaaaaaa',
        remote: remote('bbbbbbb'),
        dismissedVersion: null,
        automatic: true,
      }),
    ).toBe(true)
    expect(updateBubbleTitle('bbbbbbb')).toBe('发现新版本 vbbbbbbb')
  })

  it('stays closed for the same version after the player dismisses it', () => {
    expect(
      shouldShowUpdateBubble({
        currentVersion: 'aaaaaaa',
        remote: remote('bbbbbbb'),
        dismissedVersion: 'bbbbbbb',
        automatic: true,
      }),
    ).toBe(false)
    expect(
      shouldShowUpdateBubble({
        currentVersion: 'aaaaaaa',
        remote: remote('bbbbbbb'),
        dismissedVersion: '  bbbbbbb  ',
        automatic: true,
      }),
    ).toBe(false)
  })

  it('pops again when a later version arrives', () => {
    expect(
      shouldShowUpdateBubble({
        currentVersion: 'aaaaaaa',
        remote: remote('ccccccc'),
        dismissedVersion: 'bbbbbbb',
        automatic: true,
      }),
    ).toBe(true)
  })

  it('does not pop when there is no new version', () => {
    expect(
      shouldShowUpdateBubble({
        currentVersion: 'aaaaaaa',
        remote: remote('aaaaaaa'),
        dismissedVersion: null,
        automatic: true,
      }),
    ).toBe(false)
    expect(
      shouldShowUpdateBubble({
        currentVersion: 'aaaaaaa',
        remote: null,
        dismissedVersion: null,
        automatic: true,
      }),
    ).toBe(false)
    expect(
      shouldShowUpdateBubble({
        currentVersion: 'dev',
        remote: remote('bbbbbbb'),
        dismissedVersion: null,
        automatic: true,
      }),
    ).toBe(false)
  })

  it('does not pop when the player is already checking by hand', () => {
    expect(
      shouldShowUpdateBubble({
        currentVersion: 'aaaaaaa',
        remote: remote('bbbbbbb'),
        dismissedVersion: null,
        automatic: false,
      }),
    ).toBe(false)
  })

  it('lists at most the first three notes and keeps the title when notes are missing', () => {
    expect(
      updateBubbleLines([
        { at: '', title: '  第一条  ' },
        { at: '', title: '   ' },
        { at: '', title: '第二条' },
        { at: '', title: '第三条' },
        { at: '', title: '第四条不进气泡' },
      ]),
    ).toEqual(['第一条', '第二条', '第三条'])
    expect(updateBubbleLines([])).toEqual([])
    expect(updateBubbleLines(null)).toEqual([])
    expect(updateBubbleTitle('')).toBe('发现新版本')
  })

  it('remembers the closed version outside the game save', () => {
    const store = memory()
    expect(loadDismissedUpdateVersion(store)).toBeNull()
    expect(saveDismissedUpdateVersion(' bbbbbbb ', store)).toBe('bbbbbbb')
    expect(store.getItem(UPDATE_BUBBLE_DISMISS_KEY)).toBe('bbbbbbb')
    expect(UPDATE_BUBBLE_DISMISS_KEY).not.toBe('idea5Idle')
    expect(loadDismissedUpdateVersion(store)).toBe('bbbbbbb')
  })
})

describe('update bubble frame', () => {
  it('stays inside a 390-wide phone and points at the settings button', () => {
    const frame = updateBubbleFrame({
      viewportWidth: 390,
      anchorRight: 384,
      anchorBottom: 44,
    })
    expect(frame.left).toBeGreaterThanOrEqual(8)
    expect(frame.left + frame.width).toBeLessThanOrEqual(390 - 8)
    expect(frame.width).toBeLessThanOrEqual(272)
    expect(frame.top).toBe(52)
    const arrow = updateBubbleArrowLeft(frame.left, 348, 384, frame.width)
    expect(arrow).toBeGreaterThanOrEqual(16)
    expect(arrow).toBeLessThanOrEqual(frame.width - 16)
    expect(arrow).toBeCloseTo((348 + 384) / 2 - frame.left, 5)
  })
})

describe('update bubble shell', () => {
  it('hangs the bubble on the settings button and refreshes from the primary button', () => {
    expect(bubble).toContain('updateBubbleTitle(version)')
    expect(bubble).toContain('class="arrow"')
    expect(bubble).toContain('立即更新')
    expect(bubble).toContain('tone="produce"')
    expect(bubble).toContain('aria-label="关闭"')
    expect(app).toContain('updateBubble')
    expect(app).toContain('dismissUpdateBubble')
    expect(app).toContain('refreshToNewVersion')
    expect(state).toContain('noteRemote(remote, !manual)')
    expect(state).toContain('noteRemote(remote, true)')
  })
})
