import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const limit = 10

function git(args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

function firstLine(text) {
  return (text.split(/\r?\n/, 1)[0] ?? '').trim()
}

function readLog() {
  const raw = git(['log', '-n', String(limit), '--abbrev=7', '--pretty=format:%h%x09%cI%x09%s'])
  const notes = []
  for (const line of raw.split(/\r?\n/)) {
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
    if (notes.length >= limit) break
  }
  return notes
}

const parsed = readLog()
const head = parsed[0]
let version = head?.version ?? ''
let releasedAt = head?.at ?? ''
let notes = parsed.map((note) => ({ at: note.at, title: note.title }))

if (!version) {
  version = git(['rev-parse', '--short=7', 'HEAD'])
  releasedAt = git(['show', '-s', '--format=%cI', 'HEAD'])
  const title = firstLine(git(['show', '-s', '--format=%s', 'HEAD']))
  if (version && releasedAt && title) notes = [{ at: releasedAt, title }]
  if (!version) version = 'dev'
}

const info = {
  version,
  releasedAt,
  notes: notes.slice(0, limit),
}

const dir = join(root, 'src/generated')
mkdirSync(dir, { recursive: true })
const json = `${JSON.stringify(info, null, 2)}\n`
writeFileSync(join(dir, 'appVersion.json'), json)
const ts = `import type { AppVersionInfo } from '../ui/appVersion'

/** 构建脚本写入，勿手改。 */
export const APP_VERSION: AppVersionInfo = ${JSON.stringify(info, null, 2)}
`
writeFileSync(join(dir, 'appVersion.ts'), ts)
