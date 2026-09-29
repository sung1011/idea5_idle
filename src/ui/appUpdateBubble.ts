import type { AppVersionInfo, AppVersionNote } from './appVersion'
import { hasRemoteUpdate } from './appVersion'

/** 关掉过的新版本号。不进游戏存档。 */
export const UPDATE_BUBBLE_DISMISS_KEY = 'idea5IdleUpdateBubble'
export const UPDATE_BUBBLE_NOTE_LIMIT = 3
export const UPDATE_BUBBLE_MAX_WIDTH = 272
export const UPDATE_BUBBLE_SCREEN_GAP = 8

export type UpdateBubbleView = {
  version: string
  lines: string[]
}

export type UpdateBubbleFrame = {
  left: number
  top: number
  width: number
}

export function updateBubbleTitle(version: string): string {
  const text = version.trim()
  return text ? `发现新版本 v${text}` : '发现新版本'
}

/** 这次更新说明的前几条。没有记录就空列表，气泡只留标题。 */
export function updateBubbleLines(notes: readonly AppVersionNote[] | null | undefined, limit = UPDATE_BUBBLE_NOTE_LIMIT): string[] {
  if (!notes?.length) return []
  const cap = Math.max(0, limit)
  const lines: string[] = []
  for (const note of notes) {
    if (lines.length >= cap) break
    const title = note?.title?.trim() ?? ''
    if (!title) continue
    lines.push(title)
  }
  return lines
}

/**
 * 只有自动检查发现新版本、且这个版本号还没被关掉，才弹出气泡。
 * 手动检查、没有新版本、或关掉过同一个版本号，都不弹。
 */
export function shouldShowUpdateBubble(input: {
  currentVersion: string
  remote: AppVersionInfo | null
  dismissedVersion: string | null
  automatic: boolean
}): boolean {
  if (!input.automatic) return false
  if (!hasRemoteUpdate(input.currentVersion, input.remote)) return false
  const next = input.remote?.version.trim() ?? ''
  if (!next) return false
  const dismissed = input.dismissedVersion?.trim() ?? ''
  return dismissed !== next
}

/** 气泡贴在设置按钮下沿，右缘对齐按钮，再收进屏幕左右留白。 */
export function updateBubbleFrame(input: {
  viewportWidth: number
  anchorRight: number
  anchorBottom: number
  gap?: number
  maxWidth?: number
}): UpdateBubbleFrame {
  const gap = input.gap ?? UPDATE_BUBBLE_SCREEN_GAP
  const maxWidth = input.maxWidth ?? UPDATE_BUBBLE_MAX_WIDTH
  const viewport = Math.max(0, input.viewportWidth)
  const width = Math.min(maxWidth, Math.max(0, viewport - gap * 2))
  const minLeft = gap
  const maxLeft = Math.max(gap, viewport - gap - width)
  let left = input.anchorRight - width
  if (left < minLeft) left = minLeft
  if (left > maxLeft) left = maxLeft
  return { left, top: input.anchorBottom + gap, width }
}

/** 箭头相对气泡左缘，指向设置按钮中心，并留在气泡宽度内。 */
export function updateBubbleArrowLeft(frameLeft: number, anchorLeft: number, anchorRight: number, bubbleWidth: number): number {
  const center = (anchorLeft + anchorRight) / 2 - frameLeft
  const inset = Math.min(16, Math.max(0, bubbleWidth / 2))
  const max = Math.max(inset, bubbleWidth - inset)
  return Math.min(Math.max(center, inset), max)
}

function storageOf(storage?: Storage | null): Storage | null {
  if (storage) return storage
  if (typeof localStorage === 'undefined') return null
  return localStorage
}

export function loadDismissedUpdateVersion(storage?: Storage | null): string | null {
  const store = storageOf(storage)
  if (!store) return null
  try {
    const raw = store.getItem(UPDATE_BUBBLE_DISMISS_KEY)
    const text = raw?.trim() ?? ''
    return text || null
  } catch {
    return null
  }
}

export function saveDismissedUpdateVersion(version: string, storage?: Storage | null): string | null {
  const next = version.trim()
  if (!next) return null
  const store = storageOf(storage)
  if (!store) return next
  try {
    store.setItem(UPDATE_BUBBLE_DISMISS_KEY, next)
  } catch {
    // 隐私模式或配额满时这次关掉记不住，下次自动检查还会再弹。
  }
  return next
}
