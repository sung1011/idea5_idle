import { ref } from 'vue'
import type { ModuleId } from '../sim/moduleUnlock'
import { openWorkshopStation, selectAppTab } from './appNav'
import { selectMainlineTab } from './mainlineTabs'
import { selectPvpView } from './pvpTabs'

/** 前往之后对应页签闪几下。 */
export const unlockFlashKey = ref<string | null>(null)

let flashTimer = 0

export function flashUnlock(key: string) {
  unlockFlashKey.value = key
  window.clearTimeout(flashTimer)
  flashTimer = window.setTimeout(() => {
    if (unlockFlashKey.value === key) unlockFlashKey.value = null
  }, 1500)
}

export function openUnlockedModule(id: ModuleId) {
  switch (id) {
    case 'tech':
      selectAppTab('tech')
      flashUnlock('tab:tech')
      return
    case 'market':
      selectMainlineTab('market')
      selectAppTab('encounters')
      flashUnlock('pve:market')
      return
    case 'dungeon':
      selectMainlineTab('dungeon')
      selectAppTab('encounters')
      flashUnlock('pve:dungeon')
      return
    case 'herb':
      selectPvpView('herb')
      selectAppTab('pvp')
      flashUnlock('pvp:herb')
      return
    case 'beast':
      selectPvpView('beast')
      selectAppTab('pvp')
      flashUnlock('pvp:beast')
      return
    case 'treasure':
      selectPvpView('treasure')
      selectAppTab('pvp')
      flashUnlock('pvp:treasure')
      return
    case 'hunting':
      openWorkshopStation('hunting')
      flashUnlock('tab:workshop')
      return
    case 'cooking':
      openWorkshopStation('cooking')
      flashUnlock('tab:workshop')
      return
    case 'mining':
      openWorkshopStation('mining')
      flashUnlock('tab:workshop')
      return
    case 'inscription':
      openWorkshopStation('inscription')
      flashUnlock('tab:workshop')
      return
    case 'rune':
      selectMainlineTab('battlefield')
      selectAppTab('encounters')
      flashUnlock('pve:battlefield')
      return
    case 'restFood':
      selectAppTab('workshop')
      flashUnlock('tab:workshop')
      return
    default:
      selectAppTab('workshop')
  }
}
