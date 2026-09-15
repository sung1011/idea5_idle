import { defineStore } from 'pinia'
import { ref } from 'vue'
import { createSave } from '../sim/createSave'
import { settleOffline } from '../sim/offline'
import { tick } from '../sim/tick'
import type { Save } from '../sim/types'
import { loadSave, persistSave } from './saveGame'

export const useGameStore = defineStore('game', () => {
  const save = ref<Save>(createSave())
  let timer = 0
  let booted = false

  function persist() {
    persistSave(save.value)
  }

  function catchUp() {
    const result = settleOffline(save.value)
    save.value = result.save
    persist()
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
    if (loaded) {
      const result = settleOffline(loaded)
      save.value = result.save
    }
    persist()
  }

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
    boot,
    startClock,
    stopClock,
  }
})
