/** 构建时写入的版本。`version` 是 git 短哈希；没有提交记录时是 `dev`。 */
export type AppVersionInfo = {
  version: string
  /** 完整提交哈希。旧构建可能没有。 */
  sha?: string
  /** ISO 时间。没有记录时是空串。 */
  releasedAt: string
  notes: AppVersionNote[]
}

export type AppVersionNote = {
  at: string
  /** git 提交标题的第一行。 */
  title: string
}

export const APP_VERSION_NOTE_LIMIT = 10
/** 发现新版本时，气泡和版本页最多列出这么多条中间提交。 */
export const UPDATE_DIFF_LIMIT = 10
export const APP_UPDATE_CHECK_MS = 30 * 60 * 1000
const DEV_VERSION = 'dev'

export type UpdateCommit = {
  version: string
  at: string
  title: string
}

export type UpdateHistory = {
  version: string
  commits: UpdateCommit[]
}

/** 本地版本到线上版本之间的提交。`notes` 从新到旧，最多 `limit` 条。 */
export type UpdateGap = {
  behind: number
  notes: AppVersionNote[]
  earlier: number
}

export function parseCommitLog(raw: string, limit = APP_VERSION_NOTE_LIMIT): Array<AppVersionNote & { version: string }> {
  const notes: Array<AppVersionNote & { version: string }> = []
  const cap = Math.max(0, limit)
  for (const line of raw.split(/\r?\n/)) {
    if (notes.length >= cap) break
    const trimmed = line.trim()
    if (!trimmed) continue
    const first = trimmed.indexOf('\t')
    const second = first >= 0 ? trimmed.indexOf('\t', first + 1) : -1
    if (first <= 0 || second <= first) continue
    const version = trimmed.slice(0, first).trim()
    const at = trimmed.slice(first + 1, second).trim()
    const title = firstLine(trimmed.slice(second + 1))
    if (!version || !at || !title) continue
    notes.push({ version, at, title })
  }
  return notes
}

export function versionInfoFromCommitLog(raw: string, limit = APP_VERSION_NOTE_LIMIT): AppVersionInfo {
  const parsed = parseCommitLog(raw, limit)
  const head = parsed[0]
  if (!head) return { version: DEV_VERSION, releasedAt: '', notes: [] }
  return {
    version: head.version,
    releasedAt: head.at,
    notes: parsed.map((note) => ({ at: note.at, title: note.title })),
  }
}

export function parseRemoteVersion(payload: unknown): AppVersionInfo | null {
  if (!payload || typeof payload !== 'object') return null
  const row = payload as { version?: unknown; releasedAt?: unknown; notes?: unknown }
  const version = typeof row.version === 'string' ? row.version.trim() : ''
  if (!version) return null
  const releasedAt = typeof row.releasedAt === 'string' ? row.releasedAt.trim() : ''
  const notes: AppVersionNote[] = []
  if (Array.isArray(row.notes)) {
    for (const item of row.notes) {
      if (notes.length >= APP_VERSION_NOTE_LIMIT) break
      if (!item || typeof item !== 'object') continue
      const note = item as { at?: unknown; title?: unknown }
      const at = typeof note.at === 'string' ? note.at.trim() : ''
      const title = typeof note.title === 'string' ? firstLine(note.title) : ''
      if (!at || !title) continue
      notes.push({ at, title })
    }
  }
  return { version, releasedAt, notes }
}

/** 短哈希对不上才算有新版本。`dev` 和空串不参与比较。 */
export function hasRemoteUpdate(current: string, remote: AppVersionInfo | null): boolean {
  if (!remote) return false
  const next = remote.version.trim()
  const local = current.trim()
  if (!next || !local || next === DEV_VERSION || local === DEV_VERSION) return false
  return next !== local
}

export function versionJsonUrl(base: string, now: number): string {
  const root = base.endsWith('/') ? base : `${base}/`
  return `${root}version.json?t=${Math.floor(now)}`
}

export function historyJsonUrl(base: string, now: number): string {
  const root = base.endsWith('/') ? base : `${base}/`
  return `${root}history.json?t=${Math.floor(now)}`
}

/** 短哈希和完整哈希都能对上。短于 7 位或 `dev` 不算同一提交。 */
export function sameCommitId(local: string, remote: string): boolean {
  const a = local.trim().toLowerCase()
  const b = remote.trim().toLowerCase()
  if (a.length < 7 || b.length < 7 || a === DEV_VERSION || b === DEV_VERSION) return false
  return a === b || a.startsWith(b) || b.startsWith(a)
}

export function parseHistory(payload: unknown): UpdateHistory | null {
  if (!payload || typeof payload !== 'object') return null
  const row = payload as { version?: unknown; commits?: unknown }
  const version = typeof row.version === 'string' ? row.version.trim() : ''
  if (!version || version === DEV_VERSION || !Array.isArray(row.commits)) return null
  const commits: UpdateCommit[] = []
  for (const item of row.commits) {
    if (!item || typeof item !== 'object') continue
    const commit = item as { version?: unknown; at?: unknown; title?: unknown }
    const id = typeof commit.version === 'string' ? commit.version.trim() : ''
    const at = typeof commit.at === 'string' ? commit.at.trim() : ''
    const title = typeof commit.title === 'string' ? firstLine(commit.title) : ''
    if (!id || !at || !title) continue
    commits.push({ version: id, at, title })
  }
  if (!commits.length) return null
  return { version, commits }
}

/**
 * `commits` 从新到旧。找到本地提交后，它前面的都是还没更新到的版本。
 * 找不到本地提交时返回 null，调用方退回只显示最新一条。
 */
export function commitsBehind(
  localVersion: string,
  commits: readonly UpdateCommit[] | null | undefined,
  limit = UPDATE_DIFF_LIMIT,
): UpdateGap | null {
  if (!commits?.length) return null
  const index = commits.findIndex((commit) => sameCommitId(localVersion, commit.version))
  if (index < 0) return null
  const cap = Math.max(0, limit)
  const notes = commits.slice(0, index).slice(0, cap).map((commit) => ({ at: commit.at, title: commit.title }))
  return {
    behind: index,
    notes,
    earlier: Math.max(0, index - cap),
  }
}

export function updateBehindLabel(behind: number): string {
  return `落后 ${Math.max(0, Math.floor(behind))} 个版本`
}

export function updateEarlierLabel(earlier: number): string {
  const count = Math.max(0, Math.floor(earlier))
  return count > 0 ? `还有 ${count} 条更早的更新` : ''
}

export function formatBeijingDateTime(iso: string): string {
  const date = new Date(iso)
  if (!iso.trim() || Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  const year = pick('year')
  const month = pick('month')
  const day = pick('day')
  const hour = pick('hour')
  const minute = pick('minute')
  if (!year || !month || !day || !hour || !minute) return ''
  return `${year}-${month}-${day} ${hour}:${minute}`
}

export function dueForUpdateCheck(lastAt: number | null, now: number, intervalMs = APP_UPDATE_CHECK_MS): boolean {
  if (lastAt == null) return true
  return now - lastAt >= intervalMs
}

function firstLine(text: string): string {
  const line = text.split(/\r?\n/, 1)[0] ?? ''
  return line.trim()
}
