<script setup lang="ts">
import { computed, onUnmounted, reactive, ref } from 'vue'
import { bankQty } from '../sim/bank'
import { formatMarchClock } from '../sim/encounters'
import { foodBuffRemainS, isFoodBuffActive } from '../sim/food'
import { isWorkerInCombat, workerLiveStats } from '../sim/combat'
import { workerXpProgress } from '../sim/workerLevel'
import CombatAttrRow from './combatAttrRow.vue'
import { CLASS_LABEL, FOOD_ITEM_IDS, ITEM_DEF, type FoodItemId } from '../sim/tables'
import { recruitCost } from '../sim/tech'
import type { ClassId, StationId, Worker } from '../sim/types'
import ClassIcon from './classIcon.vue'
import { openWorkshopStation } from './appNav'
import { useGameStore } from './gameStore'
import HpBar from './hpBar.vue'
import {
  canGoToAssignedWorkshop,
  unassignedWorkers,
  workerAssignChoices,
  workerDutyLabel,
  workerShortName,
  workshopStationBoards,
} from './workerGroups'
import { formatAtkSpeed } from './formatAtkSpeed'
import UiIcon from './uiIcon.vue'
import UiSelect from './uiSelect.vue'
import type { UiSelectOption } from './uiSelect'
import { qualityOf, workerQualityDotStyle, workerQualityNameStyle, workerQualityTileStyle } from './workerQuality'
import {
  canDragWorker,
  canDropWorker,
  dropTargetEquals,
  dropTargetFromDataset,
  sameDragEndpoint,
  shouldStartWorkerDrag,
  type WorkerDragSource,
  type WorkerDropTarget,
} from './workerDrag'

const game = useGameStore()
const now = computed(() => {
  void game.save.elapsedS
  return Date.now()
})
const pickFood = reactive<Record<string, FoodItemId>>({})
const pickFoodQty = reactive<Record<string, number>>({})
const selectedId = ref<string | null>(null)
const pickId = ref<string | null>(null)

const boards = computed(() => workshopStationBoards(game.save))
const resting = computed(() => unassignedWorkers(game.save))
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

function availableFoods() {
  return FOOD_ITEM_IDS.filter((id) => bankQty(game.save, id) > 0)
}

const foodPickOptions = computed<UiSelectOption[]>(() =>
  availableFoods().map((id) => ({
    value: id,
    label: `${ITEM_DEF[id].label} ×${bankQty(game.save, id)}`,
  })),
)

function onPickFood(value: string) {
  const w = selected.value
  if (!w) return
  pickFood[w.id] = value as FoodItemId
}

function foodLine(w: Worker) {
  const slot = w.foodSlot
  if (!slot) return '未装食物 · 裸生产'
  const item = ITEM_DEF[slot.itemId]
  if (!isFoodBuffActive(slot, now.value)) {
    return `${item.label} ×${slot.qty} · Buff 已到期`
  }
  const remain = formatMarchClock(foodBuffRemainS(slot, now.value))
  if (slot.buff.effectId === 'prodSpeed') {
    const pct = Math.round((slot.buff.mul - 1) * 100)
    return `${item.label} ×${slot.qty} · 加速 +${pct}% · 剩余 ${remain}`
  }
  if (slot.buff.effectId === 'extraOutput') {
    return `${item.label} ×${slot.qty} · 额外产 +${slot.buff.mul} · 剩余 ${remain}`
  }
  return `${item.label} ×${slot.qty} · 剩余 ${remain}`
}

function foodQtyMax(id: FoodItemId) {
  return Math.max(1, bankQty(game.save, id))
}

function canEat(w: Worker) {
  return !!w.foodSlot && w.foodSlot.qty >= 1
}

function onLoadFood(w: Worker) {
  const itemId = pickFood[w.id] ?? availableFoods()[0]
  if (!itemId) return
  const qty = Math.max(1, Math.min(foodQtyMax(itemId), Math.floor(pickFoodQty[w.id] ?? 1)))
  game.loadFood(w.id, itemId, qty)
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

function openSheet(w: Worker) {
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

function onPickStation(stationId: StationId | null) {
  const w = picking.value
  if (!w) return
  const result = game.assign(w.id, stationId)
  if (result.ok) closePick()
}

function onFuseChoice(stationId: StationId | null) {
  const w = picking.value
  if (!w || !stationId) return
  const result = game.fuseWorker(w.id, stationId)
  if (!result.ok) return
  pickId.value = game.save.workers.find((next) => next.assignment === stationId)?.id ?? null
}

function onEmptySlot(stationId: StationId) {
  if (drag.value?.active) return
  game.assignIdle(stationId)
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
  if (!canDragWorker(game.save, w.id)) return null
  if (stationId && slotIndex != null) return { kind: 'slot', workerId: w.id, stationId, slotIndex }
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
    const dx = session.x - session.startX
    const dy = session.y - session.startY
    if (!shouldStartWorkerDrag(session.source, dx, dy)) return
    session.active = true
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
  if (wasActive) {
    if (source && over && !sameDragEndpoint(source, over)) game.dragAssign(source, over)
    return
  }
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

onUnmounted(unbindDrag)
</script>

<template>
  <section class="panel roster-v2" :class="{ dragging: drag?.active }">
    <div class="board">
      <section class="col workshop" aria-label="在工坊">
        <div class="station-list">
          <article v-for="board in boards" :key="board.stationId" class="station">
            <div class="station-title">
              <UiIcon :name="board.stationId" />
              <b>{{ board.label }}</b>
            </div>
            <div class="slots">
              <button
                v-for="(w, i) in board.slots"
                :key="`${board.stationId}-${i}`"
                type="button"
                class="slot"
                :class="[{ empty: !w }, slotDropClass(board.stationId, i)]"
                :data-drop="'slot'"
                :data-station="board.stationId"
                :data-slot="i"
                :aria-label="w ? `${workerShortName(w)} ${sheetMeta(w)}` : `${board.label}空槽 · 派驻`"
                @pointerdown="w ? onWorkerPointerDown($event, w, board.stationId, i) : undefined"
                @click="w ? undefined : onEmptySlot(board.stationId)"
              >
                <template v-if="w">
                  <span class="avatar" :style="workerQualityTileStyle(w)">
                    <ClassIcon :name="classIconOf(w)" />
                  </span>
                  <span class="slot-main">
                    <b>
                      <i class="qdot" :style="workerQualityDotStyle(w.qualityTier)" />
                      <em :style="workerQualityNameStyle(w)">{{ workerShortName(w) }}</em>
                    </b>
                    <small>Lv{{ w.level }}</small>
                    <HpBar compact :hp="w.hp" :hp-max="w.hpMax" />
                  </span>
                </template>
                <template v-else>
                  <span class="empty-mark" aria-hidden="true">＋</span>
                  <span class="empty-lab">空</span>
                </template>
              </button>
            </div>
          </article>
        </div>
      </section>
      <section class="col rest" :class="restDropClass()" aria-label="休息中" data-drop="rest">
        <div v-if="resting.length" class="rest-list">
          <div v-for="w in resting" :key="w.id" class="rest-row">
            <button
              type="button"
              class="rest-face"
              :aria-label="`${workerShortName(w)} ${sheetMeta(w)}`"
              @pointerdown="onWorkerPointerDown($event, w, null, null)"
            >
              <span class="avatar" :style="workerQualityTileStyle(w)">
                <ClassIcon :name="classIconOf(w)" />
              </span>
              <span class="rest-main">
                <span class="rest-top">
                  <b :style="workerQualityNameStyle(w)">{{ workerShortName(w) }}</b>
                  <small>
                    <i class="qdot" :style="workerQualityDotStyle(w.qualityTier)" />
                    Lv{{ w.level }}
                  </small>
                </span>
                <HpBar compact :hp="w.hp" :hp-max="w.hpMax" />
              </span>
            </button>
            <button
              type="button"
              class="rest-go"
              :aria-label="`派驻 ${workerShortName(w)}`"
              @pointerdown.stop
              @click="openPick(w)"
            >
              ›
            </button>
          </div>
        </div>
        <p v-else class="empty-rest">没有休息工人。点左侧空槽会派入空闲人；也可先抽人。</p>
      </section>
    </div>
    <Teleport to="body">
      <div v-if="drag?.active" class="drag-ghost" :style="{ left: `${drag.x}px`, top: `${drag.y}px` }">
        {{ drag.name }}
      </div>
    </Teleport>
    <button type="button" class="recruit-fab" @click="game.recruit()">
      <span class="recruit-plus" aria-hidden="true">＋</span>
      <span class="recruit-copy">
        <b>抽工人</b>
        <small>{{ recruitCost(game.save) }} 金</small>
      </span>
    </button>
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
        <p class="hint">{{ foodLine(selected) }}</p>
        <div class="row tool-row">
          <button type="button" :disabled="!canEat(selected)" @click="game.eatFood(selected.id)">吃 1</button>
          <template v-if="selected.foodSlot">
            <button type="button" @click="game.unloadFood(selected.id)">卸下食物</button>
          </template>
          <template v-if="availableFoods().length">
            <UiSelect
              :model-value="pickFood[selected.id] ?? availableFoods()[0]"
              :options="foodPickOptions"
              aria-label="食物"
              @update:model-value="onPickFood"
            />
            <input
              class="qty-input"
              type="number"
              min="1"
              :max="foodQtyMax(pickFood[selected.id] ?? availableFoods()[0])"
              :value="pickFoodQty[selected.id] ?? 1"
              @change="pickFoodQty[selected.id] = Math.max(1, Math.floor(Number(($event.target as HTMLInputElement).value) || 1))"
            />
            <button type="button" @click="onLoadFood(selected)">
              {{ selected.foodSlot ? '换食' : '装入' }}
            </button>
          </template>
          <span v-else-if="!selected.foodSlot" class="hint">物资里没有食物</span>
        </div>
        <div class="sheet-actions">
          <button type="button" class="go" @click="openSheetThenPick(selected)">派驻</button>
        </div>
      </div>
    </div>
  </Teleport>

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
              :class="{ on: choice.current }"
              :disabled="choice.disabled"
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
            <button
              v-if="choice.canFuse"
              type="button"
              class="fuse-main"
              @click="onFuseChoice(choice.stationId)"
            >
              合成
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
</template>

<style scoped>
.panel {
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
  flex: 0 0 52%;
  border-right: 2px solid rgba(212, 160, 23, 0.55);
}

.rest {
  flex: 1 1 0;
  background: linear-gradient(180deg, rgba(154, 112, 72, 0.06), rgba(255, 247, 216, 0.2));
}

.station-list,
.rest-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 8px 6px;
}

.rest-list,
.empty-rest {
  padding-bottom: 72px;
}

.station {
  margin-bottom: 6px;
  border: 2px solid var(--gold);
  border-radius: 8px;
  background: linear-gradient(145deg, #fff9de, #f3ddaa);
  box-shadow: 0 2px 0 var(--gold-deep);
}

.station-title {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 6px;
  border-bottom: 1px solid rgba(212, 160, 23, 0.4);
}

.station-title :deep(.ui-ico) {
  width: 13px;
  height: 13px;
}

.station-title b {
  font-size: 11px;
}

.slots {
  display: flex;
  gap: 4px;
  padding: 5px;
}

.slot {
  flex: 1;
  min-width: 0;
  min-height: 42px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px;
  border: 1px solid #d4a84a;
  border-radius: 7px;
  background: rgba(255, 247, 212, 0.8);
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
.rest.drop-ok {
  box-shadow: 0 0 0 2px var(--moss);
}

.slot.drop-no,
.rest.drop-no {
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

.avatar {
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

.slot-main,
.rest-main {
  min-width: 0;
  flex: 1;
}

.slot-main b,
.rest-top b {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  line-height: 12px;
}

.slot-main em,
.rest-top b {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-style: normal;
}

.slot-main small,
.rest-top small {
  display: block;
  color: var(--muted);
  font-size: 9px;
  font-weight: 800;
  white-space: nowrap;
}

.qdot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  border: 1px solid #8a6410;
}

.slot :deep(.hp),
.rest-face :deep(.hp) {
  height: 8px;
  margin-top: 3px;
  border-width: 1px;
}

.slot :deep(.hp span),
.rest-face :deep(.hp span) {
  font-size: 7px;
}

.rest-row {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-bottom: 5px;
  border: 1px solid #d4a84a;
  border-radius: 9px;
  background: linear-gradient(140deg, #fff8dc, #efd49b);
  box-shadow: 0 2px 0 rgba(170, 108, 31, 0.28);
}

.rest-face {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 4px;
  border: 0;
  background: transparent;
  box-shadow: none;
  touch-action: pan-y;
}

.rest-top {
  display: flex;
  align-items: center;
  gap: 4px;
}

.rest-go {
  flex: none;
  width: 28px;
  min-height: 36px;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  color: #b77720;
  font-size: 18px;
  font-weight: 900;
}

.empty-rest {
  margin: 10px 8px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.45;
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

.recruit-fab {
  position: absolute;
  right: 10px;
  bottom: 10px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 48px;
  padding: 7px 14px 7px 10px;
  border: 0;
  border-radius: 16px;
  background: linear-gradient(#ffe27a, #e2a31a);
  color: #5a3010;
  box-shadow: 0 4px 0 var(--gold-deep);
}

.recruit-plus {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  font-size: 18px;
  font-weight: 900;
  line-height: 1;
}

.recruit-copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  line-height: 1.1;
}

.recruit-copy b {
  font-size: 13px;
  font-weight: 900;
}

.recruit-copy small {
  font-size: 10px;
  font-weight: 800;
  opacity: 0.78;
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
</style>
