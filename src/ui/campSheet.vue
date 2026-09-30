<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { bankQty } from '../sim/bank'
import { campDockCount } from '../sim/campDock'
import { guideFuseCue, isGuideQuestFlash } from '../sim/guideQuest'
import { isModuleUnlocked, moduleLockedTip, moduleNoticeOn } from '../sim/moduleUnlock'
import { FOOD_ITEM_IDS, ITEM_DEF, type FoodItemId } from '../sim/tables'
import { recruitCost } from '../sim/tech'
import type { Worker } from '../sim/types'
import { workerWearHp } from '../sim/workshopHp'
import { appTab } from './appNav'
import { CAMP_STATION_DRAG_TIP, campDragStationTip } from './campDragTip'
import { closeCampSheet } from './campDockNav'
import { foodHelpCopy, nextFoodHelp, REST_FOOD_HELP_ROWS, REST_FOOD_HELP_TITLE } from './foodHelp'
import FoodIcon from './foodIcon.vue'
import { pushFloatTip } from './floatTips'
import { useGameStore } from './gameStore'
import { hpBarFill } from './hpBar'
import ModeHelpSheet from './modeHelpSheet.vue'
import { REST_HEAD_BADGE, restQueueRows } from './restQueue'
import { restFoodBand } from './workshopQueueHead'
import { isWorkerEatFlashing, workerEatFlashText } from './workerEatFlash'
import { isWorkerLevelFlashing } from './workerLevelFlash'
import WorkerAvatar from './workerAvatar.vue'
import WorkerDetailSheet from './workerDetailSheet.vue'
import { workerShortName } from './workerGroups'
import { workerQualityNameStyle } from './workerQuality'
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
const foodOpen = ref(false)
const foodHelp = ref<FoodItemId | null>(null)
const foodHelpPos = ref({ left: 8, top: 8 })
const foodRuleOpen = ref(false)
const detailId = ref<string | null>(null)
const rows = computed(() => restQueueRows(game.save))
const dispatchCount = computed(() => campDockCount(game.save))
const fuseCue = computed(() => guideFuseCue(game.save, true))
const guideFlashRecruit = computed(() => isGuideQuestFlash(game.save, 'recruit'))
const guideFlashRestFood = computed(() => isGuideQuestFlash(game.save, 'restFood'))
const foodLocked = computed(() => !isModuleUnlocked(game.save, 'restFood'))
const recruitPrice = computed(() => recruitCost(game.save))
const canRecruit = computed(() => game.save.diamonds >= recruitPrice.value)
const foodBand = computed(() => {
  const id = game.save.restFoodId
  return restFoodBand(id, id ? bankQty(game.save, id) : 0)
})
const foodLabel = computed(() => {
  const id = game.save.restFoodId
  if (!id) return '未选'
  return ITEM_DEF[id].label
})
const foodHelpBubble = computed(() => {
  const id = foodHelp.value
  if (!id) return null
  return foodHelpCopy(id, bankQty(game.save, id))
})

function hpFillStyle(worker: Worker) {
  return { width: `${(hpBarFill(workerWearHp(worker), worker.hpMax) * 100).toFixed(2)}%` }
}

const foodNotice = computed(() => !foodLocked.value && moduleNoticeOn(game.save, 'restFood'))

function onFood() {
  if (foodLocked.value) {
    pushFloatTip(moduleLockedTip('restFood'), 'err')
    return
  }
  game.markModuleSeen('restFood')
  foodOpen.value = true
}

function closeFoodHelp() {
  foodHelp.value = null
}

function closeFood() {
  foodOpen.value = false
  foodRuleOpen.value = false
  closeFoodHelp()
}

function onFoodHelp(ev: MouseEvent, id: FoodItemId) {
  ev.stopPropagation()
  const next = nextFoodHelp(foodHelp.value, id)
  foodHelp.value = next
  if (!next) return
  const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect()
  foodHelpPos.value = {
    left: Math.min(window.innerWidth - 228, Math.max(8, rect.left)),
    top: Math.min(window.innerHeight - 120, rect.bottom + 6),
  }
}

function onPickFood(itemId: FoodItemId | null) {
  closeFoodHelp()
  game.selectRestFood(itemId)
  closeFood()
}

function openDetail(worker: Worker) {
  game.clearWorkerNew(worker.id)
  detailId.value = worker.id
}

type DragSession = {
  workerId: string
  name: string
  source: WorkerDragSource
  startX: number
  startY: number
  x: number
  y: number
  active: boolean
  pointerId: number
  over: WorkerDropTarget | null
  tipped: boolean
}

const drag = ref<DragSession | null>(null)
const restListEl = ref<HTMLElement | null>(null)
let edgeScrollFrame = 0

function stopEdgeScroll() {
  if (!edgeScrollFrame) return
  cancelAnimationFrame(edgeScrollFrame)
  edgeScrollFrame = 0
}

function hitTarget(x: number, y: number): WorkerDropTarget | null {
  const el = document.elementFromPoint(x, y)
  const node = el instanceof Element ? el.closest('[data-drop]') : null
  return node instanceof HTMLElement ? dropTargetFromDataset(node.dataset) : null
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

function unbindDrag() {
  stopEdgeScroll()
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
}

function onWorkerPointerDown(ev: PointerEvent, worker: Worker) {
  if (ev.pointerType === 'mouse' && ev.button !== 0) return
  if (worker.assignment !== null) return
  unbindDrag()
  const source: WorkerDragSource = { kind: 'rest', workerId: worker.id }
  drag.value = {
    workerId: worker.id,
    name: workerShortName(worker),
    source,
    startX: ev.clientX,
    startY: ev.clientY,
    x: ev.clientX,
    y: ev.clientY,
    active: false,
    pointerId: ev.pointerId,
    over: null,
    tipped: false,
  }
  ev.preventDefault()
  const handle = ev.currentTarget
  if (handle instanceof Element) {
    try {
      handle.setPointerCapture(ev.pointerId)
    } catch {
      // already released
    }
  }
  window.addEventListener('pointermove', onDragMove, { passive: false })
  window.addEventListener('pointerup', onDragEnd)
  window.addEventListener('pointercancel', onDragEnd)
}

function onDragMove(ev: PointerEvent) {
  const session = drag.value
  if (!session || session.pointerId !== ev.pointerId) return
  ev.preventDefault()
  session.x = ev.clientX
  session.y = ev.clientY
  if (!session.active) {
    if (!canDragWorker(game.save, session.workerId)) return
    const dx = session.x - session.startX
    const dy = session.y - session.startY
    if (!shouldStartWorkerDrag(session.source, dx, dy)) return
    session.active = true
    setWorkerDragActive(true)
    startEdgeScroll()
    game.clearWorkerNew(session.workerId)
  }
  session.over = hitTarget(ev.clientX, ev.clientY)
  if (!session.tipped && campDragStationTip(appTab.value === 'workshop', session.over)) {
    session.tipped = true
    pushFloatTip(CAMP_STATION_DRAG_TIP, 'err')
  }
}

function onDragEnd(ev: PointerEvent) {
  const session = drag.value
  if (!session || session.pointerId !== ev.pointerId) return
  unbindDrag()
  const source = session.source
  const over = session.over ?? hitTarget(ev.clientX, ev.clientY)
  const wasActive = session.active
  drag.value = null
  setWorkerDragActive(false)
  if (!wasActive) return
  if (over && !sameDragEndpoint(source, over)) {
    if (over.kind === 'slot' && appTab.value !== 'workshop') {
      if (!session.tipped) pushFloatTip(CAMP_STATION_DRAG_TIP, 'err')
      return
    }
    game.dragAssign(source, over)
    return
  }
  if (!session.tipped && campDragStationTip(appTab.value === 'workshop', over)) {
    pushFloatTip(CAMP_STATION_DRAG_TIP, 'err')
  }
}

function restWorkerDropClass(workerId: string): string {
  const session = drag.value
  if (!session?.active) return ''
  const target: WorkerDropTarget = { kind: 'restWorker', workerId }
  if (canDropWorker(game.save, session.source, target)) return 'drop-ok'
  if (dropTargetEquals(session.over, target)) return 'drop-no'
  return ''
}

onUnmounted(() => {
  unbindDrag()
  setWorkerDragActive(false)
})
</script>

<template>
  <Teleport to="body">
    <div class="camp-mask" :class="{ passing: drag?.active }" @click.self="closeCampSheet">
      <section class="camp-sheet" :class="{ 'guide-flash': fuseCue === 'drag' }" role="dialog" aria-modal="true" aria-label="营地" data-drop="rest">
        <button type="button" class="close" aria-label="关闭" @click="closeCampSheet">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />
          </svg>
        </button>
        <header class="head">
          <h2>营地 · 可派 {{ dispatchCount }}</h2>
          <p class="fuse-hint">在营地里拖到同品质的人身上</p>
        </header>
        <div class="board">
          <div v-if="rows.length" ref="restListEl" class="list">
            <div
              v-for="row in rows"
              :key="row.id"
              class="row"
              :class="[
                restWorkerDropClass(row.id),
                {
                  dim: row.dim,
                  'queue-dim': row.dim,
                  blocked: row.badge === '堵队',
                  head: row.badge === '队首',
                  'queue-ready': row.badge === REST_HEAD_BADGE,
                  'level-flash': isWorkerLevelFlashing(row.id),
                  'eat-flash': isWorkerEatFlashing(row.id),
                },
              ]"
              data-drop="rest-worker"
              :data-worker="row.id"
              @pointerdown="onWorkerPointerDown($event, row.worker)"
            >
              <i v-if="row.badge" class="badge">{{ row.badge }}</i>
              <button
                type="button"
                class="info"
                :aria-label="`${workerShortName(row.worker)} 详情`"
                @pointerdown.stop
                @click.stop="openDetail(row.worker)"
              >i</button>
              <span class="face">
                <WorkerAvatar
                  ring="camp"
                  size="lg"
                  :show-new="!!row.worker.isNew"
                  :race="row.worker.race"
                  :quality="row.worker.qualityTier"
                  :worker-id="row.worker.id"
                />
                <i v-if="row.orderMark" class="order" :class="{ muted: row.orderMuted }">{{ row.orderMark }}</i>
              </span>
              <em v-if="workerEatFlashText(row.id)" class="eat-float">{{ workerEatFlashText(row.id) }}</em>
              <b class="name" :style="workerQualityNameStyle(row.worker)">{{ workerShortName(row.worker) }}</b>
              <span class="hp-track" aria-hidden="true">
                <i class="hp" :style="hpFillStyle(row.worker)" />
              </span>
            </div>
          </div>
          <p v-else class="empty">无人</p>
        </div>
        <div class="actions">
          <button
            type="button"
            class="food"
            :class="{ locked: foodLocked, low: foodBand.low, fresh: foodNotice, 'guide-flash': guideFlashRestFood }"
            :aria-label="foodLocked ? '营地伙食未开放' : `营地伙食 · ${foodLabel}`"
            @click="onFood"
          >
            <FoodIcon v-if="foodBand.itemId" :name="foodBand.itemId" />
            <svg v-else class="bowl" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 10h16c0 5-3.2 8-8 8s-8-3-8-8z" fill="none" stroke="currentColor" stroke-width="2" />
              <path d="M8 10c.4-2 1.6-3 2.4-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
            </svg>
            伙食 · {{ foodLabel }}
          </button>
          <button
            type="button"
            class="recruit"
            :class="{ off: !canRecruit, 'guide-flash': guideFlashRecruit || fuseCue === 'recruit' || fuseCue === 'wait' }"
            :disabled="!canRecruit"
            :aria-label="`抽苦工 · ${recruitPrice} 钻`"
            @click="game.recruit()"
          >
            <span class="recruit-label">
              <svg class="dice" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2" />
                <circle cx="9" cy="9" r="1.3" fill="currentColor" />
                <circle cx="15" cy="15" r="1.3" fill="currentColor" />
                <circle cx="15" cy="9" r="1.3" fill="currentColor" />
                <circle cx="9" cy="15" r="1.3" fill="currentColor" />
              </svg>
              抽苦工
            </span>
            <span class="price">
              <i class="sprite sprite-res diamonds" aria-hidden="true" />
              {{ recruitPrice }}
            </span>
          </button>
        </div>
      </section>
    </div>
  </Teleport>

  <Teleport to="body">
    <div v-if="drag?.active" class="drag-ghost" :style="{ left: `${drag.x}px`, top: `${drag.y}px` }">
      {{ drag.name }}
    </div>
  </Teleport>

  <WorkerDetailSheet v-if="detailId" :worker-id="detailId" @close="detailId = null" />

  <Teleport to="body">
    <div v-if="foodOpen" class="food-mask" role="dialog" aria-modal="true" aria-label="选择伙食" @click.self="closeFood">
      <div class="food-sheet">
        <header>
          <h2>选择伙食</h2>
          <span class="sheet-head-actions">
            <button type="button" class="food-rule" aria-label="伙食说明" @click="closeFoodHelp(); foodRuleOpen = true">？</button>
            <button type="button" class="close" @click="closeFood">关闭</button>
          </span>
        </header>
        <div class="food-picks">
          <div v-for="id in FOOD_ITEM_IDS" :key="id" class="pick-cell">
            <div class="potion-pick-row">
              <button
                type="button"
                class="potion-pick-main"
                :class="{ on: game.save.restFoodId === id }"
                :aria-pressed="game.save.restFoodId === id"
                :disabled="bankQty(game.save, id) <= 0"
                @click="onPickFood(id)"
              >
                {{ ITEM_DEF[id].label }} ×{{ bankQty(game.save, id) }}
              </button>
              <button
                type="button"
                class="potion-help pick"
                data-food-help
                :aria-pressed="foodHelp === id"
                :aria-label="`查看 ${ITEM_DEF[id].label} 效果`"
                @click.stop="onFoodHelp($event, id)"
              >i</button>
            </div>
          </div>
          <div class="pick-cell">
            <button type="button" :class="{ on: !game.save.restFoodId }" :aria-pressed="!game.save.restFoodId" @click="onPickFood(null)">
              不选
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <ModeHelpSheet v-if="foodRuleOpen" :title="REST_FOOD_HELP_TITLE" :rows="REST_FOOD_HELP_ROWS" @close="foodRuleOpen = false" />
  </Teleport>

  <Teleport to="body">
    <div
      v-if="foodHelpBubble"
      class="food-bubble"
      data-food-bubble
      role="dialog"
      :aria-label="foodHelpBubble.title"
      :style="{ left: `${foodHelpPos.left}px`, top: `${foodHelpPos.top}px` }"
    >
      <b>{{ foodHelpBubble.title }}</b>
      <p>{{ foodHelpBubble.effect }}</p>
      <small>库存 ×{{ foodHelpBubble.stock }}</small>
    </div>
  </Teleport>
</template>

<style scoped>
.camp-mask {
  position: fixed;
  inset: 0;
  z-index: var(--z-sheet);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 12px 12px calc(72px + env(safe-area-inset-bottom, 0px));
  background: rgba(8, 28, 14, 0.45);
}

.camp-mask.passing {
  pointer-events: none;
}

.camp-mask.passing .camp-sheet {
  pointer-events: auto;
}

.camp-sheet {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(440px, 100%);
  max-height: min(78vh, 680px);
  overflow: hidden;
  padding: 14px 12px 12px;
  border: 4px solid #6b3a16;
  border-radius: 18px;
  background:
    var(--wood-grain),
    linear-gradient(180deg, #f0c98a 0%, #d59a48 46%, #b4742c 100%);
  box-shadow:
    inset 0 2px 0 rgba(255, 236, 190, 0.55),
    0 8px 0 rgba(70, 36, 10, 0.28);
  color: var(--ink);
}

.close {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 3;
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  min-width: 32px;
  min-height: 32px;
  padding: 0;
  border-radius: 50%;
  line-height: 1;
  color: #fff8f4;
  border-color: #8d241c;
  background: linear-gradient(#e85a4c, #c43228);
  box-shadow: 0 3px 0 #7a1c16;
}

.close svg {
  display: block;
  width: 16px;
  height: 16px;
  margin: 0 auto;
}

.head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 2px 40px 8px;
}

h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 900;
  letter-spacing: 0.04em;
  color: #3a2208;
  text-shadow: 0 1px 0 rgba(255, 236, 190, 0.65);
}

.fuse-hint {
  margin: 0;
  padding: 2px 12px;
  border-radius: 999px;
  background: linear-gradient(#4ea044, #2f7330);
  color: #f4ffe8;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.4;
  box-shadow: 0 2px 0 #1e4a1c;
}

.board {
  flex: 1 1 auto;
  min-height: 0;
  padding: 8px;
  border-radius: 12px;
  background: rgba(62, 32, 12, 0.28);
  box-shadow: inset 0 2px 6px rgba(40, 18, 6, 0.28);
}

.list {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  align-content: start;
  max-height: min(46vh, 360px);
  overflow: auto;
}

.row {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-height: 112px;
  padding: 18px 4px 8px;
  overflow: hidden;
  border-radius: 10px;
  background: rgba(90, 48, 16, 0.16);
  touch-action: none;
}

.row.dim,
.row.queue-dim {
  opacity: 0.5;
}

.row.queue-ready {
  background: rgba(255, 236, 160, 0.42);
}

.row.drop-ok {
  box-shadow: inset 0 0 0 2px #3f9a3a;
}

.row.drop-no {
  box-shadow: inset 0 0 0 2px #e24a3a;
}

.row.eat-flash {
  overflow: visible;
  z-index: 3;
  animation: eat-glow 0.7s ease-out;
}

.badge {
  position: absolute;
  top: 3px;
  left: 3px;
  z-index: 2;
  padding: 0 4px;
  border-radius: 4px;
  background: #3f9a3a;
  color: #f4ffe8;
  font-style: normal;
  font-size: 10px;
  font-weight: 900;
  line-height: 1.4;
  pointer-events: none;
}

.face {
  position: relative;
  display: inline-flex;
  line-height: 0;
}

.order {
  position: absolute;
  top: -3px;
  left: -3px;
  z-index: 3;
  min-width: 13px;
  height: 13px;
  padding: 0 2px;
  border-radius: 4px;
  background: #24180e;
  color: #fff;
  font-style: normal;
  font-size: 9px;
  font-weight: 900;
  line-height: 13px;
  text-align: center;
  pointer-events: none;
}

.order.muted {
  background: #8a837a;
  color: #d5cfc6;
}

.row.blocked .badge {
  background: #e24a3a;
  color: #fff8f0;
}

.info {
  position: absolute;
  top: 2px;
  right: 2px;
  z-index: 2;
  width: 18px;
  height: 18px;
  min-width: 18px;
  min-height: 18px;
  padding: 0;
  border: 1px solid #6a5030;
  border-radius: 50%;
  background: rgba(70, 48, 24, 0.55);
  color: #fff6e4;
  font-size: 11px;
  font-weight: 900;
  line-height: 16px;
  box-shadow: none;
}

.name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 1.2;
  text-align: center;
}

.hp-track {
  width: 72%;
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(30, 16, 6, 0.45);
  box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.35);
}

.hp {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--bar-fill-green);
}

.row.eat-flash .hp {
  background: linear-gradient(90deg, #e8ff9a, #7adf4a);
}

.actions {
  display: grid;
  grid-template-columns: 1fr 1.15fr;
  gap: 8px;
  margin-top: 10px;
}

.food,
.recruit {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 56px;
  padding: 6px 8px;
  border: 2px solid var(--stroke);
  border-radius: 12px;
  font-weight: 900;
}

.food {
  position: relative;
  background: var(--wood-face);
  color: var(--ink);
  font-size: 14px;
}

.food.fresh::after {
  content: '';
  position: absolute;
  top: 6px;
  right: 8px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--danger);
  box-shadow: 0 0 0 2px var(--wood-face);
}

.food.low {
  color: #b42318;
}

.food :deep(.food-ico),
.bowl {
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
}

.recruit {
  flex-direction: column;
  gap: 0;
  background: var(--accent-face);
  color: #3a2208;
}

.recruit-label,
.price {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  line-height: 1.15;
}

.recruit-label {
  font-size: 16px;
}

.price {
  font-size: 13px;
}

.dice {
  width: 18px;
  height: 18px;
}

.price .sprite-res {
  width: 16px;
  height: 16px;
}

.food.locked,
.recruit.off,
.recruit:disabled {
  filter: grayscale(1);
  opacity: 0.55;
}

.empty {
  margin: 28px 0;
  text-align: center;
  color: #f6e2bc;
  font-weight: 800;
}

.eat-float {
  position: absolute;
  left: 36px;
  top: 2px;
  z-index: 4;
  color: #2f7a22;
  font-size: 11px;
  font-style: normal;
  font-weight: 800;
  pointer-events: none;
  animation: eat-float 0.7s ease-out forwards;
}

.drag-ghost {
  position: fixed;
  z-index: calc(var(--z-sheet) + 4);
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

.food-mask {
  position: fixed;
  inset: 0;
  z-index: calc(var(--z-sheet) + 2);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 16px 12px 0;
  background: rgba(8, 28, 14, 0.58);
}

.food-sheet {
  width: min(480px, 100%);
  max-height: min(78vh, 640px);
  overflow: auto;
  padding: 16px 16px calc(16px + var(--dock-height));
  border: 3px solid var(--gold-deep);
  border-radius: 16px 16px 12px 12px;
  background: var(--wood-face);
}

.food-sheet header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.food-sheet h2 {
  font-size: 16px;
  letter-spacing: 0;
  color: var(--ink);
  text-shadow: none;
}

.food-sheet .close {
  position: static;
  flex: 0 0 auto;
  width: auto;
  height: auto;
  min-width: 0;
  min-height: 28px;
  padding: 0 8px;
  border: 2px solid var(--stroke);
  border-radius: 8px;
  background: var(--wood-face);
  color: var(--ink);
  box-shadow: 0 3px 0 var(--stroke);
  font-weight: 800;
  line-height: inherit;
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
  border-radius: 50%;
  border: 2px solid var(--stroke);
  background: var(--wood-face);
  font-weight: 800;
}

.food-picks {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.potion-pick-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.potion-pick-main,
.food-picks > .pick-cell > button {
  flex: 1;
  min-height: 44px;
  padding: 0 10px;
  border: 2px solid var(--stroke);
  border-radius: 10px;
  background: var(--wood-face);
  font-weight: 800;
  text-align: left;
}

.potion-pick-main.on,
.food-picks > .pick-cell > button.on {
  background: var(--accent-face);
}

.potion-help {
  width: 28px;
  min-height: 28px;
  border: 2px solid var(--stroke);
  border-radius: 50%;
  background: var(--wood-lite);
  font-weight: 900;
}

.food-bubble {
  position: fixed;
  z-index: calc(var(--z-sheet) + 4);
  width: 220px;
  padding: 8px 10px;
  border: 2px solid var(--stroke);
  border-radius: 10px;
  background: var(--wood-face);
  box-shadow: 0 4px 0 rgba(90, 48, 16, 0.12);
}

.food-bubble p,
.food-bubble small {
  margin: 4px 0 0;
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
    box-shadow: none;
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
  .row.eat-flash,
  .eat-float {
    animation: none;
  }
}
</style>
