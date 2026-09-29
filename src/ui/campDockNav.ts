import { ref } from 'vue'
import type { CampDispatchEntry } from '../sim/campDock'
import type { Save } from '../sim/types'
import { selectAppTab } from './appNav'
import { selectPvpView } from './pvpTabs'

/** 营地弹框是否打开。任意页（含工坊）都用这一份。 */
export const campSheetOpen = ref(false)
/** 派出入口跳到选人。目标面板挂上后消费一次。 */
export const campDispatchJump = ref<CampDispatchEntry | null>(null)

export function closeCampSheet() {
  campSheetOpen.value = false
}

export function toggleCampSheet() {
  campSheetOpen.value = !campSheetOpen.value
}

/** 第一块还没人、还没割完的草地。体力不够时仍返回它，交给割草选人去提示。 */
export function firstHerbPickIndex(save: Save): number | null {
  const plots = save.herbPvp?.plots ?? []
  const index = plots.findIndex((plot) => !plot.cleared && !plot.workerId)
  return index < 0 ? null : index
}

export function requestCampDispatch(entry: CampDispatchEntry) {
  closeCampSheet()
  selectPvpView('herb')
  selectAppTab('pvp')
  campDispatchJump.value = entry
}

export function takeCampDispatch(entry: CampDispatchEntry): boolean {
  if (campDispatchJump.value !== entry) return false
  campDispatchJump.value = null
  return true
}
