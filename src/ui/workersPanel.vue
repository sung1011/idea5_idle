<script setup lang="ts">
import { computed, reactive } from 'vue'
import { bankQty } from '../sim/bank'
import { formatMarchClock } from '../sim/encounters'
import { foodBuffRemainS, isFoodBuffActive } from '../sim/food'
import { isWorkerInCombat, workerLiveStats } from '../sim/combat'
import CombatAttrRow from './combatAttrRow.vue'
import { idleCount } from '../sim/query'
import {
  CLASS_LABEL,
  FOOD_ITEM_IDS,
  ITEM_DEF,
  PLAYABLE_STATION_IDS,
  STATION_DEF,
  STATION_WORKER_CAP,
  workerQualityDef,
  type FoodItemId,
} from '../sim/tables'
import { recruitCost } from '../sim/tech'
import type { StationId, Worker } from '../sim/types'
import { useGameStore } from './gameStore'
import { hpBarFill, hpBarLabel, hpBarTone } from './hpBar'

const game = useGameStore()
const now = computed(() => {
  void game.save.elapsedS
  return Date.now()
})
const pickFood = reactive<Record<string, FoodItemId>>({})
const pickFoodQty = reactive<Record<string, number>>({})

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
  return `ATK ${stats.atk} · SPD ${stats.spd}`
}

function hpPct(w: Worker) {
  return `${(hpBarFill(w.hp, w.hpMax) * 100).toFixed(2)}%`
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

function qualityOf(w: Worker) {
  return workerQualityDef(w.qualityTier)
}

/** 浅档用深字，其余角标白字，避免羊皮纸上白/粉/金看不清。 */
function qualityInk(w: Worker) {
  const id = qualityOf(w).id
  return id === 'white' || id === 'gold' || id === 'cyan' || id === 'pink' ? '#5a3a10' : '#fffdf8'
}

function cardStyle(w: Worker) {
  const color = qualityOf(w).color
  return {
    borderColor: color,
    boxShadow: `inset 6px 0 0 ${color}, 0 3px 0 var(--gold-deep), inset 0 0 0 2px #fff8e0`,
  }
}

function badgeStyle(w: Worker) {
  return {
    color: qualityInk(w),
    background: qualityOf(w).color,
    borderColor: qualityOf(w).color,
  }
}

</script>

<template>
  <section class="panel roster">
    <h2 class="title">工人</h2>
    <p class="hint">
      金币 {{ game.save.gold }} · 名册 {{ game.save.workers.length }} · 空闲 {{ idleCount(game.save) }}
    </p>
    <p class="hint">
      每站最多 {{ STATION_WORKER_CAP }} 人。同站满两人时，到工坊站卡合并升档；满档不可再升。新职业从该档池里随机。
    </p>
    <div class="row">
      <button type="button" @click="game.recruit()">抽工人（{{ recruitCost(game.save) }} 金）</button>
    </div>
    <ul v-if="game.save.workers.length">
      <li
        v-for="w in game.save.workers"
        :key="w.id"
        class="card"
        :class="{ rainbow: qualityOf(w).id === 'rainbow', pink: qualityOf(w).id === 'pink' }"
        :style="cardStyle(w)"
      >
        <p class="name">
          <b class="qmark" :style="badgeStyle(w)">{{ qualityOf(w).label }}</b>
          {{ w.name ?? w.id }} · {{ w.classId ? CLASS_LABEL[w.classId] : '未标' }}
        </p>
        <div class="combat">
          <div
            class="hp"
            :class="hpBarTone(w.hp, w.hpMax)"
            role="progressbar"
            :aria-valuenow="w.hp"
            :aria-valuemin="0"
            :aria-valuemax="w.hpMax"
            :aria-label="`HP ${hpBarLabel(w.hp, w.hpMax)}`"
          >
            <i class="fill" :style="{ width: hpPct(w) }" />
            <span>{{ hpBarLabel(w.hp, w.hpMax) }}</span>
          </div>
          <p class="hint">{{ combatTail(w) }}<template v-if="fighting(w)"> · 战斗中</template></p>
          <p class="attrs">
            <CombatAttrRow :attrs="w.combatAttrs" />
          </p>
        </div>
        <p class="hint">{{ foodLine(w) }}</p>
        <div class="row tool-row">
          <button type="button" :disabled="!canEat(w)" @click="game.eatFood(w.id)">吃 1</button>
          <template v-if="w.foodSlot">
            <button type="button" @click="game.unloadFood(w.id)">卸下食物</button>
          </template>
          <template v-if="availableFoods().length">
            <select
              class="tool-select"
              :value="pickFood[w.id] ?? availableFoods()[0]"
              @change="pickFood[w.id] = ($event.target as HTMLSelectElement).value as FoodItemId"
            >
              <option v-for="id in availableFoods()" :key="id" :value="id">
                {{ ITEM_DEF[id].label }} ×{{ bankQty(game.save, id) }}
              </option>
            </select>
            <input
              class="qty-input"
              type="number"
              min="1"
              :max="foodQtyMax(pickFood[w.id] ?? availableFoods()[0])"
              :value="pickFoodQty[w.id] ?? 1"
              @change="pickFoodQty[w.id] = Math.max(1, Math.floor(Number(($event.target as HTMLInputElement).value) || 1))"
            />
            <button type="button" @click="onLoadFood(w)">
              {{ w.foodSlot ? '换食' : '装入' }}
            </button>
          </template>
          <span v-else-if="!w.foodSlot" class="hint">物资里没有食物</span>
        </div>
        <div class="row">
          <button
            v-for="id in PLAYABLE_STATION_IDS"
            :key="id"
            type="button"
            :class="{ on: atStation(w, id) }"
            :disabled="atStation(w, id) || fighting(w)"
            :aria-pressed="atStation(w, id)"
            @click="game.assign(w.id, id)"
          >
            {{ STATION_DEF[id].label }}
          </button>
          <button
            type="button"
            :class="{ on: resting(w) }"
            :disabled="resting(w) || fighting(w)"
            :aria-pressed="resting(w)"
            @click="game.assign(w.id, null)"
          >
            休息
          </button>
        </div>
      </li>
    </ul>
  </section>
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
.hint,
.name {
  margin: 0;
  line-height: 1.5;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

button {
  min-height: 36px;
}

ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}

.card.rainbow {
  background: linear-gradient(#fffdf8, #ffe8f4);
}

.card.pink {
  background: linear-gradient(#fffdf8, #ffe4ef);
}

.name {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  color: var(--copper);
}

.qmark {
  min-width: 22px;
  padding: 1px 7px;
  border: 2px solid currentColor;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-align: center;
}

.hint {
  color: var(--muted);
  font-size: 14px;
}

.combat {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.attrs {
  flex: 1 1 100%;
  display: flex;
  align-items: center;
  margin: 0;
}

.attrs :deep(.chip) {
  flex: none;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  aspect-ratio: 1;
}

.hp {
  position: relative;
  flex: 1 1 108px;
  min-width: 96px;
  max-width: 168px;
  height: 22px;
  overflow: hidden;
  border: 2px solid var(--gold-deep);
  border-radius: var(--radius-pill);
  background: linear-gradient(180deg, #efe0b0, var(--bar-track));
  box-shadow: inset 0 1px 2px rgba(106, 66, 24, 0.16);
}

.hp .fill {
  display: block;
  height: 100%;
  background: var(--bar-fill-moss);
}

.hp.mid .fill {
  background: var(--bar-fill-gold);
}

.hp.low .fill {
  background: var(--bar-fill-hp);
}

.hp span {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--ink);
  text-shadow: 0 0 3px #fff8ee, 0 1px 0 #fff8ee;
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
