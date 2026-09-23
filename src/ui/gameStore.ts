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
import { potionSlotItem, usePotionSlot } from '../sim/potions'
import { loadFood, unloadFood } from '../sim/food'
import { fuseStationWorkers, fuseWorkerWithStation } from '../sim/fuse'
import { recruitWorker, clearWorkerNew } from '../sim/recruit'
import { selectStationCategory } from '../sim/stationProgress'
import type { RunePickMap } from '../sim/runes'
import {
  barterMerchant,
  buyMerchant,
  claimLoot,
  exploreBoard,
  reinforceCombat,
  reinforceLostCombat,
  startCombat,
  pawnMerchant,
  sellBulk,
  submitArtisan,
} from '../sim/encounters'
import { claimDungeonChest, reinforceDungeonCombat, startDungeonCombat } from '../sim/dungeon'
import { addTreasureMiner, startTreasureRaid, withdrawTreasureMiner } from '../sim/treasureMine'
import { claimGuideQuest, markGuideQuestRuneOpened } from '../sim/guideQuest'
import { researchNextTech, researchTech, resetAllTech } from '../sim/tech'
import { PLAYABLE_STATION_IDS } from '../sim/tables'
import { tick } from '../sim/tick'
import { takeWorkshopHpEfficiencyTip } from '../sim/workshopHp'
import type { ActionResult, CategoryId, ItemId, PotionItemId, Save, StationId, Worker } from '../sim/types'
import { pushCombatLogTip } from './encounterTips'
import { pushFloatTip } from './floatTips'
import { announceWorkerLevelUps, workerLevelSnapshot } from './workerLevelFlash'
import { clearSave, loadSave, persistSave } from './saveGame'
import { pushCycleGain } from './stationTips'
import { offerActionBanter, offerWorkshopBanter } from './workshopBanter'
import { applyWorkerDrag, type WorkerDragSource, type WorkerDropTarget } from './workerDrag'

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

  function notifyWorkshopHpEfficiency(next: Save) {
    const tip = takeWorkshopHpEfficiencyTip(next)
    if (tip) pushFloatTip(tip)
  }

  function liveTick() {
    const levels = workerLevelSnapshot(save.value.workers)
    const produced: StationId[] = []
    save.value = tick(save.value, {
      onGain: (gain) => {
        pushCycleGain(gain)
        if (gain.lots.length > 0) produced.push(gain.stationId)
      },
      onCombatLog: (encounterId, text, kind) => {
        pushCombatLogTip(encounterId, text, kind)
      },
    })
    announceWorkerLevelUps(levels, save.value.workers)
    offerWorkshopBanter(save.value, produced)
    notifyWorkshopHpEfficiency(save.value)
    persist()
  }

  function assignmentSnapshot(): Map<string, StationId | null> {
    return new Map(save.value.workers.map((worker) => [worker.id, worker.assignment]))
  }

  function isPlayableStation(stationId: StationId | null | undefined): stationId is StationId {
    return !!stationId && (PLAYABLE_STATION_IDS as readonly string[]).includes(stationId)
  }

  function offerFreshAssign(before: Map<string, StationId | null>) {
    for (const worker of save.value.workers) {
      if (!before.has(worker.id)) continue
      if (before.get(worker.id) != null) continue
      if (!isPlayableStation(worker.assignment)) continue
      offerActionBanter(save.value, 'assign', { workerId: worker.id, stationId: worker.assignment })
      return
    }
  }

  function offerFused(beforeIds: ReadonlySet<string>) {
    const created = save.value.workers.find(
      (worker) => !beforeIds.has(worker.id) && isPlayableStation(worker.assignment),
    )
    if (!created?.assignment) return
    offerActionBanter(save.value, 'fuse', { workerId: created.id, stationId: created.assignment })
  }

  function apply(fn: (s: Save) => ActionResult): ActionResult {
    const next = cloneSave(save.value)
    const levels = workerLevelSnapshot(save.value.workers)
    const result = fn(next)
    if (result.ok) {
      save.value = next
      notifyWorkshopHpEfficiency(next)
      persist()
      if (result.message) pushFloatTip(result.message, 'ok')
      announceWorkerLevelUps(levels, next.workers)
    } else {
      pushFloatTip(result.reason, 'err')
    }
    return result
  }

  function applyCatchUp(from: Save) {
    const result = settleOffline(from)
    save.value = result.save
    notifyWorkshopHpEfficiency(save.value)
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
    clearWorkerNew: (workerId: string) => {
      const worker = save.value.workers.find((w) => w.id === workerId)
      if (!worker?.isNew) return
      apply((s) => {
        clearWorkerNew(s, workerId)
        return { ok: true }
      })
    },
    fuseStation: (stationId: StationId) => {
      const beforeIds = new Set(save.value.workers.map((worker) => worker.id))
      const result = apply((s) => fuseStationWorkers(s, stationId))
      if (result.ok) offerFused(beforeIds)
      return result
    },
    fuseWorker: (workerId: string, stationId: StationId) => {
      const beforeIds = new Set(save.value.workers.map((worker) => worker.id))
      const result = apply((s) => fuseWorkerWithStation(s, workerId, stationId))
      if (result.ok) offerFused(beforeIds)
      return result
    },
    assignIdle: (stationId: StationId) => {
      const before = assignmentSnapshot()
      const result = apply((s) => assignIdleWorker(s, stationId))
      if (result.ok) offerFreshAssign(before)
      return result
    },
    withdraw: (stationId: StationId) => apply((s) => withdrawWorker(s, stationId)),
    assign: (workerId: string, stationId: StationId | null) => {
      const before = assignmentSnapshot()
      const result = apply((s) => assignWorker(s, workerId, stationId))
      if (result.ok) offerFreshAssign(before)
      return result
    },
    dragAssign: (source: WorkerDragSource, target: WorkerDropTarget) => {
      const before = assignmentSnapshot()
      const beforeIds = new Set(before.keys())
      const result = apply((s) => applyWorkerDrag(s, source, target))
      if (!result.ok) return result
      const created = save.value.workers.some(
        (worker) => !beforeIds.has(worker.id) && isPlayableStation(worker.assignment),
      )
      if (created) offerFused(beforeIds)
      else offerFreshAssign(before)
      return result
    },
    loadFood: (workerId: string, itemId: ItemId, qty: number) =>
      apply((s) => loadFood(s, workerId, itemId, qty)),
    unloadFood: (workerId: string) => apply((s) => unloadFood(s, workerId)),
    installPotionSlot: (index: number, itemId: ItemId) => apply((s) => installPotionSlot(s, index, itemId)),
    installPotion: (index: number, itemId: PotionItemId) => apply((s) => installPotionSlot(s, index, itemId)),
    clearPotionSlot: (index: number) => apply((s) => clearPotionSlot(s, index)),
    unequipPotion: (index: number) => apply((s) => clearPotionSlot(s, index)),
    usePotionSlot: (index: number) => {
      const itemId = potionSlotItem(save.value, index)
      const result = apply((s) => usePotionSlot(s, index))
      if (!result.ok || !itemId) return result
      const stationId =
        itemId === 'rushPowder'
          ? save.value.potionBuffs.rushStation
          : itemId === 'doubleMist'
            ? (save.value.potionBuffs.doubleMist?.stationId ?? null)
            : null
      offerActionBanter(save.value, 'potion', { stationId })
      return result
    },
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
    reinforceLostCombat: (index: number, workerIds: string[], guests?: Worker[], runePicks?: RunePickMap) =>
      apply((s) => reinforceLostCombat(s, index, workerIds, Date.now(), pushCombatLogTip, guests, runePicks)),
    startDungeonCombat: (encounterId: string, workerIds: string[], guests?: Worker[], runePicks?: RunePickMap) =>
      apply((s) => startDungeonCombat(s, encounterId, workerIds, Date.now(), pushCombatLogTip, guests, runePicks)),
    reinforceDungeonCombat: (encounterId: string, workerIds: string[], guests?: Worker[], runePicks?: RunePickMap) =>
      apply((s) =>
        reinforceDungeonCombat(s, encounterId, workerIds, Date.now(), pushCombatLogTip, guests, runePicks),
      ),
    claimDungeonChest: (encounterId: string) => apply((s) => claimDungeonChest(s, encounterId)),
    startTreasureRaid: (mineId: string, workerIds: string[], runePicks?: RunePickMap) =>
      apply((s) => startTreasureRaid(s, mineId, workerIds, runePicks)),
    addTreasureMiner: (mineId: string, workerId: string) => apply((s) => addTreasureMiner(s, mineId, workerId)),
    withdrawTreasureMiner: (mineId: string, workerId: string) =>
      apply((s) => withdrawTreasureMiner(s, mineId, workerId)),
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
