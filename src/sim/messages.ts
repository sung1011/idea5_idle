import type { ActionResult, GameMessage, Save } from './types'

export const MESSAGE_CAP = 50

export function unreadCount(save: Save): number {
  return save.messages.filter((m) => !m.read).length
}

export function hasUnread(save: Save): boolean {
  return unreadCount(save) > 0
}

/** 最新在前。 */
export function listedMessages(save: Save): GameMessage[] {
  return [...save.messages].sort((a, b) => {
    if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt
    return b.id.localeCompare(a.id)
  })
}

export function pushMessage(
  save: Save,
  draft: { title: string; body: string; createdAt?: number },
): GameMessage {
  if (!Array.isArray(save.messages)) save.messages = []
  if (!Number.isFinite(save.nextMessageId) || save.nextMessageId < 1) save.nextMessageId = 1
  const msg: GameMessage = {
    id: `m-${save.nextMessageId}`,
    createdAt: draft.createdAt ?? Date.now(),
    title: draft.title,
    body: draft.body,
    read: false,
  }
  save.nextMessageId += 1
  save.messages.unshift(msg)
  if (save.messages.length > MESSAGE_CAP) save.messages.length = MESSAGE_CAP
  return msg
}

export function markAllRead(save: Save): ActionResult {
  if (!Array.isArray(save.messages)) save.messages = []
  for (const msg of save.messages) msg.read = true
  return { ok: true }
}

export function hydrateMessages(
  raw: unknown,
  nextIdRaw?: unknown,
): { messages: GameMessage[]; nextMessageId: number } {
  const messages: GameMessage[] = []
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue
      const row = item as Partial<GameMessage>
      if (typeof row.id !== 'string' || typeof row.title !== 'string' || typeof row.body !== 'string') continue
      messages.push({
        id: row.id,
        createdAt: Number.isFinite(row.createdAt) ? Number(row.createdAt) : 0,
        title: row.title,
        body: row.body,
        read: Boolean(row.read),
      })
    }
  }
  messages.sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
  if (messages.length > MESSAGE_CAP) messages.length = MESSAGE_CAP
  let next =
    typeof nextIdRaw === 'number' && Number.isFinite(nextIdRaw) && nextIdRaw >= 1 ? Math.floor(nextIdRaw) : 1
  for (const msg of messages) {
    const n = Number(String(msg.id).replace(/^m-/, ''))
    if (Number.isFinite(n) && n >= next) next = Math.floor(n) + 1
  }
  return { messages, nextMessageId: next }
}
