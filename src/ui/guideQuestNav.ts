import { openWorkshopStation, selectAppTab, type AppTabId } from './appNav'
import { selectTechTab } from './techTabs'

export function openGuideQuestStep(step: number, storage?: Storage | null): AppTabId {
  switch (step) {
    case 1:
      return selectAppTab('workers', storage)
    case 2:
      openWorkshopStation('mining', storage)
      return 'workshop'
    case 3:
    case 4:
      return selectAppTab('encounters', storage)
    case 5:
      selectTechTab('affairs', storage)
      return selectAppTab('tech', storage)
    default:
      return selectAppTab('encounters', storage)
  }
}
