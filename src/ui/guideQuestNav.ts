import { ref } from 'vue'
import { openWorkshopStation, selectAppTab, type AppTabId } from './appNav'
import { selectMainlineTab } from './mainlineTabs'

export const pendingGuideRunePick = ref(false)
/** 工坊营地名单是否正打开。引导浮条据此切换第 3 步文案。 */
export const guideCampSheetOpen = ref(false)
/** 点引导浮条要重新打开营地名单。面板挂上后消费。 */
export const guideCampOpenRequest = ref(0)

let consumedCampRequest = 0

export function requestGuideCampSheet() {
  guideCampOpenRequest.value += 1
}

/** 每个请求只打开一次。离开工坊再进来不会把名单重新弹出。 */
export function takeGuideCampOpenRequest(): boolean {
  if (guideCampOpenRequest.value === consumedCampRequest) return false
  consumedCampRequest = guideCampOpenRequest.value
  return true
}

export function takeGuideRunePickRequest(): boolean {
  if (!pendingGuideRunePick.value) return false
  pendingGuideRunePick.value = false
  return true
}

export function openGuideQuestStep(step: number, storage?: Storage | null): AppTabId {
  switch (step) {
    case 1:
    case 2:
      return selectAppTab('workshop', storage)
    case 3:
      requestGuideCampSheet()
      return selectAppTab('workshop', storage)
    case 4:
    case 7:
    case 8:
      return selectAppTab('workshop', storage)
    case 5:
      selectMainlineTab('battlefield', storage)
      return selectAppTab('encounters', storage)
    case 6:
      openWorkshopStation('alchemy', storage)
      return 'workshop'
    case 9:
      pendingGuideRunePick.value = true
      selectMainlineTab('battlefield', storage)
      return selectAppTab('encounters', storage)
    default:
      return selectAppTab('encounters', storage)
  }
}
