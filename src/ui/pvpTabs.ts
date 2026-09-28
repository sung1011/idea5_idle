/** 旧 PVP 子页签。不进存档。本地若还记着战旗或军械铺，打开时归位到夺宝。 */
export const PVP_TAB_KEY = 'idea5IdlePvpTab'

function storageOf(storage?: Storage | null): Storage | null {
  if (storage) return storage
  if (typeof localStorage === 'undefined') return null
  return localStorage
}

/** 任何旧子页都是夺宝。战旗、军械铺和未知值都不抛错。 */
export function pvpViewOf(id: unknown): 'treasure' {
  void id
  return 'treasure'
}

/** 读旧子页签并写回夺宝。没有记录时不新建键。 */
export function settlePvpTab(storage?: Storage | null): 'treasure' {
  const store = storageOf(storage)
  if (!store) return 'treasure'
  try {
    const raw = store.getItem(PVP_TAB_KEY)
    if (raw == null) return 'treasure'
    const next = pvpViewOf(raw)
    if (raw !== next) store.setItem(PVP_TAB_KEY, next)
    return next
  } catch {
    return 'treasure'
  }
}
