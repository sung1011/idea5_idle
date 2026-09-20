import { openWorkshopStation, selectAppTab, type AppTabId } from './appNav'
import { selectMainlineTab } from './mainlineTabs'

export function openGuideQuestStep(step: number, storage?: Storage | null): AppTabId {
  switch (step) {
    case 1:
    case 2:
    case 3:
    case 6:
    case 7:
      return selectAppTab('workers', storage)
    case 4:
      selectMainlineTab('battlefield', storage)
      return selectAppTab('encounters', storage)
    case 5:
      openWorkshopStation('alchemy', storage)
      return 'workshop'
    default:
      return selectAppTab('encounters', storage)
  }
}
