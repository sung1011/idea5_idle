<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { bankQty } from '../sim/bank'
import { formatMarchClock } from '../sim/encounters'
import { isWorkerInCombat, workerLiveStats } from '../sim/combat'
import { combatZoneRows, formatRemainClock, type CombatZoneRow } from '../sim/march'
import { workerXpProgress } from '../sim/workerLevel'
import CombatAttrRow from './combatAttrRow.vue'
import { availablePotionInstallIds } from '../sim/potionSlots'
import {
  CLASS_LABEL,
  FOOD_ITEM_IDS,
  ITEM_DEF,
  isPotionItemId,
  STATION_DEF,
  type FoodItemId,
} from '../sim/tables'
import {
  isStimActive,
  potionRemainS,
} from '../sim/potions'
import {
  isPotionHelpOpen,
  nextPotionHelp,
  POTION_EQUIP_HINT,
  potionHelpCopy,
  type PotionHelpKey,
} from './potionHelp'
import type { ItemId } from '../sim/types'
import { isGuideQuestFlash } from '../sim/guideQuest'
import { isStationUnlocked, stationLockedTip } from '../sim/stationUnlock'
import { pushFloatTip } from './floatTips'
import { isWorkerEatFlashing, workerEatFlashText } from './workerEatFlash'
import { isWorkerLevelFlashing } from './workerLevelFlash'
import {
  announceWorkerStationEnters,
  isWorkerEntering,
  workerAssignSnapshot,
  workerEnterDelayMs,
} from './workerEnterFlash'
import { recruitCost } from '../sim/tech'
import type { CategoryId, ClassId, PotionItemId, StationId, Worker } from '../sim/types'
import ClassIcon from './classIcon.vue'
import { openWorkshopStation } from './appNav'
import { stationCraftPickOptions, stationCraftPickReadonly } from './stationCraftLabel'
import StationDetailSheet from './stationDetailSheet.vue'
import StationMiniBar from './stationMiniBar.vue'
import { showStationDetail, openStationDetailId } from './stationDetailNav'
import { isItemSourceStationFlash } from './itemSource'
import StationTips from './stationTips.vue'
import { dismissWorkshopBanter, greetWorkshopBanter, workshopBanterText } from './workshopBanter'
import { considerWorkerTutor, dismissWorkerTutor, hideWorkerTutor, workerTutorText } from './workerTutorTips'
import { useFrameNow } from './visualProgress'
import { useGameStore } from './gameStore'
import HpBar from './hpBar.vue'
import { hpBarFill, hpBarTone } from './hpBar'
import { workerWearHp } from '../sim/workshopHp'
import {
  canGoToAssignedWorkshop,
  workerAssignChoices,
  workerDutyLabel,
  workerShortName,
  workshopStationBoards,
} from './workerGroups'
import { REST_HEAD_BADGE, restQueueRows, restZoneTitle } from './restQueue'
import { formatAtkSpeed } from './formatAtkSpeed'
import UiIcon from './uiIcon.vue'
import UiSelect from './uiSelect.vue'
import { qualityOf, workerQualityDotStyle, workerQualityNameStyle, workerQualityTileStyle } from './workerQuality'
import {
  canDragWorker,
  canDropWorker,
  dropTargetEquals,
  dropTargetFromDataset,
  FUSE_DRAG_TIP,
  MANUAL_DUTY_REASON,
  sameDragEndpoint,
  setWorkerDragActive,
  shouldShowFuseDragTip,
  shouldStartWorkerDrag,
  type WorkerDragSource,
  type WorkerDropTarget,
} from './workerDrag'

const game = useGameStore()
const showFuseDragTip = computed(() => shouldShowFuseDragTip(game.save))
const guideFlashRecruit = computed(() => isGuideQuestFlash(game.save, 'recruit'))
const guideFlashAssignHerb = computed(() => isGuideQuestFlash(game.save, 'assignHerb'))
const guideFlashFuse = computed(() => isGuideQuestFlash(game.save, 'fuse'))
const guideFlashPotionInstall = computed(() => isGuideQuestFlash(game.save, 'potionInstall'))
const guideFlashPotionUse = computed(() => isGuideQuestFlash(game.save, 'potionUse'))
const frameNow = useFrameNow()
const restFoodOpen = ref(false)
const restFoodLabel = computed(() => {
  const id = game.save.restFoodId
  if (!id) return '未选伙食'
  return `${ITEM_DEF[id].label} ×${bankQty(game.save, id)}`
})
const restFoodDry = computed(() => {
  const id = game.save.restFoodId
  return !!id && bankQty(game.save, id) <= 0
})
function onPickRestFood(itemId: FoodItemId | null) {
  game.selectRestFood(itemId)
  restFoodOpen.value = false
}
const selectedId = ref<string | null>(null)
const pickId = ref<string | null>(null)
const pickPotionIndex = ref<number | null>(null)

const boards = computed(() => workshopStationBoards(game.save))
const fightingRoster = computed(() =>
  combatZoneRows(game.save, frameNow.value)
    .map((row) => {
      const worker = game.save.workers.find((item) => item.id === row.workerId)
      return worker ? { worker, row } : null
    })
    .filter((item): item is { worker: Worker; row: CombatZoneRow } => !!item),
)
const restRows = computed(() => restQueueRows(game.save))
const recruitPrice = computed(() => recruitCost(game.save))
const canRecruit = computed(() => game.save.diamonds >= recruitPrice.value)
const selected = computed(() => {
  const id = selectedId.value
  if (!id) return null
  return game.save.workers.find((w) => w.id === id) ?? null
})
const picking = computed(() => {
  const id = pickId.value
  if (!id) return null
  return game.save.workers.find((w) => w.id === id) ?? null
})
const pickChoices = computed(() => (picking.value ? workerAssignChoices(game.save, picking.value) : []))

function fighting(w: Worker) {
  return isWorkerInCombat(game.save, w.id)
}

function combatTail(w: Worker) {
  const stats = workerLiveStats(w, game.save)
  const xp = workerXpProgress(w)
  return `Lv${w.level} · ATK ${stats.atk} · 攻速 ${formatAtkSpeed(stats.spd)} · XP ${xp.xp}/${xp.need}`
}

const potionSlots = computed(() => game.save.potionSlots)
const potionBuffLine = computed(() => {
  const save = game.save
  const t = save.elapsedS
  const parts: string[] = []
  if (isStimActive(save)) parts.push(`兴奋 ${formatMarchClock(potionRemainS(save.potionBuffs.stimUntil, t))}`)
  if (save.potionBuffs.renewUntil != null && t < save.potionBuffs.renewUntil) {
    parts.push(`续命 ${formatMarchClock(potionRemainS(save.potionBuffs.renewUntil, t))}`)
  }
  const mist = save.potionBuffs.doubleMist
  if (mist) parts.push(`双份雾 ${STATION_DEF[mist.stationId].label} ×${mist.mul}`)
  if (save.potionBuffs.rushStation) {
    parts.push(`赶工 ${STATION_DEF[save.potionBuffs.rushStation].label}`)
  }
  return parts.join(' · ')
})
const potionPickOptions = computed(() => availablePotionInstallIds(game.save))

function potionSlotQty(id: PotionItemId | null) {
  return id ? bankQty(game.save, id) : 0
}

const potionHelp = ref<PotionHelpKey | null>(null)
const potionHelpPos = ref({ left: 8, top: 8 })

function closePotionHelp() {
  potionHelp.value = null
}

function onPotionHelp(ev: MouseEvent, source: PotionHelpKey['source'], id: PotionItemId, index?: number) {
  ev.stopPropagation()
  const next = nextPotionHelp(potionHelp.value, source === 'slot' ? { source, id, index } : { source, id })
  potionHelp.value = next
  if (!next) return
  const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect()
  potionHelpPos.value = {
    left: Math.min(window.innerWidth - 228, Math.max(8, rect.left)),
    top: Math.min(window.innerHeight - 120, rect.bottom + 6),
  }
}

const canUnequipPotionHelp = computed(() => {
  const key = potionHelp.value
  if (!key || key.source !== 'slot' || key.index == null) return false
  return game.save.potionSlots[key.index] != null
})

function onUnequipPotionHelp() {
  const key = potionHelp.value
  if (!key || key.source !== 'slot' || key.index == null) return
  game.clearPotionSlot(key.index)
  closePotionHelp()
}

function onDocPotionHelp(ev: PointerEvent) {
  const el = ev.target
  if (!(el instanceof Element)) return
  if (el.closest('[data-potion-help]') || el.closest('[data-potion-bubble]')) return
  closePotionHelp()
}

const potionHelpBubble = computed(() => {
  const key = potionHelp.value
  if (!key) return null
  return potionHelpCopy(key.id, key.source === 'slot' ? bankQty(game.save, key.id) : undefined)
})

function onPotionSlot(index: number) {
  const id = game.save.potionSlots[index]
  closePotionHelp()
  if (!id) {
    pickPotionIndex.value = index
    return
  }
  game.usePotionSlot(index)
}

function onInstallPotion(itemId: PotionItemId) {
  const index = pickPotionIndex.value
  if (index == null) return
  closePotionHelp()
  const result = game.installPotion(index, itemId)
  if (result.ok) pickPotionIndex.value = null
}

function closePotionPick() {
  pickPotionIndex.value = null
  closePotionHelp()
}

function jobLabel(w: Worker) {
  return w.classId ? CLASS_LABEL[w.classId] : '未标'
}

function classIconOf(w: Worker): ClassId {
  return w.classId ?? 'laborer'
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
  selectedId.value = w.id
}

function closeSheet() {
  selectedId.value = null
}

function openPick(w: Worker) {
  pickId.value = w.id
}

function closePick() {
  pickId.value = null
}

function goWorkshop() {
  const w = picking.value
  if (!w?.assignment) return
  openWorkshopStation(w.assignment)
  closePick()
}

function openStationDetail(stationId: StationId) {
  if (!isStationUnlocked(game.save, stationId)) {
    pushFloatTip(stationLockedTip(stationId))
    return
  }
  showStationDetail(stationId)
}

function closeStationDetail() {
  showStationDetail(null)
}

function onPickStation(stationId: StationId | null) {
  const w = picking.value
  if (!w) return
  if (stationId == null || w.assignment == null) {
    pushFloatTip(MANUAL_DUTY_REASON)
    return
  }
  if (!isStationUnlocked(game.save, stationId)) {
    pushFloatTip(stationLockedTip(stationId))
    return
  }
  const result = game.assign(w.id, stationId)
  if (result.ok) closePick()
  else if (result.reason) pushFloatTip(result.reason)
}

function onEmptySlot(stationId: StationId) {
  if (drag.value?.active) return
  const result = game.assignIdle(stationId)
  if (!result.ok) pushFloatTip(result.reason)
}

function onToggleClosed(stationId: StationId) {
  if (drag.value?.active) return
  game.toggleStationClosed(stationId)
}

function stationLocked(stationId: StationId) {
  return !isStationUnlocked(game.save, stationId)
}

function potionSlotLabel(itemId: ItemId | null) {
  if (!itemId || !isPotionItemId(itemId)) return '空'
  return `${ITEM_DEF[itemId].label} ×${bankQty(game.save, itemId)}`
}

function openSheetThenPick(w: Worker) {
  closeSheet()
  openPick(w)
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

function sourceOf(w: Worker, stationId: StationId | null, slotIndex: number | null): WorkerDragSource | null {
  if (stationId && slotIndex != null) {
    if (!canDragWorker(game.save, w.id)) return null
    return { kind: 'slot', workerId: w.id, stationId, slotIndex }
  }
  if (w.assignment === null) return { kind: 'rest', workerId: w.id }
  return null
}

function unbindDrag() {
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
  drag.value = {
    workerId: w.id,
    name: workerShortName(w),
    source: sourceOf(w, stationId, slotIndex),
    startX: ev.clientX,
    startY: ev.clientY,
    x: ev.clientX,
    y: ev.clientY,
    active: false,
    pointerId: ev.pointerId,
    over: null,
  }
  window.addEventListener('pointermove', onDragMove, { passive: false })
  window.addEventListener('pointerup', onDragEnd)
  window.addEventListener('pointercancel', onDragEnd)
}

function onDragMove(ev: PointerEvent) {
  const session = drag.value
  if (!session || session.pointerId !== ev.pointerId) return
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
    game.clearWorkerNew(session.workerId)
    const handle = ev.target
    if (handle instanceof Element && handle.setPointerCapture) {
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

function restDropClass(): string {
  const session = drag.value
  if (!session?.active || !session.source) return ''
  const target: WorkerDropTarget = { kind: 'rest' }
  if (canDropWorker(game.save, session.source, target)) return 'drop-ok'
  if (dropTargetEquals(session.over, target)) return 'drop-no'
  return ''
}

function restWorkerDropClass(workerId: string): string {
  const session = drag.value
  if (!session?.active || !session.source) return ''
  const target: WorkerDropTarget = { kind: 'restWorker', workerId }
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
  const face = workerQualityTileStyle(worker)
  if (!isWorkerEntering(worker.id)) return face
  return {
    ...face,
    '--enter-delay': `${workerEnterDelayMs(worker.id)}ms`,
    '--enter-edge': face.borderColor,
  }
}

let tutorTimer = 0
onMounted(() => {
  document.addEventListener('pointerdown', onDocPotionHelp, true)
  greetWorkshopBanter(game.save)
  considerWorkerTutor(game.save, Date.now())
  tutorTimer = window.setInterval(() => considerWorkerTutor(game.save, Date.now()), 1000)
})
onUnmounted(() => {
  unbindDrag()
  setWorkerDragActive(false)
  dismissWorkshopBanter()
  window.clearInterval(tutorTimer)
  hideWorkerTutor()
  document.removeEventListener('pointerdown', onDocPotionHelp, true)
})
</script>

<template>
  <section class="panel roster-v2" :class="{ dragging: drag?.active }">
    <div class="board">
      <section class="col workshop" aria-label="在工坊">
        <p v-if="showFuseDragTip" class="fuse-drag-tip" role="status">{{ FUSE_DRAG_TIP }}</p>
        <div class="station-list">
          <article
            v-for="board in boards"
            :key="board.stationId"
            class="station"
            :class="{
              locked: stationLocked(board.stationId),
              'guide-flash': isItemSourceStationFlash(board.stationId),
            }"
          >
            <StationTips :station-id="board.stationId" />
            <div class="station-rail">
              <div class="station-name">
                <UiIcon :name="board.stationId" />
                <b>{{ board.label }}</b>
              </div>
              <button
                type="button"
                class="station-closed"
                :class="{ on: game.save.stations[board.stationId].closed }"
                :aria-pressed="!!game.save.stations[board.stationId].closed"
                :aria-label="game.save.stations[board.stationId].closed ? `开放${board.label}` : `封闭${board.label}`"
                @click.stop="onToggleClosed(board.stationId)"
              >
                封闭
              </button>
              <button
                type="button"
                class="station-detail"
                :aria-label="`查看${board.label}详情`"
                @click.stop="openStationDetail(board.stationId)"
              >
                详情
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
                      'guide-flash': !w && guideFlashAssignHerb && board.stationId === 'herbalism' && board.filled === 0,
                    },
                    w ? hpToneClass(w) : '',
                    slotDropClass(board.stationId, i),
                  ]"
                  :data-drop="'slot'"
                  :data-station="board.stationId"
                  :data-slot="i"
                  :aria-label="w ? `${workerShortName(w)} ${sheetMeta(w)}` : `${board.label}空岗 · 点此派入`"
                  @pointerdown="w ? onWorkerPointerDown($event, w, board.stationId, i) : undefined"
                  @click="w ? undefined : onEmptySlot(board.stationId)"
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
                    <span
                      class="avatar"
                      :class="{ 'enter-land': isWorkerEntering(w.id) }"
                      :style="stationAvatarStyle(w)"
                    >
                      <ClassIcon :name="classIconOf(w)" />
                      <i v-if="w.isNew" class="worker-new" aria-label="新工人">NEW</i>
                    </span>
                    <span class="slot-main">
                      <b>
                        <i class="qdot" :style="workerQualityDotStyle(w.qualityTier)" />
                        <em :style="workerQualityNameStyle(w)">{{ workerShortName(w) }}</em>
                      </b>
                      <small>Lv{{ w.level }}</small>
                    </span>
                  </template>
                  <template v-else>
                    <span class="empty-mark" aria-hidden="true">＋</span>
                    <span class="empty-lab">点此派入</span>
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
                <StationMiniBar class="station-progress" :station-id="board.stationId" />
              </div>
            </div>
          </article>
          <div class="potion-row" aria-label="药剂技能槽">
            <button
              v-for="(itemId, i) in potionSlots"
              :key="`potion-${i}`"
              type="button"
              class="potion-slot"
              :class="{
                empty: !itemId,
                dry: !!itemId && potionSlotQty(itemId) <= 0,
                'guide-flash': (!itemId && guideFlashPotionInstall) || (!!itemId && guideFlashPotionUse),
              }"
              :aria-label="itemId ? `${potionSlotLabel(itemId)} · 点击使用` : `装入药剂槽 ${i + 1}`"
              @click="onPotionSlot(i)"
            >
              <template v-if="itemId">
                <UiIcon name="alchemy" />
                <span class="potion-lab">{{ potionSlotLabel(itemId) }}</span>
                <span
                  class="potion-help"
                  data-potion-help
                  role="button"
                  :aria-pressed="isPotionHelpOpen(potionHelp, 'slot', itemId, i)"
                  :aria-label="`查看 ${ITEM_DEF[itemId].label} 效果`"
                  @click.stop="onPotionHelp($event, 'slot', itemId, i)"
                >i</span>
              </template>
              <template v-else>
                <span class="empty-mark" aria-hidden="true">＋</span>
                <span class="empty-lab">药剂</span>
              </template>
            </button>
          </div>
          <p v-if="potionBuffLine" class="potion-buffs">{{ potionBuffLine }}</p>
        </div>
      </section>
      <div class="col side">
        <section class="zone combat" :class="{ empty: !fightingRoster.length }" aria-label="战斗区">
          <header class="zone-head">战斗区 · {{ fightingRoster.length }}</header>
          <div v-if="fightingRoster.length" class="zone-list">
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
                <span class="avatar" :style="workerQualityTileStyle(item.worker)">
                  <ClassIcon :name="classIconOf(item.worker)" />
                  <i v-if="item.worker.isNew" class="worker-new" aria-label="新工人">NEW</i>
                </span>
                <b class="rest-name" :style="workerQualityNameStyle(item.worker)">{{ workerShortName(item.worker) }}</b>
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
        <section
          class="zone rest"
          :class="[restDropClass(), { 'guide-flash': guideFlashFuse }]"
          aria-label="休息区"
          data-drop="rest"
        >
          <header class="zone-head">{{ restZoneTitle(restRows.length) }}</header>
          <button
            type="button"
            class="recruit-bar"
            :class="{ off: !canRecruit, 'guide-flash': guideFlashRecruit }"
            :disabled="!canRecruit"
            :aria-label="`抽工人 · ${recruitPrice} 钻`"
            @click="game.recruit()"
          >
            <span class="recruit-bar-lab">抽工人</span>
            <span class="recruit-bar-cost">{{ recruitPrice }} 钻</span>
          </button>
          <button
            type="button"
            class="rest-food"
            :class="{ dry: restFoodDry }"
            :aria-label="`休息区伙食 · ${restFoodLabel}`"
            @click="restFoodOpen = true"
          >
            {{ restFoodLabel }}
          </button>
          <div v-if="restRows.length" class="zone-list rest-list">
            <div
              v-for="row in restRows"
              :key="row.id"
              class="rest-row"
              :class="[
                hpToneClass(row.worker),
                restWorkerDropClass(row.id),
                {
                  'level-flash': isWorkerLevelFlashing(row.id),
                  'eat-flash': isWorkerEatFlashing(row.id),
                  'has-tutor': tutorLine(row.id),
                  'queue-ready': row.badge === REST_HEAD_BADGE,
                  'queue-blocked': row.badge === '堵队',
                  'queue-dim': row.dim,
                },
              ]"
              data-drop="rest-worker"
              :data-worker="row.id"
            >
              <i class="hp-fill" :style="hpFillStyle(row.worker)" aria-hidden="true" />
              <button
                type="button"
                class="rest-face"
                :aria-label="`${row.order}${row.badge ? ' ' + row.badge : ''} 拖动派驻 ${workerShortName(row.worker)}`"
                @pointerdown="onWorkerPointerDown($event, row.worker, null, null)"
              >
                <span class="rest-queue">
                  <span class="rest-order">{{ row.order }}</span>
                  <i v-if="row.badge" class="rest-badge">{{ row.badge }}</i>
                </span>
                <span class="avatar" :style="workerQualityTileStyle(row.worker)">
                  <ClassIcon :name="classIconOf(row.worker)" />
                  <i v-if="row.worker.isNew" class="worker-new" aria-label="新工人">NEW</i>
                </span>
                <em v-if="workerEatFlashText(row.id)" class="eat-float">{{ workerEatFlashText(row.id) }}</em>
                <b class="rest-name" :style="workerQualityNameStyle(row.worker)">{{ workerShortName(row.worker) }}</b>
              </button>
              <button
                v-if="tutorLine(row.id)"
                type="button"
                class="tutor-tip"
                :aria-label="`关掉教程：${tutorLine(row.id)}`"
                @pointerdown.stop
                @click.stop="onDismissTutor"
              >
                {{ tutorLine(row.id) }}
              </button>
              <button
                type="button"
                class="rest-go"
                :aria-label="`${workerShortName(row.worker)} 详情`"
                @pointerdown.stop
                @click="openSheet(row.worker)"
              >
                ›
              </button>
            </div>
          </div>
          <p v-else class="empty-rest">无人</p>
        </section>
      </div>
    </div>
    <Teleport to="body">
      <div v-if="drag?.active" class="drag-ghost" :style="{ left: `${drag.x}px`, top: `${drag.y}px` }">
        {{ drag.name }}
      </div>
    </Teleport>
  </section>

  <Teleport to="body">
    <div
      v-if="selected"
      class="modal"
      role="dialog"
      aria-modal="true"
      :aria-label="workerShortName(selected)"
      @click.self="closeSheet"
    >
      <div class="sheet">
        <header>
          <h2 class="title">{{ workerShortName(selected) }}</h2>
          <button type="button" class="close" @click="closeSheet">关闭</button>
        </header>
        <p class="meta">{{ sheetMeta(selected) }}</p>
        <HpBar class="hp-slot" :hp="selected.hp" :hp-max="selected.hpMax" />
        <p class="hint">{{ combatTail(selected) }}<template v-if="fighting(selected)"> · 战斗中</template></p>
        <p class="attrs">
          <CombatAttrRow :attrs="selected.combatAttrs" />
        </p>
        <div class="sheet-actions">
          <button type="button" class="go" @click="openSheetThenPick(selected)">派驻</button>
        </div>
      </div>
    </div>
  </Teleport>

  <StationDetailSheet
    v-if="openStationDetailId"
    :station-id="openStationDetailId"
    @close="closeStationDetail"
    @open-worker="openSheet"
  />

  <Teleport to="body">
    <div
      v-if="picking"
      class="modal"
      role="dialog"
      aria-modal="true"
      :aria-label="`派驻 · ${workerShortName(picking)}`"
      @click.self="closePick"
    >
      <div class="sheet">
        <header>
          <h2 class="title">派驻 · {{ workerShortName(picking) }}</h2>
        </header>
        <div class="pick-list">
          <div v-for="choice in pickChoices" :key="choice.stationId ?? 'rest'" class="pick-cell">
            <button
              type="button"
              :class="{
                on: choice.current,
                locked: choice.locked,
                'guide-flash':
                  guideFlashAssignHerb && choice.stationId === 'herbalism',
              }"
              :disabled="choice.disabled && !choice.locked"
              :aria-pressed="choice.current"
              @click="onPickStation(choice.stationId)"
            >
              <span class="crew" aria-hidden="true">
                <i
                  v-for="(dot, i) in choice.dots"
                  :key="i"
                  :class="{ empty: dot.empty }"
                  :style="{ background: dot.color }"
                />
              </span>
              <span>{{ choice.label }}</span>
            </button>
          </div>
        </div>
        <div class="sheet-actions">
          <button type="button" class="go" :disabled="!canGoToAssignedWorkshop(picking)" @click="goWorkshop">
            前往
          </button>
          <button type="button" class="close" @click="closePick">关闭</button>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div
      v-if="restFoodOpen"
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-label="选择伙食"
      @click.self="restFoodOpen = false"
    >
      <div class="sheet">
        <header>
          <h2 class="title">选择伙食</h2>
          <button type="button" class="close" @click="restFoodOpen = false">关闭</button>
        </header>
        <div class="pick-list">
          <div v-for="id in FOOD_ITEM_IDS" :key="id" class="pick-cell">
            <button
              type="button"
              :class="{ on: game.save.restFoodId === id }"
              :aria-pressed="game.save.restFoodId === id"
              @click="onPickRestFood(id)"
            >
              {{ ITEM_DEF[id].label }} ×{{ bankQty(game.save, id) }}
            </button>
          </div>
          <div class="pick-cell">
            <button
              type="button"
              :class="{ on: !game.save.restFoodId }"
              :aria-pressed="!game.save.restFoodId"
              @click="onPickRestFood(null)"
            >
              不选
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div
      v-if="pickPotionIndex != null"
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-label="装配药剂"
      @click.self="closePotionPick"
    >
      <div class="sheet">
        <header>
          <h2 class="title">装配药剂</h2>
          <button type="button" class="close" @click="closePotionPick">关闭</button>
        </header>
        <p class="hint">{{ POTION_EQUIP_HINT }}</p>
        <div class="pick-list">
          <div v-for="id in potionPickOptions" :key="id" class="pick-cell">
            <div class="potion-pick-row">
              <button type="button" class="potion-pick-main" @click="onInstallPotion(id)">
                <span>{{ ITEM_DEF[id].label }} ×{{ bankQty(game.save, id) }}</span>
              </button>
              <button
                type="button"
                class="potion-help pick"
                data-potion-help
                :aria-pressed="isPotionHelpOpen(potionHelp, 'pick', id)"
                :aria-label="`查看 ${ITEM_DEF[id].label} 效果`"
                @click.stop="onPotionHelp($event, 'pick', id)"
              >
                ？
              </button>
            </div>
          </div>
        </div>
        <p v-if="!potionPickOptions.length" class="hint">没有可装的药剂</p>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div
      v-if="potionHelpBubble"
      class="potion-bubble"
      data-potion-bubble
      role="dialog"
      :aria-label="potionHelpBubble.title"
      :style="{ left: `${potionHelpPos.left}px`, top: `${potionHelpPos.top}px` }"
    >
      <b>{{ potionHelpBubble.title }}</b>
      <p>{{ potionHelpBubble.effect }}</p>
      <small v-if="potionHelpBubble.stock != null">库存 ×{{ potionHelpBubble.stock }}</small>
      <button v-if="canUnequipPotionHelp" type="button" class="potion-bubble-unequip" @click="onUnequipPotionHelp">卸下</button>
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

.fuse-drag-tip {
  flex: 0 0 auto;
  margin: 4px 6px 0;
  padding: 4px 8px;
  border: 2px solid var(--gold-deep);
  border-radius: 8px;
  background: linear-gradient(#fffef8, #fff3d8);
  box-shadow: 0 2px 0 var(--shadow);
  color: var(--ink);
  font-size: 12px;
  font-weight: 800;
  line-height: 1.3;
  text-align: center;
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
  flex: 0 1 auto;
  max-height: 62%;
  background: linear-gradient(180deg, rgba(176, 62, 58, 0.14), rgba(255, 214, 196, 0.28));
  border-bottom: 2px solid rgba(176, 72, 64, 0.32);
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
  background: linear-gradient(90deg, #e2a31a, #ffe27a);
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
  background: linear-gradient(#ffe27a, #e2a31a);
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
  background: #fff9de;
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
  padding: 4px 6px;
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
  background: linear-gradient(145deg, #fff9de, #f3ddaa);
  box-shadow: 0 2px 0 var(--gold-deep);
}

.station.locked {
  filter: grayscale(0.85);
  opacity: 0.48;
}

.station-rail {
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

.station-closed,
.station-detail {
  flex: 1 1 0;
  width: 100%;
  min-height: 0;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 2px 0;
  border: 1px solid var(--gold-deep);
  border-radius: 4px;
  background: linear-gradient(180deg, #fff9de, #f3ddaa);
  color: var(--ink);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
  line-height: 1.05;
  writing-mode: vertical-rl;
}

.station-closed.on {
  background: linear-gradient(180deg, #8a3a2a, #5c2418);
  color: #fff4d8;
  border-color: #3d140e;
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
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 0 4px 3px;
}

.station-craft-row :deep(.ui-select.station-craft-pick) {
  flex: 1 1 46%;
  width: auto;
  min-width: 0;
  max-width: 62%;
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

.station-craft-row :deep(.station-progress) {
  flex: 1 1 0;
  min-width: 5em;
  padding: 0;
}

.potion-row {
  display: flex;
  align-items: stretch;
  min-height: var(--workshop-rail-row-min);
  min-width: 0;
  gap: 4px;
}

.potion-slot {
  position: relative;
  overflow: visible;
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  padding: 2px;
  border: 2px solid var(--gold);
  border-radius: 8px;
  background: linear-gradient(145deg, #fff9de, #f3ddaa);
  box-shadow: 0 2px 0 var(--gold-deep);
}

.potion-slot.empty,
.potion-slot.dry {
  border-style: dashed;
  background: rgba(255, 241, 190, 0.35);
  color: #a77840;
  box-shadow: none;
}

.potion-slot .potion-help {
  position: absolute;
  top: -2px;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  text-align: center;
}

.potion-slot .potion-help::before {
  content: '';
  position: absolute;
  inset: -6px;
}

.potion-slot .potion-help {
  right: -2px;
  background: #6a4a18;
  color: #fff8ee;
}

.potion-pick-row {
  position: relative;
  min-width: 0;
}

.potion-pick-main {
  width: 100%;
  min-width: 0;
  padding-right: 40px;
}

.potion-help.pick {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 2;
  width: 28px;
  min-width: 28px;
  min-height: 28px;
  padding: 0;
  border-radius: 50%;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
}

.potion-bubble {
  position: fixed;
  z-index: calc(var(--z-sheet) + 8);
  width: min(220px, calc(100vw - 16px));
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  border: 2px solid var(--gold-deep);
  border-radius: 10px;
  background: linear-gradient(#fffef8, #fff3d8);
  box-shadow: 0 4px 0 var(--shadow);
  color: var(--ink);
}

.potion-bubble b {
  font-size: 13px;
}

.potion-bubble p,
.potion-bubble small {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  font-weight: 700;
}

.potion-bubble small {
  color: var(--muted);
}

.potion-bubble-unequip {
  align-self: flex-start;
  min-height: 22px;
  margin-top: 2px;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 800;
}

.potion-buffs {
  margin: 0;
  padding: 0 2px;
  color: #7a4a22;
  font-size: 10px;
  font-weight: 800;
}

.potion-slot :deep(.ui-ico) {
  width: 14px;
  height: 14px;
  color: #6a3218;
}

.potion-lab {
  font-size: 9px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: 0.02em;
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
  border: 1px solid #d4a84a;
  border-radius: 7px;
  background: rgba(255, 247, 212, 0.45);
  box-shadow: none;
  touch-action: none;
}

.slot.empty {
  justify-content: center;
  flex-direction: column;
  gap: 0;
  border-style: dashed;
  background: rgba(255, 241, 190, 0.35);
  color: #a77840;
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

.empty-mark {
  font-size: 13px;
  font-weight: 900;
  line-height: 1;
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

  .station .slot .avatar.enter-land,
  .rest-row.eat-flash,
  .eat-float {
    animation: none;
  }
}

.avatar {
  position: relative;
  z-index: 1;
  flex: none;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border: 2px solid currentColor;
  border-radius: 7px;
}

.avatar :deep(.class-ico) {
  width: 13px;
  height: 13px;
}

.station .slot.enter-slot {
  overflow: visible;
  z-index: 2;
}

.station .slot .avatar {
  width: 48px;
  height: 48px;
  border-width: 4px;
  border-radius: 10px;
}

.station .slot .avatar.enter-land {
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

.station .slot .avatar :deep(.class-ico) {
  width: 26px;
  height: 26px;
}

.worker-new {
  position: absolute;
  top: -5px;
  right: -7px;
  z-index: 2;
  padding: 0 3px;
  border: 1px solid #7a1808;
  border-radius: 3px;
  background: linear-gradient(#ff6a3d, #d62828);
  color: #fff8e8;
  font-size: 7px;
  font-style: normal;
  font-weight: 900;
  letter-spacing: 0.02em;
  line-height: 1.25;
  box-shadow: 0 1px 0 #7a1808;
  pointer-events: none;
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
  animation: worker-banter 10s ease-out forwards;
}

.station-list:has(> .station:first-child .slot.has-banter) {
  padding-top: 22px;
}

.tutor-tip {
  position: absolute;
  z-index: 2;
  left: 28px;
  bottom: calc(100% - 8px);
  max-width: 168px;
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

.station .slot .tutor-tip {
  left: 56px;
  right: 4px;
  bottom: auto;
  top: 4px;
  max-width: none;
}

.rest-row.has-tutor {
  overflow: visible;
  z-index: 2;
}

.rest-list:has(> .rest-row.has-tutor) {
  padding-top: 36px;
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
  border: 1px solid #d4a84a;
  border-radius: 7px;
  background: rgba(255, 247, 212, 0.45);
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
  z-index: 80;
  pointer-events: none;
  transform: translate(-50%, -120%);
  min-height: 32px;
  padding: 6px 10px;
  border: 2px solid var(--gold-deep);
  border-radius: 10px;
  background: linear-gradient(#fff8dc, #f0c14a);
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
  background: rgba(40, 24, 8, 0.45);
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
  background: linear-gradient(180deg, #fffef8, #fff3d8);
  box-shadow: 0 6px 0 var(--shadow);
}

.sheet header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.sheet .title {
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
  background: linear-gradient(#fffbeb, var(--btn));
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
  background: linear-gradient(#fffbeb, #fff7d8);
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
  background: linear-gradient(#ffe27a, #f0b83a);
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
  2.64%,
  95.16% {
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
</style>
