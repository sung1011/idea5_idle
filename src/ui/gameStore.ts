import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'
import { assignIdleWorker, assignWorker, withdrawWorker } from '../sim/assign'
import { cloneSave } from '../sim/clone'
import { createSave } from '../sim/createSave'
import {
  gmAddDiamonds,
  gmAddGold,
  gmAddMaxQualityWorker,
  gmAddTechPoints,
  gmAddWorkers,
  gmFillBankBasics,
  gmMaxStations,
  gmResetSave,
  gmSkipGuide,
} from '../sim/gm'
import { hasUnread, listedMessages, markAllRead } from '../sim/messages'
import { settleOffline } from '../sim/offline'
import { clearPotionSlot, installPotionSlot } from '../sim/potionSlots'
import { usePotionSlot } from '../sim/potions'
import { loadFood, unloadFood } from '../sim/food'
import { fuseStationWorkers, fuseWorkerWithStation } from '../sim/fuse'
import { recruitWorker } from '../sim/recruit'
import { selectStationCategory } from '../sim/stationProgress'
import type { RunePickMap } from '../sim/runes'
import {
  barterMerchant,
  buyMerchant,
  claimLoot,
  exploreBoard,
  reinforceCombat,
  startCombat,
  pawnMerchant,
  sellBulk,
  submitArtisan,
} from '../sim/encounters'
import { claimDungeonChest, reinforceDungeonCombat, startDungeonCombat } from '../sim/dungeon'
import { claimGuideQuest, markGuideQuestRuneOpened } from '../sim/guideQuest'
import { researchNextTech, researchTech, resetAllTech } from '../sim/tech'
import { tick } from '../sim/tick'
import type { ActionResult, CategoryId, ItemId, PotionItemId, Save, StationId, Worker } from '../sim/types'
import { pushCombatLogTip } from './encounterTips'
import { pushFloatTip } from './floatTips'
import { clearSave, loadSave, persistSave } from './saveGame'
import { pushCycleGain } from './stationTips'
import { applyWorkerDrag, type WorkerDragSource, type WorkerDropTarget } from './workerDrag'
import { assignRestingToFirstEmpty, withdrawWorkshopToRest } from './workerGroups'

export const useGameStore = defineStore('game', () => {
  // 整份 Save 替换，不用深层响应式，避免 structuredClone 撞上 Proxy。
  const save = shallowRef<Save>(createSave())
  const unread = computed(() => hasUnread(save.value))
  const inbox = computed(() => listedMessages(save.value))
  let timer = 0
  let booted = false

  function persist() {
    persistSave(save.value)
  }

  function liveTick() {
    save.value = tick(save.value, {
      onGain: (gain) => {
        pushCycleGain(gain)
      },
      onCombatLog: (encounterId, text, kind) => {
        pushCombatLogTip(encounterId, text, kind)
      },
    })
    persist()
  }

  function apply(fn: (s: Save) => ActionResult): ActionResult {
    const next = cloneSave(save.value)
    const result = fn(next)
    if (result.ok) {
      save.value = next
      persist()
      if (result.message) pushFloatTip(result.message, 'ok')
    } else {
      pushFloatTip(result.reason, 'err')
    }
    return result
  }

  function applyCatchUp(from: Save) {
    const result = settleOffline(from)
    save.value = result.save
    persist()
    return result
  }

  function catchUp() {
    applyCatchUp(save.value)
  }

  function onVis() {
    if (document.visibilityState === 'hidden') {
      if (timer) {
        window.clearInterval(timer)
        timer = 0
      }
      persist()
      return
    }
    catchUp()
    if (!timer) {
      timer = window.setInterval(liveTick, 1000)
    }
  }

  function boot() {
    if (booted) return
    booted = true
    const loaded = loadSave()
    if (loaded) applyCatchUp(loaded)
    else persist()
  }

  boot()

  function startClock() {
    stopClock()
    boot()
    timer = window.setInterval(liveTick, 1000)
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', persist)
    window.addEventListener('beforeunload', persist)
  }

  function stopClock() {
    if (timer) {
      window.clearInterval(timer)
      timer = 0
    }
    document.removeEventListener('visibilitychange', onVis)
    window.removeEventListener('pagehide', persist)
    window.removeEventListener('beforeunload', persist)
  }

  return {
    save,
    unread,
    inbox,
    startClock,
    stopClock,
    recruit: () => apply(recruitWorker),
    fuseStation: (stationId: StationId) => apply((s) => fuseStationWorkers(s, stationId)),
    fuseWorker: (workerId: string, stationId: StationId) =>
      apply((s) => fuseWorkerWithStation(s, workerId, stationId)),
    assignIdle: (stationId: StationId) => apply((s) => assignIdleWorker(s, stationId)),
    assignRestingToFirstEmpty: () => apply(assignRestingToFirstEmpty),
    withdrawWorkshopToRest: () => apply(withdrawWorkshopToRest),
    withdraw: (stationId: StationId) => apply((s) => withdrawWorker(s, stationId)),
    assign: (workerId: string, stationId: StationId | null) => apply((s) => assignWorker(s, workerId, stationId)),
    dragAssign: (source: WorkerDragSource, target: WorkerDropTarget) => apply((s) => applyWorkerDrag(s, source, target)),
    loadFood: (workerId: string, itemId: ItemId, qty: number) =>
      apply((s) => loadFood(s, workerId, itemId, qty)),
    unloadFood: (workerId: string) => apply((s) => unloadFood(s, workerId)),
    installPotionSlot: (index: number, itemId: ItemId) => apply((s) => installPotionSlot(s, index, itemId)),
    installPotion: (index: number, itemId: PotionItemId) => apply((s) => installPotionSlot(s, index, itemId)),
    clearPotionSlot: (index: number) => apply((s) => clearPotionSlot(s, index)),
    unequipPotion: (index: number) => apply((s) => clearPotionSlot(s, index)),
    usePotionSlot: (index: number) => apply((s) => usePotionSlot(s, index)),
    selectCategory: (stationId: StationId, categoryId: CategoryId) =>
      apply((s) => selectStationCategory(s, stationId, categoryId)),
    explore: () => apply(exploreBoard),
    claimGuideQuest: () => apply(claimGuideQuest),
    markGuideRuneOpened: () => {
      if (save.value.guideQuestRuneOpened) return
      apply((s) => {
        markGuideQuestRuneOpened(s)
        return { ok: true }
      })
    },
    startCombat: (index: number, workerIds: string[], guests?: Worker[], runePicks?: RunePickMap) =>
      apply((s) => startCombat(s, index, workerIds, Date.now(), pushCombatLogTip, guests, runePicks)),
    reinforceCombat: (index: number, workerIds: string[], guests?: Worker[], runePicks?: RunePickMap) =>
      apply((s) => reinforceCombat(s, index, workerIds, Date.now(), pushCombatLogTip, guests, runePicks)),
    startDungeonCombat: (workerIds: string[], guests?: Worker[], runePicks?: RunePickMap) =>
      apply((s) => startDungeonCombat(s, workerIds, Date.now(), pushCombatLogTip, guests, runePicks)),
    reinforceDungeonCombat: (workerIds: string[], guests?: Worker[], runePicks?: RunePickMap) =>
      apply((s) => reinforceDungeonCombat(s, workerIds, Date.now(), pushCombatLogTip, guests, runePicks)),
    claimDungeonChest: () => apply((s) => claimDungeonChest(s)),
    claimLoot: (index: number) => apply((s) => claimLoot(s, index)),
    barter: (index: number) => apply((s) => barterMerchant(s, index)),
    buyMerchant: (index: number) => apply((s) => buyMerchant(s, index)),
    pawn: (index: number) => apply((s) => pawnMerchant(s, index)),
    submitArtisan: (index: number) => apply((s) => submitArtisan(s, index)),
    sellBulk: (index: number) => apply((s) => sellBulk(s, index)),
    gmReset: () => {
      clearSave()
      save.value = gmResetSave()
      persist()
      pushFloatTip('已初始化', 'ok')
    },
    gmAddGold: () => apply(gmAddGold),
    gmAddDiamonds: () => apply(gmAddDiamonds),
    gmAddWorkers: () => apply(gmAddWorkers),
    gmAddMaxQualityWorker: () => apply(gmAddMaxQualityWorker),
    gmMaxStations: () => apply(gmMaxStations),
    gmFillBankBasics: () => apply(gmFillBankBasics),
    gmAddTechPoints: () => apply(gmAddTechPoints),
    gmResetTech: () => apply(resetAllTech),
    gmSkipGuide: () => apply(gmSkipGuide),
    markAllRead: () => apply(markAllRead),
    researchNextTech: () => apply(researchNextTech),
    researchTech: (techId: string) => apply((s) => researchTech(s, techId)),
  }
})
