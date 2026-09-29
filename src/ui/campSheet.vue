<script setup lang="ts">
import { computed, ref } from 'vue'
import { bankQty } from '../sim/bank'
import { CAMP_DISPATCH_LABEL, campDispatchEntries, type CampDispatchEntry } from '../sim/campDock'
import { guideFuseCue } from '../sim/guideQuest'
import { isModuleUnlocked, moduleLockedTip } from '../sim/moduleUnlock'
import { FOOD_ITEM_IDS, ITEM_DEF, type FoodItemId } from '../sim/tables'
import type { Worker } from '../sim/types'
import { workerRaceShortLabel } from '../sim/workerRace'
import { workerWearHp } from '../sim/workshopHp'
import { closeCampSheet, requestCampDispatch } from './campDockNav'
import { pushFloatTip } from './floatTips'
import FoodIcon from './foodIcon.vue'
import { useGameStore } from './gameStore'
import { hpBarFill, hpBarTone } from './hpBar'
import { restQueueRows, restZoneTitle } from './restQueue'
import WorkerAvatar from './workerAvatar.vue'
import { workerShortName } from './workerGroups'
import { workerQualityNameStyle } from './workerQuality'

const DRAG_TIP = '回工坊拖动'

const game = useGameStore()
const foodOpen = ref(false)
const rows = computed(() => restQueueRows(game.save))
const entries = computed(() => campDispatchEntries(game.save))
const fuseDrag = computed(() => guideFuseCue(game.save, true) === 'drag')
const foodLocked = computed(() => !isModuleUnlocked(game.save, 'restFood'))
const foodLabel = computed(() => {
  const id = game.save.restFoodId
  if (!id) return '未选'
  return `${ITEM_DEF[id].label} ×${bankQty(game.save, id)}`
})

function hpFillStyle(worker: Worker) {
  return { width: `${(hpBarFill(workerWearHp(worker), worker.hpMax) * 100).toFixed(2)}%` }
}

function hpToneClass(worker: Worker) {
  return `hp-${hpBarTone(workerWearHp(worker), worker.hpMax)}`
}

function onFood() {
  if (foodLocked.value) {
    pushFloatTip(moduleLockedTip('restFood'), 'err')
    return
  }
  foodOpen.value = true
}

function onPickFood(itemId: FoodItemId | null) {
  game.selectRestFood(itemId)
  foodOpen.value = false
}

function onDispatch(entry: CampDispatchEntry) {
  requestCampDispatch(entry)
}

function onRowPointerDown(ev: PointerEvent) {
  if (ev.button !== 0) return
  const startX = ev.clientX
  const startY = ev.clientY
  let tipped = false
  const end = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', end)
  }
  const move = (e: PointerEvent) => {
    if (tipped) return
    if (Math.hypot(e.clientX - startX, e.clientY - startY) < 8) return
    tipped = true
    pushFloatTip(DRAG_TIP, 'err')
    end()
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', end)
}
</script>

<template>
  <Teleport to="body">
    <div class="camp-mask" @click.self="closeCampSheet">
      <section class="camp-sheet" :class="{ 'guide-flash': fuseDrag }" role="dialog" aria-modal="true" aria-label="营地">
        <header>
          <h2>{{ restZoneTitle(rows.length) }}</h2>
          <button type="button" class="close" @click="closeCampSheet">关闭</button>
        </header>
        <div class="jumps">
          <button v-for="entry in entries" :key="entry" type="button" class="jump" @click="onDispatch(entry)">
            {{ CAMP_DISPATCH_LABEL[entry] }}
          </button>
          <button type="button" class="jump food" :class="{ locked: foodLocked }" @click="onFood">
            伙食 · {{ foodLabel }}
          </button>
        </div>
        <div v-if="rows.length" class="list">
          <div
            v-for="row in rows"
            :key="row.id"
            class="row"
            :class="[hpToneClass(row.worker), { dim: row.dim, blocked: row.badge === '堵队', head: row.badge === '队首' }]"
            @pointerdown="onRowPointerDown"
          >
            <i class="hp" :style="hpFillStyle(row.worker)" aria-hidden="true" />
            <span class="order">{{ row.order }}</span>
            <i v-if="row.badge" class="badge">{{ row.badge }}</i>
            <WorkerAvatar
              size="md"
              :show-new="!!row.worker.isNew"
              :race="row.worker.race"
              :quality="row.worker.qualityTier"
              :worker-id="row.worker.id"
            />
            <b class="name" :style="workerQualityNameStyle(row.worker)">{{ workerShortName(row.worker) }}</b>
            <i v-if="workerRaceShortLabel(row.worker.race)" class="race">{{ workerRaceShortLabel(row.worker.race) }}</i>
          </div>
        </div>
        <p v-else class="empty">无人</p>
        <div v-if="foodOpen" class="food-list">
          <button
            v-for="id in FOOD_ITEM_IDS"
            :key="id"
            type="button"
            :class="{ on: game.save.restFoodId === id }"
            @click="onPickFood(id)"
          >
            <FoodIcon :name="id" />
            {{ ITEM_DEF[id].label }} ×{{ bankQty(game.save, id) }}
          </button>
          <button type="button" :class="{ on: !game.save.restFoodId }" @click="onPickFood(null)">不选</button>
        </div>
      </section>
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

.camp-sheet {
  width: min(420px, 100%);
  max-height: min(68vh, 520px);
  overflow: auto;
  padding: 10px 10px 12px;
  border: 3px solid var(--stroke);
  border-radius: 16px 16px 12px 12px;
  background: var(--wood-lite);
  box-shadow: 0 -6px 0 rgba(90, 48, 16, 0.12);
  color: var(--ink);
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

h2 {
  margin: 0;
  font-size: 16px;
}

.close {
  min-height: 28px;
  padding: 0 8px;
  border: 2px solid var(--stroke);
  border-radius: 8px;
  background: var(--wood-face);
  font-weight: 800;
}

.jumps {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0;
}

.jump {
  min-height: 32px;
  padding: 0 10px;
  border: 2px solid var(--stroke);
  border-radius: 10px;
  background: var(--accent-face);
  color: #3a2208;
  font-weight: 800;
}

.jump.food {
  background: var(--wood-face);
  color: var(--ink);
}

.jump.locked {
  filter: grayscale(1);
  opacity: 0.55;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 6px 8px;
  overflow: hidden;
  border-radius: 10px;
  background: rgba(255, 248, 230, 0.45);
}

.row.dim {
  opacity: 0.45;
}

.hp {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: rgba(226, 163, 26, 0.28);
  pointer-events: none;
}

.row.hp-full .hp {
  background: rgba(47, 191, 50, 0.28);
}

.row.hp-low .hp {
  background: rgba(226, 74, 58, 0.28);
}

.order,
.badge {
  position: relative;
  font-style: normal;
  font-weight: 900;
  font-size: 12px;
}

.badge {
  padding: 0 4px;
  border-radius: 4px;
  background: #f0d48a;
  color: #5a3a10;
}

.row.blocked .badge {
  background: #e24a3a;
  color: #fff8f0;
}

.name {
  position: relative;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.race {
  position: relative;
  font-style: normal;
  font-size: 11px;
  color: #7a4a22;
}

.empty {
  margin: 12px 0;
  text-align: center;
  color: var(--muted);
  font-weight: 800;
}

.food-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
}

.food-list button {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 8px;
  border: 2px solid var(--stroke);
  border-radius: 10px;
  background: var(--wood-face);
  font-weight: 800;
  text-align: left;
}

.food-list button.on {
  background: var(--accent-face);
}
</style>
