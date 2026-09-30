<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { combatZoneRows, formatRemainClock, type CombatZoneRow } from '../sim/march'
import { CLASS_LABEL } from '../sim/tables'
import { guideAlchemyCardFlash, guideDispatchStation, isGuideQuestFlash } from '../sim/guideQuest'
import {
  CLEAR_MANUAL_QUEUE_LABEL,
  CLEAR_MANUAL_QUEUE_NOTE,
  ROUND_BADGE_TIP,
  canClearStationWork,
  stationRoundBadge,
  stationRoundBadgeAria,
} from '../sim/workshopDispatch'
import { moduleNoticeOn, type ModuleId } from '../sim/moduleUnlock'
import { isStationUnlocked, stationLockedTip } from '../sim/stationUnlock'
import { pushFloatTip } from './floatTips'
import { isWorkerLevelFlashing } from './workerLevelFlash'
import {
  announceWorkerStationEnters,
  isWorkerEntering,
  workerAssignSnapshot,
  workerEnterDelayMs,
} from './workerEnterFlash'
import { workerRaceShortLabel } from '../sim/workerRace'
import type { CategoryId, StationId, Worker } from '../sim/types'
import WorkerAvatar from './workerAvatar.vue'
import WorkerDetailSheet from './workerDetailSheet.vue'
import { stationCraftPickOptions, stationCraftPickReadonly } from './stationCraftLabel'
import StationDetailSheet from './stationDetailSheet.vue'
import StationMiniBar from './stationMiniBar.vue'
import { campSheetOpen } from './campDockNav'
import { showStationDetail, openStationDetailId } from './stationDetailNav'
import { isItemSourceStationFlash } from './itemSource'
import StationTips from './stationTips.vue'
import { dismissWorkshopBanter, greetWorkshopBanter, workshopBanterText } from './workshopBanter'
import { considerWorkerTutor, dismissWorkerTutor, hideWorkerTutor, workerTutorText } from './workerTutorTips'
import { useFrameNow } from './visualProgress'
import { useGameStore } from './gameStore'
import { hpBarFill, hpBarTone } from './hpBar'
import { workerWearHp } from '../sim/workshopHp'
import { workerDutyLabel, workerShortName, workshopStationBoards } from './workerGroups'
import UiIcon from './uiIcon.vue'
import UiSelect from './uiSelect.vue'
import { qualityOf, workerQualityDotStyle, workerQualityFrameStyle, workerQualityNameStyle } from './workerQuality'
import {
  canDragWorker,
  canDropWorker,
  dropTargetEquals,
  dropTargetFromDataset,
  sameDragEndpoint,
  setWorkerDragActive,
  shouldStartWorkerDrag,
  workerDragEdgeDelta,
  type WorkerDragSource,
  type WorkerDropTarget,
} from './workerDrag'

const game = useGameStore()
const guideFlashHerbStation = computed(
  () => isGuideQuestFlash(game.save, 'autoHerb') || isGuideQuestFlash(game.save, 'herbQueue'),
)
const guideDispatchTarget = computed(() => guideDispatchStation(game.save))
const guideFlashAuto = computed(() => isGuideQuestFlash(game.save, 'autoLine'))
const frameNow = useFrameNow()
const detailId = ref<string | null>(null)

const boards = computed(() => workshopStationBoards(game.save))
const fightingRoster = computed(() =>
  combatZoneRows(game.save, frameNow.value)
    .map((row) => {
      const worker = game.save.workers.find((item) => item.id === row.workerId)
      return worker ? { worker, row } : null
    })
    .filter((item): item is { worker: Worker; row: CombatZoneRow } => !!item),
)
const combatOpen = ref(false)
const shownCombat = computed(() => combatOpen.value && fightingRoster.value.length > 0)
const alchemyCardFlash = computed(() => guideAlchemyCardFlash(game.save, 'alchemy'))
const rosterFaceSize = computed(() => (shownCombat.value ? 'md' : 'sm'))
watch(
  () => fightingRoster.value.length,
  (n) => {
    if (!n) combatOpen.value = false
  },
)
watch(campSheetOpen, (open) => {
  if (open) combatOpen.value = false
})
function toggleCombat() {
  combatOpen.value = !shownCombat.value
}

function onDocPointer(ev: PointerEvent) {
  const el = ev.target
  if (!(el instanceof Element)) return
  if (!(el.closest('[data-round-badge]') || el.closest('[data-round-bubble]'))) closeRoundHelp()
  if (el.closest('[data-combat-pop]') || el.closest('[data-combat-toggle]')) return
  if (!shownCombat.value) return
  combatOpen.value = false
}

function jobLabel(w: Worker) {
  return w.classId ? CLASS_LABEL[w.classId] : '未标'
}

function raceShortLabel(w: Worker) {
  return workerRaceShortLabel(w.race)
}

function sheetMeta(w: Worker) {
  return `${qualityOf(w).label} · ${jobLabel(w)} · Lv${w.level} · ${workerDutyLabel(game.save, w)}`
}

function hpFillStyle(w: Worker) {
  return { width: `${(hpBarFill(workerWearHp(w), w.hpMax) * 100).toFixed(2)}%` }
}

function hpToneClass(w: Worker) {
  return `hp-${hpBarTone(workerWearHp(w), w.hpMax)}`
}

function openSheet(w: Worker) {
  game.clearWorkerNew(w.id)
  detailId.value = w.id
}

function stationModule(stationId: StationId): ModuleId | null {
  if (
    stationId === 'alchemy' ||
    stationId === 'hunting' ||
    stationId === 'cooking' ||
    stationId === 'mining' ||
    stationId === 'inscription'
  ) {
    return stationId
  }
  return null
}

function stationNotice(stationId: StationId) {
  const moduleId = stationModule(stationId)
  return moduleId != null && moduleNoticeOn(game.save, moduleId)
}

function openStationDetail(stationId: StationId) {
  if (!isStationUnlocked(game.save, stationId)) {
    pushFloatTip(stationLockedTip(stationId))
    return
  }
  const moduleId = stationModule(stationId)
  if (moduleId) game.markModuleSeen(moduleId)
  showStationDetail(stationId)
}

const dispatchFly = ref<{ worker: Worker; x: number; y: number; moving: boolean } | null>(null)
const holdProgress = ref<Partial<Record<StationId, boolean>>>({})
let dispatchFlyTimer = 0

function showDispatchCue(stationId: StationId) {
  const station = game.save.stations[stationId]
  if (stationLocked(stationId) || station.auto || station.manualRounds > 0) return false
  return !game.save.workers.some((worker) => worker.assignment === stationId)
}

function startDispatchFly(stationId: StationId, worker: Worker) {
  const from = document.querySelector('.camp-fab')?.getBoundingClientRect()
  const card = document.querySelector(`[data-station-card="${stationId}"]`)
  const to = card?.querySelector('.slot')?.getBoundingClientRect() ?? card?.getBoundingClientRect()
  if (!from || !to) return
  holdProgress.value = { ...holdProgress.value, [stationId]: true }
  dispatchFly.value = {
    worker,
    x: from.left + from.width / 2,
    y: from.top + from.height / 2,
    moving: false,
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!dispatchFly.value) return
      dispatchFly.value = {
        ...dispatchFly.value,
        x: to.left + to.width / 2,
        y: to.top + to.height / 2,
        moving: true,
      }
    })
  })
  window.clearTimeout(dispatchFlyTimer)
  dispatchFlyTimer = window.setTimeout(() => {
    dispatchFly.value = null
    const next = { ...holdProgress.value }
    delete next[stationId]
    holdProgress.value = next
  }, 450)
}

function dispatchStation(stationId: StationId) {
  const result = game.dispatchManualRound(stationId)
  if (!result.ok) return
  const worker = game.save.workers.find((row) => row.assignment === stationId)
  if (worker) startDispatchFly(stationId, worker)
}

function onToggleAuto(stationId: StationId) {
  game.toggleStationAuto(stationId)
}

const roundHelpStation = ref<StationId | null>(null)
const roundHelpPos = ref({ left: 8, top: 8 })
const DETAIL_HOLD_MS = 480
let detailHoldTimer = 0
let detailHoldCleanup: (() => void) | null = null
let suppressStationClick = false

function closeRoundHelp() {
  roundHelpStation.value = null
}

const roundClearable = computed(() => {
  const stationId = roundHelpStation.value
  if (!stationId) return false
  return canClearStationWork(game.save, stationId)
})

const roundAutoOn = computed(() => {
  const stationId = roundHelpStation.value
  if (!stationId) return false
  return game.save.stations[stationId].auto
})

function onClearManualQueue() {
  const stationId = roundHelpStation.value
  if (!stationId || !canClearStationWork(game.save, stationId)) return
  const result = game.clearManualQueue(stationId)
  if (result.ok) closeRoundHelp()
}

function onRoundBadge(ev: MouseEvent, stationId: StationId) {
  if (roundHelpStation.value === stationId) {
    closeRoundHelp()
    return
  }
  roundHelpStation.value = stationId
  const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect()
  roundHelpPos.value = {
    left: Math.min(window.innerWidth - 236, Math.max(8, rect.right - 220)),
    top: Math.min(window.innerHeight - 160, rect.bottom + 6),
  }
}

function clearDetailHold() {
  window.clearTimeout(detailHoldTimer)
  detailHoldTimer = 0
  detailHoldCleanup?.()
  detailHoldCleanup = null
}

function onStationPointerDown(ev: PointerEvent, stationId: StationId) {
  if (ev.pointerType === 'mouse' && ev.button !== 0) return
  const target = ev.target
  if (
    target instanceof Element &&
    target.closest('.round-badge, .station-detail, .ui-select, .tutor-tip')
  ) {
    return
  }
  clearDetailHold()
  const startX = ev.clientX
  const startY = ev.clientY
  const onMove = (move: PointerEvent) => {
    if (Math.hypot(move.clientX - startX, move.clientY - startY) > 10) clearDetailHold()
  }
  const onUp = () => clearDetailHold()
  detailHoldCleanup = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
  detailHoldTimer = window.setTimeout(() => {
    suppressStationClick = true
    clearDetailHold()
    openStationDetail(stationId)
  }, DETAIL_HOLD_MS)
}

function onStationCardClick(ev: MouseEvent, stationId: StationId) {
  if (suppressStationClick) {
    suppressStationClick = false
    return
  }
  const target = ev.target
  if (target instanceof Element) {
    if (target.closest('.ui-select, .round-badge, .station-detail, .tutor-tip')) return
  }
  dispatchStation(stationId)
}

function closeStationDetail() {
  showStationDetail(null)
}

function stationLocked(stationId: StationId) {
  return !isStationUnlocked(game.save, stationId)
}

type DragSession = {
  workerId: string
  name: string
  source: WorkerDragSource | null
  startX: number
  startY: number
  x: number
  y: number
  active: boolean
  pointerId: number
  over: WorkerDropTarget | null
}

const drag = ref<DragSession | null>(null)
const restListEl = ref<HTMLElement | null>(null)
let edgeScrollFrame = 0

function stopEdgeScroll() {
  if (!edgeScrollFrame) return
  cancelAnimationFrame(edgeScrollFrame)
  edgeScrollFrame = 0
}

function tickEdgeScroll() {
  edgeScrollFrame = 0
  const session = drag.value
  const list = restListEl.value
  if (!session?.active || !list) return
  const rect = list.getBoundingClientRect()
  const delta = workerDragEdgeDelta(session.y, rect.top, rect.bottom)
  if (delta) {
    const max = Math.max(0, list.scrollHeight - list.clientHeight)
    const next = Math.min(max, Math.max(0, list.scrollTop + delta))
    if (next !== list.scrollTop) {
      list.scrollTop = next
      session.over = hitTarget(session.x, session.y)
    }
  }
  edgeScrollFrame = requestAnimationFrame(tickEdgeScroll)
}

function startEdgeScroll() {
  if (edgeScrollFrame) return
  edgeScrollFrame = requestAnimationFrame(tickEdgeScroll)
}

function sourceOf(w: Worker, stationId: StationId | null, slotIndex: number | null): WorkerDragSource | null {
  if (stationId && slotIndex != null) {
    if (!canDragWorker(game.save, w.id)) return null
    return { kind: 'slot', workerId: w.id, stationId, slotIndex }
  }
  if (w.assignment === null) return { kind: 'rest', workerId: w.id }
  return null
}

function unbindDrag() {
  stopEdgeScroll()
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
}

function hitTarget(x: number, y: number): WorkerDropTarget | null {
  const el = document.elementFromPoint(x, y)
  const node = el instanceof Element ? el.closest('[data-drop]') : null
  return node instanceof HTMLElement ? dropTargetFromDataset(node.dataset) : null
}

function onWorkerPointerDown(ev: PointerEvent, w: Worker, stationId: StationId | null, slotIndex: number | null) {
  if (ev.pointerType === 'mouse' && ev.button !== 0) return
  unbindDrag()
  const source = sourceOf(w, stationId, slotIndex)
  drag.value = {
    workerId: w.id,
    name: workerShortName(w),
    source,
    startX: ev.clientX,
    startY: ev.clientY,
    x: ev.clientX,
    y: ev.clientY,
    active: false,
    pointerId: ev.pointerId,
    over: null,
  }
  if (source?.kind === 'rest') {
    ev.preventDefault()
    const handle = ev.currentTarget
    if (handle instanceof Element) {
      try {
        handle.setPointerCapture(ev.pointerId)
      } catch {
        // already released
      }
    }
  }
  window.addEventListener('pointermove', onDragMove, { passive: false })
  window.addEventListener('pointerup', onDragEnd)
  window.addEventListener('pointercancel', onDragEnd)
}

function onDragMove(ev: PointerEvent) {
  const session = drag.value
  if (!session || session.pointerId !== ev.pointerId) return
  if (session.source?.kind === 'rest') ev.preventDefault()
  session.x = ev.clientX
  session.y = ev.clientY
  if (!session.active) {
    if (!session.source) return
    if (!canDragWorker(game.save, session.workerId)) return
    const dx = session.x - session.startX
    const dy = session.y - session.startY
    if (!shouldStartWorkerDrag(session.source, dx, dy)) return
    session.active = true
    setWorkerDragActive(true)
    startEdgeScroll()
    game.clearWorkerNew(session.workerId)
    const handle = ev.currentTarget instanceof Element ? ev.currentTarget : ev.target
    if (handle instanceof Element) {
      try {
        handle.setPointerCapture(ev.pointerId)
      } catch {
        // already released
      }
    }
  }
  ev.preventDefault()
  session.over = hitTarget(ev.clientX, ev.clientY)
}

function onDragEnd(ev: PointerEvent) {
  const session = drag.value
  if (!session || session.pointerId !== ev.pointerId) return
  unbindDrag()
  const worker = game.save.workers.find((row) => row.id === session.workerId) ?? null
  const source = session.source
  const over = session.over ?? hitTarget(ev.clientX, ev.clientY)
  const wasActive = session.active
  drag.value = null
  setWorkerDragActive(false)
  if (wasActive) {
    if (source && over && !sameDragEndpoint(source, over)) game.dragAssign(source, over)
    return
  }
  if (source?.kind === 'slot') return
  if (source?.kind === 'rest') return
  if (worker) openSheet(worker)
}

function slotDropClass(stationId: StationId, slotIndex: number): string {
  const session = drag.value
  if (!session?.active || !session.source) return ''
  const target: WorkerDropTarget = { kind: 'slot', stationId, slotIndex }
  if (canDropWorker(game.save, session.source, target)) return 'drop-ok'
  if (dropTargetEquals(session.over, target)) return 'drop-no'
  return ''
}

function onCraftCategory(stationId: StationId, value: string) {
  const row = stationCraftPickOptions(game.save, stationId).find((opt) => opt.value === value)
  if (!row || row.disabled) return
  game.selectCategory(stationId, value as CategoryId)
}

function banterLine(workerId: string): string {
  return workshopBanterText(workerId)
}

function tutorLine(workerId: string): string {
  return workerTutorText(workerId)
}

function onDismissTutor() {
  dismissWorkerTutor(Date.now())
}

watch(openStationDetailId, (id) => {
  if (id && !isStationUnlocked(game.save, id)) showStationDetail(null)
})

let assignBefore = workerAssignSnapshot(game.save.workers)
watch(
  () => game.save.workers,
  (workers) => {
    announceWorkerStationEnters(assignBefore, workers)
    assignBefore = workerAssignSnapshot(workers)
  },
)

function stationAvatarStyle(worker: Worker) {
  if (!isWorkerEntering(worker.id)) return undefined
  return {
    '--enter-delay': `${workerEnterDelayMs(worker.id)}ms`,
    '--enter-edge': workerQualityFrameStyle(worker.qualityTier).borderColor,
  }
}

let tutorTimer = 0
function refreshTutor() {
  considerWorkerTutor(game.save, Date.now())
}
onMounted(() => {
  document.addEventListener('pointerdown', onDocPointer, true)
  greetWorkshopBanter(game.save)
  refreshTutor()
  tutorTimer = window.setInterval(refreshTutor, 1000)
})
onUnmounted(() => {
  unbindDrag()
  setWorkerDragActive(false)
  dismissWorkshopBanter()
  window.clearInterval(tutorTimer)
  hideWorkerTutor()
  document.removeEventListener('pointerdown', onDocPointer, true)
  window.clearTimeout(dispatchFlyTimer)
  clearDetailHold()
})
</script>

<template>
  <section
    class="panel roster-v2"
    :class="{
      dragging: drag?.active,
      'sheet-combat': shownCombat,
    }"
  >
    <div class="board">
      <section class="col workshop" aria-label="在工坊">
        <div class="station-list">
          <article
            v-for="board in boards"
            :key="board.stationId"
            class="station"
            :data-station-card="board.stationId"
            :class="{
              locked: stationLocked(board.stationId),
              closed: game.save.stations[board.stationId].closed,
              auto: game.save.stations[board.stationId].auto,
              'guide-flash':
                isItemSourceStationFlash(board.stationId) ||
                (guideFlashHerbStation && board.stationId === 'herbalism') ||
                guideDispatchTarget === board.stationId ||
                (alchemyCardFlash && board.stationId === 'alchemy') ||
                (isGuideQuestFlash(game.save, 'mining') && board.stationId === 'mining'),
            }"
            @pointerdown="onStationPointerDown($event, board.stationId)"
            @click="onStationCardClick($event, board.stationId)"
          >
            <button
              type="button"
              class="round-badge"
              data-round-badge
              :class="{
                auto: game.save.stations[board.stationId].auto,
                'guide-flash': guideFlashAuto && !roundHelpStation,
              }"
              :aria-expanded="roundHelpStation === board.stationId"
              :aria-label="stationRoundBadgeAria(game.save, board.stationId)"
              @pointerdown.stop
              @click.stop="onRoundBadge($event, board.stationId)"
            >{{ stationRoundBadge(game.save, board.stationId) }}</button>
            <i v-if="stationNotice(board.stationId)" class="notice" aria-hidden="true" />
            <StationTips :station-id="board.stationId" />
            <div class="station-rail">
              <div class="station-name">
                <UiIcon :name="board.stationId" />
                <b>{{ board.label }}</b>
              </div>
              <button
                type="button"
                class="station-detail"
                :aria-label="`查看${board.label}详情`"
                @pointerdown.stop
                @click.stop="openStationDetail(board.stationId)"
              >
                详
              </button>
            </div>
            <div class="station-work">
              <div class="slots">
                <button
                  v-for="(w, i) in board.slots"
                  :key="`${board.stationId}-${i}`"
                  type="button"
                  class="slot"
                  :class="[
                    {
                      empty: !w,
                      'level-flash': !!w && isWorkerLevelFlashing(w.id),
                      'enter-slot': !!w && isWorkerEntering(w.id),
                      'has-banter': !!w && banterLine(w.id),
                      'has-tutor': !!w && tutorLine(w.id),
                    },
                    w ? hpToneClass(w) : '',
                    slotDropClass(board.stationId, i),
                  ]"
                  :data-drop="'slot'"
                  :data-station="board.stationId"
                  :data-slot="i"
                  :aria-label="w ? `${workerShortName(w)} ${sheetMeta(w)}` : `${board.label}空岗`"
                  @pointerdown="w ? onWorkerPointerDown($event, w, board.stationId, i) : undefined"
                >
                  <i v-if="w" class="hp-fill" :style="hpFillStyle(w)" aria-hidden="true" />
                  <template v-if="w">
                    <span v-if="banterLine(w.id)" class="banter" role="status">{{ banterLine(w.id) }}</span>
                    <span
                      v-if="tutorLine(w.id)"
                      class="tutor-tip"
                      role="button"
                      tabindex="0"
                      :aria-label="`关掉教程：${tutorLine(w.id)}`"
                      @pointerdown.stop
                      @click.stop="onDismissTutor"
                      @keydown.enter.stop.prevent="onDismissTutor"
                      @keydown.space.stop.prevent="onDismissTutor"
                    >{{ tutorLine(w.id) }}</span>
                    <WorkerAvatar
                      class="worker-avatar"
                      :class="{ 'enter-land': isWorkerEntering(w.id) }"
                      :style="stationAvatarStyle(w)"
                      size="lg"
                      :show-new="!!w.isNew"
                      :race="w.race"
                      :quality="w.qualityTier"
                      :worker-id="w.id"
                    />
                    <span class="slot-main">
                      <b>
                        <i class="qdot" :style="workerQualityDotStyle(w.qualityTier)" />
                        <em :style="workerQualityNameStyle(w)">{{ workerShortName(w) }}</em>
                        <i v-if="raceShortLabel(w)" class="race-tag">{{ raceShortLabel(w) }}</i>
                      </b>
                      <small>Lv{{ w.level }}</small>
                    </span>
                  </template>
                  <template v-else>
                    <span v-if="showDispatchCue(board.stationId)" class="empty-lab">点击派工</span>
                    <span v-else class="empty-lab">空</span>
                  </template>
                </button>
              </div>
              <div class="station-craft-row">
                <UiSelect
                  class="station-craft-pick"
                  :model-value="game.save.stations[board.stationId].selectedCategory"
                  :options="stationCraftPickOptions(game.save, board.stationId)"
                  :disabled="stationCraftPickReadonly(game.save, board.stationId)"
                  :aria-label="`${board.label}产出`"
                  @update:model-value="onCraftCategory(board.stationId, $event)"
                />
                <StationMiniBar
                  class="station-progress"
                  :class="{ hold: holdProgress[board.stationId] }"
                  :station-id="board.stationId"
                />
              </div>
            </div>
          </article>
        </div>
      </section>
      <div v-if="fightingRoster.length" class="col side" :data-combat-pop="shownCombat || undefined">
        <section class="zone combat" aria-label="战斗区" data-combat-pop>
          <button
            type="button"
            class="zone-head combat-toggle"
            data-combat-toggle
            :aria-pressed="shownCombat"
            aria-label="展开战斗区"
            @click="toggleCombat"
          >
            战斗 {{ fightingRoster.length }}
          </button>
          <div class="zone-list">
            <div
              v-for="item in fightingRoster"
              :key="item.worker.id"
              class="rest-row march-row"
              :class="[hpToneClass(item.worker), `tone-${item.row.tone}`, { 'level-flash': isWorkerLevelFlashing(item.worker.id) }]"
            >
              <i class="hp-fill" :style="hpFillStyle(item.worker)" aria-hidden="true" />
              <button
                type="button"
                class="rest-face"
                :aria-label="`战斗区 ${workerShortName(item.worker)} ${item.row.label}`"
                @pointerdown="onWorkerPointerDown($event, item.worker, null, null)"
              >
                <WorkerAvatar
                  :size="rosterFaceSize"
                  :show-new="!!item.worker.isNew"
                  :race="item.worker.race"
                  :quality="item.worker.qualityTier"
                  :worker-id="item.worker.id"
                />
                <b class="rest-name" :style="workerQualityNameStyle(item.worker)">{{ workerShortName(item.worker) }}</b>
                <i v-if="raceShortLabel(item.worker)" class="race-tag">{{ raceShortLabel(item.worker) }}</i>
                <i class="march-tag">{{ item.row.label }}<template v-if="item.row.tone !== 'fight'"> {{ formatRemainClock(item.row.remainS) }}</template></i>
                <i v-if="item.row.tone !== 'fight'" class="march-bar" aria-hidden="true"><b :style="{ width: `${Math.round(item.row.progress * 100)}%` }" /></i>
              </button>
              <button
                type="button"
                class="rest-go"
                :aria-label="`${workerShortName(item.worker)} 详情`"
                @pointerdown.stop
                @click="openSheet(item.worker)"
              >
                ›
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
    <Teleport to="body">
      <div v-if="drag?.active" class="drag-ghost" :style="{ left: `${drag.x}px`, top: `${drag.y}px` }">
        {{ drag.name }}
      </div>
      <div
        v-if="dispatchFly"
        class="dispatch-fly"
        :class="{ moving: dispatchFly.moving }"
        :style="{ left: `${dispatchFly.x}px`, top: `${dispatchFly.y}px` }"
      >
        <WorkerAvatar
          size="lg"
          :race="dispatchFly.worker.race"
          :quality="dispatchFly.worker.qualityTier"
          :worker-id="dispatchFly.worker.id"
        />
      </div>
    </Teleport>
  </section>

  <WorkerDetailSheet v-if="detailId" :worker-id="detailId" @close="detailId = null" />

  <StationDetailSheet
    v-if="openStationDetailId"
    :station-id="openStationDetailId"
    @close="closeStationDetail"
    @open-worker="openSheet"
  />

  <Teleport to="body">
    <div
      v-if="roundHelpStation"
      class="round-bubble"
      data-round-bubble
      role="dialog"
      aria-label="排队说明"
      :style="{ left: `${roundHelpPos.left}px`, top: `${roundHelpPos.top}px` }"
    >
      <button
        type="button"
        class="round-auto"
        data-round-auto
        :class="{ on: roundAutoOn, 'guide-flash': guideFlashAuto }"
        :aria-pressed="roundAutoOn"
        aria-label="自动"
        @pointerdown.stop
        @click.stop="roundHelpStation && onToggleAuto(roundHelpStation)"
      >自动</button>
      <p>{{ ROUND_BADGE_TIP }}</p>
      <button
        type="button"
        class="round-clear"
        data-round-clear
        :disabled="!roundClearable"
        @pointerdown.stop
        @click.stop="onClearManualQueue"
      >{{ CLEAR_MANUAL_QUEUE_LABEL }}</button>
      <p class="round-note">{{ CLEAR_MANUAL_QUEUE_NOTE }}</p>
    </div>
  </Teleport>
</template>

<style scoped>
.panel {
  --roster-side-width: 72px;
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 0;
  background: transparent;
  border: none;
  box-shadow: none;
}

.panel.dragging {
  user-select: none;
  cursor: grabbing;
}

.board {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.col {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.workshop {
  flex: 1 1 auto;
  border-right: 2px solid rgba(212, 160, 23, 0.55);
}

.side {
  flex: 0 0 var(--roster-side-width);
  width: var(--roster-side-width);
  overflow: hidden;
}

.zone {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.combat {
  flex: 1 1 auto;
  max-height: none;
  background: linear-gradient(180deg, rgba(176, 62, 58, 0.14), rgba(255, 214, 196, 0.28));
  border-bottom: 2px solid rgba(176, 72, 64, 0.32);
}

.combat-toggle {
  width: 100%;
  border: 0;
  background: transparent;
  color: #8a3228;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}

.combat.empty {
  flex: 0 0 auto;
  max-height: none;
}

.rest {
  flex: 1 1 auto;
  background: linear-gradient(180deg, rgba(154, 112, 72, 0.06), rgba(255, 247, 216, 0.2));
}

.zone-head {
  flex: 0 0 auto;
  padding: 4px 2px 2px;
  color: #7a4a22;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0;
  line-height: 1.2;
  text-align: center;
}

.combat .zone-head {
  color: #8a3228;
}

.rest > .zone-head {
  font-size: 9px;
  line-height: 1.25;
}

.march-row {
  position: relative;
}

.march-tag {
  display: block;
  margin-top: 1px;
  font-size: 9px;
  font-style: normal;
  font-weight: 800;
  letter-spacing: 0;
  line-height: 1.1;
}

.march-bar {
  display: block;
  height: 3px;
  margin-top: 2px;
  overflow: hidden;
  border-radius: 99px;
  background: rgba(90, 48, 16, 0.16);
}

.march-bar b {
  display: block;
  height: 100%;
  border-radius: inherit;
}

.tone-out {
  background: linear-gradient(90deg, rgba(232, 176, 74, 0.35), rgba(255, 236, 196, 0.2));
}

.tone-out .march-tag,
.tone-win .march-tag {
  color: #8a4e12;
}

.tone-out .march-bar b,
.tone-win .march-bar b {
  background: var(--bar-fill-green);
}

.tone-win {
  background: linear-gradient(90deg, rgba(255, 214, 120, 0.72), rgba(255, 244, 214, 0.45));
  animation: march-glow 1.1s ease-in-out infinite;
}

.tone-lose {
  background: linear-gradient(90deg, rgba(58, 74, 112, 0.55), rgba(28, 36, 58, 0.28));
  animation: march-glow 1.35s ease-in-out infinite;
}

.tone-lose .march-tag {
  color: #d5e4ff;
}

.tone-lose .march-bar b {
  background: linear-gradient(90deg, #6d8fd4, #d5e4ff);
}

.tone-fight .march-tag {
  color: #8a3228;
}

@keyframes march-glow {
  50% { filter: brightness(1.12); }
}

@media (prefers-reduced-motion: reduce) {
  .tone-win,
  .tone-lose {
    animation: none;
  }
}

.recruit-bar {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  width: calc(100% - 6px);
  margin: 0 3px 4px;
  min-height: 36px;
  padding: 4px 4px;
  border: 0;
  border-radius: 8px;
  background: var(--accent-face);
  color: #5a3010;
  box-shadow: 0 2px 0 var(--gold-deep);
  font-weight: 900;
  line-height: 1.15;
  text-align: center;
}

.recruit-bar-lab {
  font-size: 10px;
}

.recruit-bar-cost {
  font-size: 11px;
}

.recruit-bar.off {
  opacity: 0.45;
  filter: grayscale(0.28);
  box-shadow: none;
}

.rest-food {
  flex: 0 0 auto;
  width: calc(100% - 6px);
  margin: 0 3px 4px;
  min-height: 22px;
  padding: 2px 4px;
  border: 1px solid var(--gold-deep);
  border-radius: 6px;
  background: var(--wood-lite);
  color: var(--ink);
  font-size: 10px;
  font-weight: 800;
  line-height: 1.1;
}

.rest-food.dry {
  opacity: 0.55;
}

.zone-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 3px 3px 6px;
}

.station-list {
  display: grid;
  grid-template-rows: repeat(var(--workshop-rail-row-count), minmax(var(--workshop-rail-row-min), 1fr));
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 4px 6px 16px;
  gap: var(--workshop-rail-row-gap);
}

.rest-list {
  padding: 3px 3px 6px;
}

.station {
  position: relative;

  display: flex;
  align-items: stretch;
  min-height: var(--workshop-rail-row-min);
  min-width: 0;
  border: 2px solid var(--gold);
  border-radius: 8px;
  background: var(--wood-face);
  box-shadow: 0 2px 0 var(--gold-deep);
}

.station.auto {
  border-color: #3dcc4a;
  box-shadow: 0 0 0 1px #146b28, 0 2px 0 #0e5a1e;
}

.round-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  z-index: 3;
  min-width: 40px;
  min-height: 28px;
  margin: 0;
  padding: 0 6px;
  border: 1px solid #3a1c0c;
  border-radius: 6px;
  background: #6a3218;
  color: #fff4d8;
  font-size: 16px;
  font-weight: 800;
  line-height: 26px;
  cursor: pointer;
}

.round-badge.auto {
  border-color: #146b28;
  background: #1f8a32;
  color: #f4ffe8;
}

.round-bubble {
  position: fixed;
  z-index: calc(var(--z-sheet) + 8);
  width: min(220px, calc(100vw - 16px));
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  border: 2px solid var(--gold-deep);
  border-radius: 10px;
  background: var(--wood-face);
  box-shadow: 0 4px 0 var(--shadow);
  color: var(--ink);
}

.round-bubble b {
  font-size: 13px;
}

.round-bubble p {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  font-weight: 700;
}

.round-auto {
  padding: 4px 8px;
  border: 1px solid #6a4a28;
  border-radius: 6px;
  background: #4a321c;
  color: #efe2c4;
  font-size: 13px;
  font-weight: 800;
  line-height: 18px;
  cursor: pointer;
}

.round-auto.on {
  border-color: #146b28;
  background: #1f8a32;
  color: #f4ffe8;
}

.round-clear {
  margin-top: 4px;
  padding: 4px 8px;
  border: 1px solid #6a3218;
  border-radius: 6px;
  background: #8a3d16;
  color: #fff4d8;
  font-size: 12px;
  font-weight: 800;
  line-height: 18px;
  cursor: pointer;
}

.round-clear:disabled {
  border-color: #6a5a48;
  background: #4a4036;
  color: #b7aa98;
  cursor: not-allowed;
}

.round-bubble .round-note {
  color: #6d5b45;
  font-weight: 600;
}

.station-progress.hold {
  visibility: hidden;
}

.dispatch-fly {
  position: fixed;
  z-index: calc(var(--z-quest) - 1);
  pointer-events: none;
  transform: translate(-50%, -50%);
}

.dispatch-fly.moving {
  transition: left 450ms ease, top 450ms ease;
}

.station.locked {
  filter: grayscale(0.85);
  opacity: 0.48;
}

.station .notice {
  position: absolute;
  top: 6px;
  right: 42px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--danger);
  box-shadow: 0 0 0 2px var(--wood-face);
  pointer-events: none;
}

.station-rail {
  position: relative;
  flex: 0 0 32px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
  min-width: 0;
  min-height: 0;
  padding: 2px;
}

.station-name {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  min-width: 0;
  padding: 3px 1px;
  border-radius: 4px;
  background: linear-gradient(180deg, #6a3218, #4a2214);
  color: #fff4d8;
}

.station-name :deep(.ui-ico) {
  width: 15px;
  height: 15px;
  color: #fff4d8;
}

.station-name b {
  font-size: 13px;
  line-height: 1.1;
  letter-spacing: 0.04em;
  writing-mode: vertical-rl;
}

.station-detail {
  position: absolute;
  left: 2px;
  bottom: 2px;
  z-index: 4;
  width: 22px;
  height: 22px;
  min-width: 22px;
  min-height: 22px;
  margin: 0;
  padding: 0;
  border: 1px solid var(--gold-deep);
  border-radius: 50%;
  background: var(--wood-face);
  color: var(--ink);
  font-size: 11px;
  font-weight: 800;
  line-height: 20px;
}

.station-work {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.station-craft-row {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 6px;
  row-gap: 3px;
  min-width: 0;
  padding: 0 4px 3px;
}

.station-craft-row :deep(.ui-select.station-craft-pick) {
  grid-column: 1;
  grid-row: 1;
  width: 100%;
  min-width: 0;
}

.station-craft-row :deep(.station-craft-pick .face) {
  min-height: 26px;
  padding: 1px 6px;
  gap: 4px;
  font-size: 12px;
}

.station-craft-row :deep(.station-craft-pick .lab) {
  font-weight: 800;
  color: var(--copper);
}

.station-craft-row :deep(.station-progress .eff) {
  grid-column: 2;
  grid-row: 1;
}

.station-craft-row :deep(.station-progress .bar) {
  grid-column: 1 / -1;
  grid-row: 2;
  width: 100%;
  height: 12px;
  border-width: 1px;
}

.slots {
  display: flex;
  align-items: stretch;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  gap: 4px;
  padding: 4px;
}

.slot {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px;
  border: 2px solid var(--stroke);
  border-radius: 7px;
  background: rgba(246, 226, 188, 0.72);
  box-shadow: none;
  touch-action: none;
}

.slot.empty {
  justify-content: center;
  flex-direction: column;
  gap: 0;
  border-style: dashed;
  background: rgba(232, 188, 116, 0.35);
  color: #a77840;
  cursor: default;
  touch-action: manipulation;
}

.slot.drop-ok,
.rest.drop-ok,
.rest-row.drop-ok {
  box-shadow: 0 0 0 2px var(--moss);
}

.slot.drop-no,
.rest.drop-no,
.rest-row.drop-no {
  box-shadow: 0 0 0 2px var(--danger);
}

.empty-lab {
  font-size: 9px;
  font-weight: 800;
}

.hp-fill {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 0;
  pointer-events: none;
  background: linear-gradient(90deg, rgba(196, 148, 28, 0.58), rgba(168, 118, 12, 0.46));
  box-shadow: inset -2px 0 0 rgba(106, 66, 24, 0.28);
  transition: width 0.3s ease;
}

.slot.has-banter {
  overflow: visible;
  z-index: 2;
}

.slot.has-banter .slot-main {
  overflow: visible;
}

.slot.has-banter .hp-fill {
  border-radius: 6px 0 0 6px;
}

.slot.has-banter.hp-full .hp-fill {
  border-radius: 6px;
}

.hp-full .hp-fill {
  background: linear-gradient(90deg, rgba(74, 168, 42, 0.58), rgba(46, 132, 28, 0.46));
  box-shadow: inset -2px 0 0 rgba(46, 100, 24, 0.32);
}

.hp-low .hp-fill {
  background: linear-gradient(90deg, rgba(196, 72, 58, 0.6), rgba(168, 40, 34, 0.48));
  box-shadow: inset -2px 0 0 rgba(120, 28, 24, 0.34);
}

.rest-row.eat-flash {
  overflow: visible;
  z-index: 3;
  animation: eat-glow 0.7s ease-out;
}

.rest-row.eat-flash .hp-fill {
  background: linear-gradient(90deg, rgba(150, 230, 110, 0.88), rgba(90, 190, 70, 0.72));
  box-shadow: inset 0 0 8px rgba(230, 255, 200, 0.95);
}

.eat-float {
  position: absolute;
  left: 26px;
  top: 1px;
  z-index: 4;
  color: #2f7a22;
  font-size: 9px;
  font-style: normal;
  font-weight: 800;
  line-height: 1;
  pointer-events: none;
  white-space: nowrap;
  animation: eat-float 0.7s ease-out forwards;
}

@keyframes eat-glow {
  0% {
    box-shadow: 0 0 0 0 rgba(120, 210, 90, 0);
  }
  40% {
    box-shadow:
      inset 0 0 0 2px rgba(170, 235, 120, 0.95),
      0 0 10px 2px rgba(120, 210, 90, 0.7);
  }
  100% {
    box-shadow: 0 2px 0 rgba(170, 108, 31, 0.28);
  }
}

@keyframes eat-float {
  0% {
    opacity: 0;
    transform: translateY(4px);
  }
  18% {
    opacity: 1;
    transform: translateY(0);
  }
  100% {
    opacity: 0;
    transform: translateY(-12px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .hp-fill {
    transition: none;
  }

  .station .slot :deep(.worker-avatar.enter-land),
  .rest-row.eat-flash,
  .eat-float {
    animation: none;
  }
}

.station .slot.enter-slot {
  overflow: visible;
  z-index: 2;
}

.station .slot :deep(.worker-avatar) {
  z-index: 1;
}

.station .slot :deep(.worker-avatar.enter-land) {
  z-index: 2;
  animation: worker-enter 0.45s cubic-bezier(0.22, 0.9, 0.24, 1) both;
  animation-delay: var(--enter-delay, 0ms);
}

@keyframes worker-enter {
  0% {
    transform: translateY(-8px) scale(0.55);
    box-shadow: 0 0 0 0 transparent;
  }
  62% {
    transform: translateY(1px) scale(1.08);
    box-shadow: 0 0 0 3px var(--enter-edge, #d4a84a);
  }
  100% {
    transform: translateY(0) scale(1);
    box-shadow: 0 0 0 0 transparent;
  }
}

.slot-main {
  position: relative;
  z-index: 1;
  min-width: 0;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  overflow: hidden;
}

.slot-main b {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  line-height: 12px;
}

.slot-main em,
.rest-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-style: normal;
}

.race-tag {
  flex: 0 0 auto;
  margin-left: 3px;
  padding: 0 3px;
  border: 1px solid var(--gold-deep, #8a6a32);
  border-radius: 3px;
  color: var(--ink, #3a2a16);
  font-style: normal;
  font-size: 9px;
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: 0;
}

.slot-main small {
  color: var(--muted);
  font-size: 9px;
  font-weight: 800;
  white-space: nowrap;
}

.station .slot .slot-main {
  flex-wrap: nowrap;
  gap: 4px;
}

.station .slot .slot-main b {
  min-width: 0;
  gap: 6px;
  font-size: 20px;
  line-height: 22px;
}

.station .slot .slot-main small {
  font-size: 18px;
}

.banter {
  position: absolute;
  z-index: 6;
  left: 0;
  right: 0;
  top: auto;
  bottom: calc(100% + 1px);
  margin: 0;
  padding: 1px 4px;
  border: 1px solid var(--gold-deep);
  border-radius: 6px;
  background: rgba(255, 248, 230, 0.96);
  color: var(--ink);
  font-size: 10px;
  font-weight: 700;
  line-height: 1.25;
  text-align: center;
  pointer-events: none;
  transform: none;
  animation: worker-banter 20s ease-out forwards;
}

.station-list:has(> .station:first-child .slot.has-banter) {
  padding-top: 22px;
}

.tutor-tip {
  position: absolute;
  z-index: 2;
  left: 56px;
  right: 4px;
  top: 4px;
  max-width: none;
  margin: 0;
  padding: 2px 5px;
  border: 1px solid var(--gold-deep);
  border-radius: 6px;
  background: rgba(255, 248, 230, 0.96);
  color: var(--ink);
  font-family: inherit;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.25;
  text-align: left;
  pointer-events: auto;
  cursor: pointer;
  appearance: none;
}

.slot.has-tutor {
  overflow: visible;
  z-index: 2;
}

.rest-name {
  position: relative;
  z-index: 1;
  flex: 1;
  font-size: 10px;
  font-weight: 800;
  line-height: 12px;
}

.qdot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  border: 1px solid #8a6410;
}

.station .slot .qdot {
  flex: none;
  width: 12px;
  height: 12px;
  border-width: 2px;
}

.rest-row {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: flex;
  align-items: center;
  gap: 0;
  margin-bottom: 4px;
  border: 2px solid var(--stroke);
  border-radius: 7px;
  background: rgba(246, 226, 188, 0.72);
  box-shadow: 0 2px 0 rgba(170, 108, 31, 0.28);
}

.rest-row.queue-ready {
  background: rgba(255, 236, 160, 0.95);
  box-shadow:
    inset 0 0 0 1px rgba(62, 154, 42, 0.55),
    0 2px 0 rgba(170, 108, 31, 0.28);
}

.rest-row.queue-blocked {
  box-shadow:
    inset 0 0 0 1px rgba(176, 72, 64, 0.7),
    0 2px 0 rgba(170, 108, 31, 0.28);
}

.rest-row.queue-dim {
  opacity: 0.5;
}

.rest-queue {
  position: relative;
  z-index: 1;
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 14px;
  gap: 1px;
}

.rest-order {
  color: var(--ink);
  font-size: 11px;
  font-style: normal;
  font-weight: 900;
  line-height: 1;
  text-align: center;
}

.rest-badge {
  padding: 0 1px;
  border-radius: 3px;
  font-size: 8px;
  font-style: normal;
  font-weight: 900;
  line-height: 1.15;
  white-space: nowrap;
}

.queue-ready .rest-badge {
  background: rgba(122, 214, 78, 0.45);
  color: var(--moss-deep);
}

.queue-blocked .rest-badge {
  background: rgba(226, 74, 58, 0.22);
  color: #8a3228;
}

.rest-face {
  position: relative;
  z-index: 1;
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 3px 14px 3px 2px;
  border: 0;
  background: transparent;
  box-shadow: none;
  touch-action: pan-y;
}

.rest-list .rest-row,
.rest-list .rest-face,
.rest-list .rest-go {
  touch-action: none;
}

.rest-go {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 2;
  width: 16px;
  height: 100%;
  min-height: 0;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  color: #b77720;
  font-size: 13px;
  font-weight: 900;
}

.empty-rest {
  margin: 6px 3px;
  color: var(--muted);
  font-size: 10px;
  font-weight: 700;
  line-height: 1.35;
  text-align: center;
}

.drag-ghost {
  position: fixed;
  z-index: calc(var(--z-quest) - 1);
  pointer-events: none;
  transform: translate(-50%, -120%);
  min-height: 32px;
  padding: 6px 10px;
  border: 2px solid var(--gold-deep);
  border-radius: 10px;
  background: var(--accent-face);
  color: var(--ink);
  font-size: 12px;
  font-weight: 900;
  box-shadow: 0 4px 0 var(--gold-deep);
}

.hint {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.modal {
  position: fixed;
  inset: 0;
  z-index: var(--z-sheet);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 16px 12px 0;
  background: rgba(8, 28, 14, 0.58);
}

.sheet {
  width: min(480px, 100%);
  position: relative;
  z-index: calc(var(--z-sheet) + 1);
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: min(78vh, 640px);
  overflow: auto;
  padding: 16px 16px calc(16px + var(--dock-height));
  border: 3px solid var(--gold-deep);
  border-radius: 16px 16px 12px 12px;
  background: var(--wood-face);
  box-shadow: 0 6px 0 var(--shadow);
}

.sheet header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.sheet-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.food-rule {
  width: 32px;
  min-width: 32px;
  height: 32px;
  min-height: 32px;
  padding: 0;
  border-radius: 50%;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
}

.sheet .title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 18px;
}

.sheet-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
}

.go,
.close {
  min-height: 32px;
  padding: 4px 10px;
}

.meta {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--muted);
}

.hp-slot {
  width: 100%;
}

.attrs {
  display: flex;
  align-items: center;
  margin: 0;
}

.tool-row {
  align-items: center;
}

.tool-row :deep(.ui-select) {
  min-width: 132px;
  flex: 1 1 132px;
}

.qty-input {
  font: inherit;
  color: var(--ink);
  min-height: 36px;
  min-width: 64px;
  width: 72px;
  padding: 6px 10px;
  border: 3px solid var(--gold-deep);
  border-radius: 12px;
  background: var(--wood-face);
  box-shadow: 0 3px 0 var(--shadow);
}

.crew {
  display: flex;
  gap: 4px;
  min-height: 8px;
  align-items: center;
}

.crew i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1.5px solid #8a6410;
  display: block;
}

.crew i.empty {
  opacity: 0.55;
}

.pick-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.pick-cell {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.pick-list button {
  font: inherit;
  font-weight: 800;
  min-height: 48px;
  border: 3px solid var(--gold-deep);
  border-radius: 12px;
  background: var(--wood-face);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.pick-list .fuse-main {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.pick-list button.on {
  background: var(--tab-on);
}

.pick-list button:disabled:not(.on) {
  opacity: 0.55;
}

.pick-list button.locked {
  filter: grayscale(0.8);
  opacity: 0.5;
}

@keyframes worker-banter {
  0% {
    opacity: 0;
  }
  1.32%,
  97.58% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .banter {
    animation: none;
  }
}

.roster-v2 .workshop {
  border-right: 0;
}

.roster-v2 .board {
  position: relative;
}

.roster-v2 .col.side {
  display: none;
}

.roster-v2 .station-list {
  grid-template-rows: repeat(6, minmax(36px, 1fr));
}

.roster-v2 .station {
  cursor: pointer;
}

.roster-v2:not(.sheet-ops) .station-craft-row :deep(.ui-select.station-craft-pick) {
  display: none;
}

.roster-v2:not(.sheet-ops) .station-rail {
  flex: 0 0 64px;
  width: 64px;
  align-self: stretch;
  align-items: stretch;
  justify-content: flex-start;
  padding: 0;
}

.roster-v2:not(.sheet-ops) .station-name {
  flex: 1 1 auto;
  align-self: stretch;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 100%;
  height: 100%;
  min-height: 100%;
  box-sizing: border-box;
  padding: 4px 2px;
  border-radius: 6px 0 0 6px;
}

.roster-v2:not(.sheet-ops) .station-name :deep(.ui-ico) {
  width: 28px;
  height: 28px;
}

.roster-v2:not(.sheet-ops) .station-name b {
  letter-spacing: 0;
  writing-mode: horizontal-tb;
  text-align: center;
  white-space: nowrap;
}

.roster-v2:not(.sheet-ops) .station-craft-row :deep(.station-progress .bar) {
  grid-column: 1;
  grid-row: 1;
  box-sizing: border-box;
  min-width: 0;
  width: 100%;
}

.roster-v2:not(.sheet-ops) .station-craft-row :deep(.station-progress .eff) {
  grid-column: 2;
  grid-row: 1;
  justify-self: end;
  text-align: right;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.station.closed .station-name b::after {
  content: '封';
  margin-left: 4px;
  padding: 0 3px;
  border-radius: 3px;
  background: #8a3a2a;
  color: #fff4d8;
  font-size: 10px;
  line-height: 1.3;
  letter-spacing: 0;
  writing-mode: horizontal-tb;
}

.roster-v2 .slot.empty {
  opacity: 0.55;
}

.roster-v2.sheet-rest .col.side,
.roster-v2.sheet-combat .col.side {
  display: flex;
  flex-direction: column;
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  width: auto;
  height: 58%;
  z-index: 6;
  overflow: auto;
  background: var(--wood-lite);
  border-top: 3px solid var(--gold-deep);
  box-shadow: 0 -6px 0 rgba(90, 48, 16, 0.12);
}

.roster-v2.sheet-combat .zone.rest,
.roster-v2.sheet-rest .zone.combat {
  display: none;
}

.roster-v2.sheet-rest .zone-head,
.roster-v2.sheet-combat .zone-head {
  padding: 8px 10px 4px;
  font-size: 13px;
  text-align: left;
}

.roster-v2.sheet-rest .rest-name,
.roster-v2.sheet-combat .rest-name {
  font-size: 14px;
  line-height: 18px;
}

.roster-v2.sheet-rest .rest-face,
.roster-v2.sheet-combat .rest-face {
  gap: 8px;
  min-height: 44px;
  padding: 6px 32px 6px 8px;
}

.roster-v2.sheet-rest .rest-go,
.roster-v2.sheet-combat .rest-go {
  width: 28px;
  font-size: 18px;
}

.roster-v2.sheet-rest .rest-order,
.roster-v2.sheet-combat .rest-order {
  font-size: 13px;
}

.roster-v2.sheet-rest .rest-badge,
.roster-v2.sheet-combat .rest-badge {
  font-size: 10px;
}

.empty-combat {
  margin: 10px 8px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 700;
  text-align: center;
}

</style>
