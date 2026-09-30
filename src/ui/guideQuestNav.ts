import { ref } from 'vue'
import { appTab, openWorkshopStation, selectAppTab, selectWorkshopStation, type AppTabId } from './appNav'
import { showStationDetail } from './stationDetailNav'
import { selectMainlineTab } from './mainlineTabs'
import { selectPvpView } from './pvpTabs'

export const pendingGuideRunePick = ref(false)
/** 营地弹框是否正打开。引导浮条据此切换抽苦工、上岗、合成的文案。 */
export const guideCampSheetOpen = ref(false)
/** 点引导浮条要重新打开营地弹框。壳挂上后消费。 */
export const guideCampOpenRequest = ref(0)

let consumedCampRequest = 0

export function requestGuideCampSheet() {
  guideCampOpenRequest.value += 1
}

/** 每个请求只打开一次。切页不会把弹框重新弹出。 */
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

export function openGuideQuestTask(taskId: string, storage?: Storage | null): AppTabId {
  switch (taskId) {
    case 'recruit':
      requestGuideCampSheet()
      return selectAppTab('workshop', storage)
    case 'autoHerb':
    case 'herbQueue':
      selectWorkshopStation('herbalism', storage)
      showStationDetail(null)
      return selectAppTab('workshop', storage)
    case 'autoLine':
      showStationDetail(null)
      return selectAppTab('workshop', storage)
    case 'fuse':
    case 'blueWorker':
    case 'cyanWorker':
    case 'purpleWorker':
      requestGuideCampSheet()
      return appTab.value
    case 'herbSickle':
      openWorkshopStation('herbalism', storage)
      return 'workshop'
    case 'alchemy':
      selectWorkshopStation('alchemy', storage)
      showStationDetail(null)
      return selectAppTab('workshop', storage)
    case 'alchemy3':
      openWorkshopStation('alchemy', storage)
      return 'workshop'
    case 'combat':
    case 'firstBlood':
    case 'explore':
    case 'chapter2':
    case 'chapter3':
    case 'chapter5':
    case 'chapter8':
    case 'runeWin':
      selectMainlineTab('battlefield', storage)
      return selectAppTab('encounters', storage)
    case 'market':
    case 'pawn':
    case 'timed':
    case 'marketHigh':
    case 'oreDeal':
      selectMainlineTab('market', storage)
      return selectAppTab('encounters', storage)
    case 'dungeon':
    case 'chest':
    case 'dungeonBoth':
    case 'dungeonGold':
      selectMainlineTab('dungeon', storage)
      return selectAppTab('encounters', storage)
    case 'tech':
    case 'techTabs':
    case 'marketSlot':
    case 'tech8':
      return selectAppTab('tech', storage)
    case 'herbAssign':
    case 'herb':
    case 'herbCounter':
    case 'herbPayout':
      selectPvpView('herb', storage)
      return selectAppTab('pvp', storage)
    case 'beast':
    case 'beastManual':
    case 'feast':
      selectPvpView('beast', storage)
      return selectAppTab('pvp', storage)
    case 'boneSoup':
    case 'cookStart':
    case 'cookStew':
    case 'stockFood':
      openWorkshopStation('cooking', storage)
      return 'workshop'
    case 'huntStart':
    case 'huntHaul':
    case 'huntWolf':
    case 'huntDeer':
      openWorkshopStation('hunting', storage)
      return 'workshop'
    case 'mining':
    case 'crystal':
    case 'miningIron':
    case 'miningMithril':
      openWorkshopStation('mining', storage)
      return 'workshop'
    case 'inscribe':
    case 'runeCraft':
    case 'inscribe5':
      openWorkshopStation('inscription', storage)
      return 'workshop'
    case 'restFood':
    case 'potionInstall':
    case 'potionUse':
    case 'slotsFull':
      requestGuideCampSheet()
      return selectAppTab('workshop', storage)
    case 'veteran':
      selectMainlineTab('battlefield', storage)
      return selectAppTab('encounters', storage)
    case 'rune':
      pendingGuideRunePick.value = true
      selectMainlineTab('battlefield', storage)
      return selectAppTab('encounters', storage)
    case 'treasure':
    case 'scout':
    case 'raid':
    case 'guard':
    case 'banner1':
    case 'banner3':
    case 'banner5':
      selectPvpView('treasure', storage)
      return selectAppTab('pvp', storage)
    default:
      return selectAppTab('workshop', storage)
  }
}

export function openGuideQuestStep(step: number, storage?: Storage | null): AppTabId {
  const ids = [
    'recruit',
    'autoHerb',
    'herbQueue',
    'fuse',
    'combat',
    'level2',
    'alchemy',
    'potionInstall',
    'potionUse',
    'autoLine',
  ]
  const id = ids[step - 1]
  if (id) return openGuideQuestTask(id, storage)
  return selectAppTab('workshop', storage)
}
