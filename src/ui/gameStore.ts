import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'
import { assignIdleWorker, assignWorker, withdrawWorker } from '../sim/assign'
import { cloneSave } from '../sim/clone'
import { createSave } from '../sim/createSave'
import {
  gmAddDiamonds,
  gmAddGold,
  gmAddWorkers,
  gmFillBankBasics,
  gmMaxStations,
  gmResetSave,
} from '../sim/gm'
import { hasUnread, listedMessages, markAllRead } from '../sim/messages'
import { settleOffline } from '../sim/offline'
import { loadFood, unloadFood } from '../sim/food'
import { recruitWorker } from '../sim/recruit'
import { equipTool, selectForgingToolType, unequipTool } from '../sim/tools'
import { selectStationCategory } from '../sim/stationProgress'
import { sellAllGoods, sellFromBank } from '../sim/bank'
import {
  barterMerchant,
  buyMerchant,
  claimLoot,
  departEncounter,
  exploreBoard,
  pawnMerchant,
  sellBulk,
  submitArtisan,
} from '../sim/encounters'
import { tick } from '../sim/tick'
import type { ActionResult, CategoryId, ItemId, Save, StationId, ToolTypeId } from '../sim/types'
import { pushFloatTip } from './floatTips'
import { clearSave, loadSave, persistSave } from './saveGame'

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
      timer = window.setInterval(() => {
        save.value = tick(save.value)
        persist()
      }, 1000)
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
    timer = window.setInterval(() => {
      save.value = tick(save.value)
      persist()
    }, 1000)
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
    assignIdle: (stationId: StationId) => apply((s) => assignIdleWorker(s, stationId)),
    withdraw: (stationId: StationId) => apply((s) => withdrawWorker(s, stationId)),
    assign: (workerId: string, stationId: StationId | null) => apply((s) => assignWorker(s, workerId, stationId)),
    equipTool: (workerId: string, itemId: ItemId, matchStationId: StationId) =>
      apply((s) => {
        if (itemId !== 'tool' && itemId !== 'ironTool' && itemId !== 'mithrilTool') {
          return { ok: false, reason: '不是生产工具' }
        }
        return equipTool(s, workerId, itemId, matchStationId)
      }),
    unequipTool: (workerId: string) => apply((s) => unequipTool(s, workerId)),
    loadFood: (workerId: string, itemId: ItemId, qty: number) =>
      apply((s) => loadFood(s, workerId, itemId, qty)),
    unloadFood: (workerId: string) => apply((s) => unloadFood(s, workerId)),
    selectToolType: (toolTypeId: ToolTypeId) => apply((s) => selectForgingToolType(s, toolTypeId)),
    selectCategory: (stationId: StationId, categoryId: CategoryId) =>
      apply((s) => selectStationCategory(s, stationId, categoryId)),
    sell: (itemId: ItemId, qty = 1) => apply((s) => sellFromBank(s, itemId, qty)),
    sellGoods: () => apply(sellAllGoods),
    explore: () => apply(exploreBoard),
    departEncounter: (index: number) => apply((s) => departEncounter(s, index)),
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
    gmMaxStations: () => apply(gmMaxStations),
    gmFillBankBasics: () => apply(gmFillBankBasics),
    markAllRead: () => apply(markAllRead),
  }
})
