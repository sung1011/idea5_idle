import { ref } from 'vue'

/** PVP 玩法切换。不进存档。战旗、军械铺等旧值打开时归位到夺宝。 */
export const PVP_TAB_KEY = 'idea5IdlePvpTab'

export const PVP_VIEWS = ['treasure', 'herb', 'beast'] as const
export type PvpView = (typeof PVP_VIEWS)[number]

export const PVP_VIEW_LABELS: Record<PvpView, string> = {
  treasure: '夺宝',
  herb: '割草',
  beast: '困兽',
}

function storageOf(storage?: Storage | null): Storage | null {
  if (storage) return storage
  if (typeof localStorage === 'undefined') return null
  return localStorage
}

/** 割草留下，其它旧子页都回到夺宝。 */
export function pvpViewOf(id: unknown): PvpView {
  if (id === 'herb' || id === 'beast') return id
  return 'treasure'
}

/** 读旧子页签。没有记录时不新建键。战旗和军械铺写回夺宝。 */
export function settlePvpTab(storage?: Storage | null): PvpView {
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

export const pvpView = ref<PvpView>('treasure')

export function bootPvpView(storage?: Storage | null): PvpView {
  const next = settlePvpTab(storage)
  pvpView.value = next
  return next
}

export function selectPvpView(id: unknown, storage?: Storage | null): PvpView {
  const next = pvpViewOf(id)
  const store = storageOf(storage)
  if (store) {
    try {
      store.setItem(PVP_TAB_KEY, next)
    } catch {
      // quota / private mode
    }
  }
  pvpView.value = next
  return next
}
