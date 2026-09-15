import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { assignIdleWorker, assignWorker, withdrawWorker } from '../sim/assign'
import { cloneSave } from '../sim/clone'
import { createSave } from '../sim/createSave'
import { settleOffline, type OfflineSummary } from '../sim/offline'
import { collectHints } from '../sim/query'
import { recruitWorker } from '../sim/recruit'
import { sellAllGoods, sellFromBank } from '../sim/bank'
import { tick } from '../sim/tick'
import type { ActionResult, ItemId, Save, StationId } from '../sim/types'
import { loadSave, persistSave } from './saveGame'

export const useGameStore = defineStore('game', () => {
  // 整份 Save 替换，不用深层响应式，避免 structuredClone 撞上 Proxy。
  const save = shallowRef<Save>(createSave())
  const notice = ref('')
  const offlineSummary = ref<OfflineSummary | null>(null)
  const offlineSeconds = computed(() => offlineSummary.value?.seconds ?? 0)
  let timer = 0
  let booted = false

  const hints = computed(() => collectHints(save.value))

  function persist() {
    persistSave(save.value)
  }

  function apply(fn: (s: Save) => ActionResult): ActionResult {
    const next = cloneSave(save.value)
    const result = fn(next)
    if (result.ok) {
      save.value = next
      persist()
      notice.value = ''
    } else {
      notice.value = result.reason
    }
    return result
  }

  function applyCatchUp(from: Save) {
    const result = settleOffline(from)
    save.value = result.save
    if (result.summary.seconds > 0) offlineSummary.value = result.summary
    persist()
    return result
  }

  function catchUp() {
    applyCatchUp(save.value)
  }

  function dismissOffline() {
    offlineSummary.value = null
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
    notice,
    hints,
    offlineSummary,
    offlineSeconds,
    startClock,
    stopClock,
    dismissOffline,
    recruit: () => apply(recruitWorker),
    assignIdle: (stationId: StationId) => apply((s) => assignIdleWorker(s, stationId)),
    withdraw: (stationId: StationId) => apply((s) => withdrawWorker(s, stationId)),
    assign: (workerId: string, stationId: StationId | null) => apply((s) => assignWorker(s, workerId, stationId)),
    sell: (itemId: ItemId, qty = 1) => apply((s) => sellFromBank(s, itemId, qty)),
    sellGoods: () => apply(sellAllGoods),
  }
})
