<script setup lang="ts">
import { computed, onUnmounted, reactive, ref } from 'vue'
import { bankQty } from '../sim/bank'
import { formatMarchClock } from '../sim/encounters'
import { foodBuffRemainS, isFoodBuffActive } from '../sim/food'
import { isWorkerInCombat, workerLiveStats } from '../sim/combat'
import { workerXpProgress } from '../sim/workerLevel'
import CombatAttrRow from './combatAttrRow.vue'
import { availablePotionInstallIds } from '../sim/potionSlots'
import { CLASS_LABEL, FOOD_HEAL_RATIO, FOOD_ITEM_IDS, ITEM_DEF, isFoodItemId, isPotionItemId, type FoodItemId } from '../sim/tables'
import type { ItemId } from '../sim/types'
import { isGuideQuestFlash } from '../sim/guideQuest'
import { recruitCost } from '../sim/tech'
import type { ClassId, StationId, Worker } from '../sim/types'
import ClassIcon from './classIcon.vue'
import { openWorkshopStation } from './appNav'
import { useGameStore } from './gameStore'
import HpBar from './hpBar.vue'
import { hpBarFill, hpBarTone } from './hpBar'
import { workerWearHp } from '../sim/workshopHp'
import {
  canGoToAssignedWorkshop,
  mainlineCombatWorkers,
  restingWorkers,
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
const guideFlashRecruit = computed(() => isGuideQuestFlash(game.save, 'recruit'))
const now = computed(() => {
  void game.save.elapsedS
  return Date.now()
})
const pickFood = reactive<Record<string, FoodItemId>>({})
const pickFoodQty = reactive<Record<string, number>>({})
const selectedId = ref<string | null>(null)
const pickId = ref<string | null>(null)

const boards = computed(() => workshopStationBoards(game.save))
const fightingRoster = computed(() => mainlineCombatWorkers(game.save))
const resting = computed(() => restingWorkers(game.save))
const potionSlots = computed(() => game.save.potionSlots)
const potionPick = computed(() => availablePotionInstallIds(game.save))
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
  const healPct = isFoodItemId(slot.itemId) ? Math.round(FOOD_HEAL_RATIO[slot.itemId] * 100) : 0
  const heal = healPct > 0 ? `回血 ${healPct}%` : '随身粮'
  return `${item.label} ×${slot.qty} · ${heal} · 剩余 ${remain}`
}

function canUsePotion(w: Worker) {
  return bankQty(game.save, 'potion') >= 1 && w.hp < w.hpMax
}

function foodQtyMax(id: FoodItemId) {
  return Math.max(1, bankQty(game.save, id))
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

function hpFillStyle(w: Worker) {
  return { width: `${(hpBarFill(workerWearHp(w), w.hpMax) * 100).toFixed(2)}%` }
}

function hpToneClass(w: Worker) {
  return `hp-${hpBarTone(workerWearHp(w), w.hpMax)}`
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

function potionSlotLabel(itemId: ItemId | null) {
  if (!itemId || !isPotionItemId(itemId)) return '空'
  return `${ITEM_DEF[itemId].label} ×${bankQty(game.save, itemId)}`
}

function onPotionSlot(index: number) {
  const filled = potionSlots.value[index]
  if (filled) {
    game.clearPotionSlot(index)
    return
  }
  const next = potionPick.value[0]
  if (!next) return
  game.installPotionSlot(index, next)
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

onUnmounted(unbindDrag)
</script>

<template>
  <section class="panel roster-v2" :class="{ dragging: drag?.active }">
    <div class="board">
      <section class="col workshop" aria-label="在工坊">
        <div class="station-list">
          <article v-for="board in boards" :key="board.stationId" class="station">
            <div class="station-name">
              <UiIcon :name="board.stationId" />
              <b>{{ board.label }}</b>
            </div>
            <div class="slots">
              <button
                v-for="(w, i) in board.slots"
                :key="`${board.stationId}-${i}`"
                type="button"
                class="slot"
                :class="[{ empty: !w }, w ? hpToneClass(w) : '', slotDropClass(board.stationId, i)]"
                :data-drop="'slot'"
                :data-station="board.stationId"
                :data-slot="i"
                :aria-label="w ? `${workerShortName(w)} ${sheetMeta(w)}` : `${board.label}空槽 · 派驻`"
                @pointerdown="w ? onWorkerPointerDown($event, w, board.stationId, i) : undefined"
                @click="w ? undefined : onEmptySlot(board.stationId)"
              >
                <i v-if="w" class="hp-fill" :style="hpFillStyle(w)" aria-hidden="true" />
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
                  </span>
                </template>
                <template v-else>
                  <span class="empty-mark" aria-hidden="true">＋</span>
                  <span class="empty-lab">空</span>
                </template>
              </button>
            </div>
          </article>
          <div class="potion-row" aria-label="药剂技能槽">
            <button
              v-for="(itemId, i) in potionSlots"
              :key="`potion-${i}`"
              type="button"
              class="potion-slot"
              :class="{ empty: !itemId }"
              :aria-label="itemId ? `卸下 ${potionSlotLabel(itemId)}` : `装入药剂槽 ${i + 1}`"
              @click="onPotionSlot(i)"
            >
              <template v-if="itemId">
                <UiIcon name="alchemy" />
                <span class="potion-lab">{{ potionSlotLabel(itemId) }}</span>
              </template>
              <template v-else>
                <span class="empty-mark" aria-hidden="true">＋</span>
                <span class="empty-lab">药剂</span>
              </template>
            </button>
          </div>
        </div>
      </section>
      <div class="col side">
        <section class="zone combat" :class="{ empty: !fightingRoster.length }" aria-label="战斗中">
          <header class="zone-head">战斗中 · {{ fightingRoster.length }}</header>
          <div v-if="fightingRoster.length" class="zone-list">
            <div v-for="w in fightingRoster" :key="w.id" class="rest-row" :class="hpToneClass(w)">
              <i class="hp-fill" :style="hpFillStyle(w)" aria-hidden="true" />
              <button
                type="button"
                class="rest-face"
                :aria-label="`战斗中 ${workerShortName(w)}`"
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
                </span>
              </button>
              <button
                type="button"
                class="rest-go"
                :aria-label="`${workerShortName(w)} 详情`"
                @pointerdown.stop
                @click="openSheet(w)"
              >
                ›
              </button>
            </div>
          </div>
        </section>
        <section class="zone rest" :class="restDropClass()" aria-label="休息" data-drop="rest">
          <header class="zone-head">休息 · {{ resting.length }}</header>
          <div v-if="resting.length" class="zone-list rest-list">
            <div v-for="w in resting" :key="w.id" class="rest-row" :class="hpToneClass(w)">
              <i class="hp-fill" :style="hpFillStyle(w)" aria-hidden="true" />
              <button
                type="button"
                class="rest-face"
                :aria-label="`拖动派驻 ${workerShortName(w)}`"
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
                </span>
              </button>
              <button
                type="button"
                class="rest-go"
                :aria-label="`${workerShortName(w)} 详情`"
                @pointerdown.stop
                @click="openSheet(w)"
              >
                ›
              </button>
            </div>
          </div>
          <p v-else class="empty-rest">没有休息工人。点左侧空槽会派入空闲人；也可先抽人。</p>
        </section>
      </div>
    </div>
    <Teleport to="body">
      <div v-if="drag?.active" class="drag-ghost" :style="{ left: `${drag.x}px`, top: `${drag.y}px` }">
        {{ drag.name }}
      </div>
    </Teleport>
    <button type="button" class="recruit-fab" :class="{ 'guide-flash': guideFlashRecruit }" @click="game.recruit()">
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
          <button type="button" :disabled="!canUsePotion(selected)" @click="game.usePotion(selected.id)">
            用药
          </button>
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
  flex: 0 0 62%;
  border-right: 2px solid rgba(212, 160, 23, 0.55);
}

.side {
  flex: 0 0 38%;
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
  padding: 5px 8px 3px;
  color: #7a4a22;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
  line-height: 1.2;
}

.combat .zone-head {
  color: #8a3228;
}

.zone-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 4px 6px 8px;
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
  padding: 4px 6px 72px;
}

.station {
  display: flex;
  align-items: stretch;
  min-height: var(--workshop-rail-row-min);
  min-width: 0;
  border: 2px solid var(--gold);
  border-radius: 8px;
  background: linear-gradient(145deg, #fff9de, #f3ddaa);
  box-shadow: 0 2px 0 var(--gold-deep);
}

.station-name {
  flex: 0 0 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  min-width: 0;
  padding: 2px 1px;
  background: linear-gradient(180deg, #6a3218, #4a2214);
  color: #fff4d8;
}

.station-name :deep(.ui-ico) {
  width: 13px;
  height: 13px;
  color: #fff4d8;
}

.station-name b {
  font-size: 10px;
  line-height: 1.1;
  letter-spacing: 0.04em;
  writing-mode: vertical-rl;
}

.potion-row {
  display: flex;
  align-items: stretch;
  min-height: var(--workshop-rail-row-min);
  min-width: 0;
  gap: 4px;
}

.potion-slot {
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

.potion-slot.empty {
  border-style: dashed;
  background: rgba(255, 241, 190, 0.35);
  color: #a77840;
  box-shadow: none;
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

.hp-fill {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 0;
  pointer-events: none;
  background: linear-gradient(90deg, rgba(243, 208, 106, 0.34), rgba(232, 195, 90, 0.22));
}

.hp-full .hp-fill {
  background: linear-gradient(90deg, rgba(174, 226, 122, 0.34), rgba(122, 214, 78, 0.22));
}

.hp-low .hp-fill {
  background: linear-gradient(90deg, rgba(240, 160, 140, 0.34), rgba(226, 110, 96, 0.22));
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

.slot-main,
.rest-main {
  position: relative;
  z-index: 1;
  min-width: 0;
  min-height: 0;
  flex: 1;
}

.slot-main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  overflow: hidden;
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
  color: var(--muted);
  font-size: 9px;
  font-weight: 800;
  white-space: nowrap;
}

.rest-top small {
  display: block;
}

.qdot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  border: 1px solid #8a6410;
}

.rest-row {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: flex;
  align-items: center;
  gap: 2px;
  margin-bottom: 5px;
  border: 1px solid #d4a84a;
  border-radius: 9px;
  background: rgba(255, 247, 212, 0.45);
  box-shadow: 0 2px 0 rgba(170, 108, 31, 0.28);
}

.rest-face {
  position: relative;
  z-index: 1;
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
  position: relative;
  z-index: 1;
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
  padding-bottom: 72px;
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
