<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { bankQty } from '../sim/bank'
import { formatMarchClock } from '../sim/encounters'
import { foodBuffRemainS, isFoodBuffActive } from '../sim/food'
import { isWorkerInCombat, workerLiveStats } from '../sim/combat'
import { workerXpProgress } from '../sim/workerLevel'
import CombatAttrRow from './combatAttrRow.vue'
import { idleCount } from '../sim/query'
import {
  CLASS_LABEL,
  FOOD_ITEM_IDS,
  ITEM_DEF,
  PLAYABLE_STATION_IDS,
  STATION_DEF,
  STATION_WORKER_CAP,
  type FoodItemId,
} from '../sim/tables'
import { recruitCost } from '../sim/tech'
import type { ClassId, StationId, Worker } from '../sim/types'
import ClassIcon from './classIcon.vue'
import { useGameStore } from './gameStore'
import { hpBarFill } from './hpBar'
import HpBar from './hpBar.vue'
import {
  groupWorkersByQuality,
  loadWorkerGroupOrder,
  rosterDutyCounts,
  saveWorkerGroupOrder,
  toggleWorkerGroupOrder,
  workerDutyKind,
  workerDutyLabel,
  workerShortName,
  type WorkerGroupOrder,
} from './workerGroups'
import { qualityOf, workerQualityDotStyle, workerQualityTileStyle } from './workerQuality'

const game = useGameStore()
const now = computed(() => {
  void game.save.elapsedS
  return Date.now()
})
const pickFood = reactive<Record<string, FoodItemId>>({})
const pickFoodQty = reactive<Record<string, number>>({})
const groupOrder = ref<WorkerGroupOrder>(loadWorkerGroupOrder())
const selectedId = ref<string | null>(null)

const counts = computed(() => rosterDutyCounts(game.save))
const groups = computed(() => groupWorkersByQuality(game.save.workers, groupOrder.value))
const selected = computed(() => {
  const id = selectedId.value
  if (!id) return null
  return game.save.workers.find((w) => w.id === id) ?? null
})
const orderLabel = computed(() => (groupOrder.value === 'highFirst' ? '高→低' : '低→高'))

function atStation(w: Worker, id: StationId) {
  return w.assignment === id
}

function resting(w: Worker) {
  return w.assignment === null && !isWorkerInCombat(game.save, w.id)
}

function fighting(w: Worker) {
  return isWorkerInCombat(game.save, w.id)
}

function combatTail(w: Worker) {
  const stats = workerLiveStats(w)
  const xp = workerXpProgress(w)
  return `Lv${w.level} · ATK ${stats.atk} · SPD ${stats.spd} · XP ${xp.xp}/${xp.need}`
}

function availableFoods() {
  return FOOD_ITEM_IDS.filter((id) => bankQty(game.save, id) > 0)
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

function isBusyTile(w: Worker) {
  return workerDutyKind(game.save, w) !== 'rest'
}

function hurtFill(w: Worker) {
  return `${(hpBarFill(w.hp, w.hpMax) * 100).toFixed(2)}%`
}

function openSheet(w: Worker) {
  selectedId.value = w.id
}

function closeSheet() {
  selectedId.value = null
}

function flipOrder() {
  groupOrder.value = saveWorkerGroupOrder(toggleWorkerGroupOrder(groupOrder.value))
}
</script>

<template>
  <section class="panel roster">
    <h2 class="title">工人</h2>
    <div class="hud">
      <span class="stat">工人 {{ counts.total }}</span>
      <span class="stat">休息 {{ counts.rest }}</span>
      <span class="stat">在岗 {{ counts.busy }}</span>
      <button type="button" class="order" :aria-pressed="groupOrder === 'highFirst'" @click="flipOrder">
        {{ orderLabel }}
      </button>
    </div>
    <p class="hint">
      金币 {{ game.save.gold }} · 空闲 {{ idleCount(game.save) }} · 每站最多 {{ STATION_WORKER_CAP }} 人。同站满两人时，到工坊站卡合并升档。
    </p>
    <div class="row">
      <button type="button" @click="game.recruit()">抽工人（{{ recruitCost(game.save) }} 金）</button>
    </div>
    <div v-if="groups.length" class="groups">
      <section v-for="g in groups" :key="g.tier" class="group">
        <h3 class="group-h">
          <i class="dot" :style="workerQualityDotStyle(g.tier)" />
          {{ g.label }}
          <span class="count">· {{ g.workers.length }}</span>
        </h3>
        <div class="grid">
          <button
            v-for="w in g.workers"
            :key="w.id"
            type="button"
            class="ico"
            :class="{ busy: isBusyTile(w), hurt: w.hp < w.hpMax }"
            :style="workerQualityTileStyle(w)"
            :aria-label="`${workerShortName(w)} ${sheetMeta(w)}`"
            @click="openSheet(w)"
          >
            <ClassIcon :name="classIconOf(w)" />
            <span class="nm">{{ workerShortName(w) }}</span>
            <span class="lv">Lv{{ w.level }}</span>
            <i v-if="w.hp < w.hpMax" class="hurt-track" aria-hidden="true">
              <i class="hurt-fill" :style="{ width: hurtFill(w) }" />
            </i>
          </button>
        </div>
      </section>
    </div>
    <p v-else class="hint">还没有工人。先抽人，再点开小图标派驻。</p>
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
            <select
              class="tool-select"
              :value="pickFood[selected.id] ?? availableFoods()[0]"
              @change="pickFood[selected.id] = ($event.target as HTMLSelectElement).value as FoodItemId"
            >
              <option v-for="id in availableFoods()" :key="id" :value="id">
                {{ ITEM_DEF[id].label }} ×{{ bankQty(game.save, id) }}
              </option>
            </select>
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
        <div class="row">
          <button
            v-for="id in PLAYABLE_STATION_IDS"
            :key="id"
            type="button"
            :class="{ on: atStation(selected, id) }"
            :disabled="atStation(selected, id) || fighting(selected)"
            :aria-pressed="atStation(selected, id)"
            @click="game.assign(selected.id, id)"
          >
            {{ STATION_DEF[id].label }}
          </button>
          <button
            type="button"
            :class="{ on: resting(selected) }"
            :disabled="resting(selected) || fighting(selected)"
            :aria-pressed="resting(selected)"
            @click="game.assign(selected.id, null)"
          >
            休息
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 12px 10px;
}

.title {
  margin: 0;
  font-size: 20px;
}

.panel p,
.panel .title,
.hint {
  margin: 0;
  line-height: 1.5;
}

.hud {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.stat,
.order {
  font-size: 12px;
  font-weight: 800;
  min-height: 32px;
  padding: 4px 10px;
  border: 3px solid var(--gold);
  border-radius: 999px;
  background: linear-gradient(#fffef8, #fff3d4);
  box-shadow: 0 2px 0 var(--gold-deep);
}

.order {
  margin-left: auto;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

button {
  min-height: 36px;
}

.hint {
  color: var(--muted);
  font-size: 14px;
}

.groups {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.group-h {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 13px;
  font-weight: 800;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid #8a6410;
}

.count {
  color: var(--muted);
  font-weight: 700;
  font-size: 12px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.ico {
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 4px;
  min-height: 0;
  border-width: 3px;
  border-radius: 14px;
  box-shadow: 0 2px 0 var(--gold-deep);
  position: relative;
}

.ico.busy {
  outline: 2px dashed #c07020;
  outline-offset: -1px;
}

.nm {
  max-width: 100%;
  font-size: 10px;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lv {
  position: absolute;
  right: 3px;
  bottom: 2px;
  font-size: 9px;
  font-weight: 900;
  padding: 0 3px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.85);
}

.hurt-track {
  position: absolute;
  left: 4px;
  right: 4px;
  bottom: 14px;
  height: 3px;
  overflow: hidden;
  border-radius: 2px;
  background: #e8c8a0;
}

.hurt-fill {
  display: block;
  height: 100%;
  background: #c0392b;
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

.tool-select,
.qty-input {
  font: inherit;
  color: var(--ink);
  min-height: 36px;
  min-width: 120px;
  padding: 6px 10px;
  border: 3px solid var(--gold-deep);
  border-radius: 12px;
  background: linear-gradient(#fffbeb, var(--btn));
  box-shadow: 0 3px 0 var(--shadow);
}

.qty-input {
  min-width: 64px;
  width: 72px;
}
</style>
