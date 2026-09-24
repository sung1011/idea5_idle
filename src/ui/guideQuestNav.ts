import { ref } from 'vue'
import { openWorkshopStation, selectAppTab, type AppTabId } from './appNav'
import { selectMainlineTab } from './mainlineTabs'

export const pendingGuideRunePick = ref(false)

export function takeGuideRunePickRequest(): boolean {
  if (!pendingGuideRunePick.value) return false
  pendingGuideRunePick.value = false
  return true
}

export function openGuideQuestStep(step: number, storage?: Storage | null): AppTabId {
  switch (step) {
    case 1:
    case 2:
    case 3:
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
