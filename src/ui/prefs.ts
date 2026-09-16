export const PREFS_KEY = 'idea5IdleSettings'

export type Prefs = {
  /** 音乐占位。先只记开关，不播文件。 */
  music: boolean
  /** 音效占位。先只记开关，不播文件。 */
  sfx: boolean
}

export const DEFAULT_PREFS: Prefs = {
  music: true,
  sfx: true,
}

export function normalizePrefs(raw: unknown): Prefs {
  const row = raw && typeof raw === 'object' ? (raw as Partial<Prefs>) : {}
  return {
    music: row.music !== false,
    sfx: row.sfx !== false,
  }
}

function storageOf(storage?: Storage | null): Storage | null {
  if (storage) return storage
  if (typeof localStorage === 'undefined') return null
  return localStorage
}

export function loadPrefs(storage?: Storage | null): Prefs {
  const store = storageOf(storage)
  if (!store) return { ...DEFAULT_PREFS }
  try {
    const raw = store.getItem(PREFS_KEY)
    if (!raw) return { ...DEFAULT_PREFS }
    return normalizePrefs(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function savePrefs(prefs: Prefs, storage?: Storage | null): Prefs {
  const next = normalizePrefs(prefs)
  const store = storageOf(storage)
  if (!store) return next
  try {
    store.setItem(PREFS_KEY, JSON.stringify(next))
  } catch {
    // quota / private mode
  }
  return next
}
