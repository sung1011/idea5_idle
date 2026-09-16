<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { bankQty } from '../sim/bank'
import { formatMarchClock } from '../sim/encounters'
import { foodBuffRemainS, isFoodBuffActive } from '../sim/food'
import { idleCount } from '../sim/query'
import { isToolMatched } from '../sim/tools'
import {
  CLASS_LABEL,
  FOOD_ITEM_IDS,
  ITEM_DEF,
  PLAYABLE_STATION_IDS,
  QUALITY_MAX,
  RECRUIT_COST,
  STATION_DEF,
  TOOL_ITEM_IDS,
  TOOL_TYPE_DEF,
  TOOL_TYPE_IDS,
  toolTypeByStation,
  workerQualityDef,
  type FoodItemId,
} from '../sim/tables'
import type { StationId, ToolTypeId, Worker } from '../sim/types'
import { useGameStore } from './gameStore'

const game = useGameStore()
const now = computed(() => {
  void game.save.elapsedS
  return Date.now()
})
const pickItem = reactive<Record<string, (typeof TOOL_ITEM_IDS)[number]>>({})
const pickType = reactive<Record<string, ToolTypeId>>({})
const pickFood = reactive<Record<string, FoodItemId>>({})
const pickFoodQty = reactive<Record<string, number>>({})

function atStation(w: Worker, id: StationId) {
  return w.assignment === id
}

function resting(w: Worker) {
  return w.assignment === null
}

function availableTools() {
  return TOOL_ITEM_IDS.filter((id) => bankQty(game.save, id) > 0)
}

function toolLine(w: Worker) {
  const slot = w.toolSlot
  if (!slot) return '空手'
  const type = TOOL_TYPE_DEF[toolTypeByStation(slot.matchStationId)]
  const item = ITEM_DEF[slot.itemId]
  const match = w.assignment ? isToolMatched(slot, w.assignment) : false
  if (!w.assignment) return `${item.label}（${type.label}）· 休息`
  return match ? `${item.label}（${type.label}）· 匹配${STATION_DEF[slot.matchStationId].label}` : `${item.label}（${type.label}）· 未匹配，裸效率`
}

function queuedType(itemId: (typeof TOOL_ITEM_IDS)[number]): ToolTypeId {
  const queued = game.save.forgedTools.find((row) => row.itemId === itemId)
  return queued ? toolTypeByStation(queued.matchStationId) : 'pick'
}

function onEquip(w: Worker) {
  const itemId = pickItem[w.id] ?? availableTools()[0]
  if (!itemId) return
  const typeId = pickType[w.id] ?? queuedType(itemId)
  game.equipTool(w.id, itemId, TOOL_TYPE_DEF[typeId].matchStationId)
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

function onLoadFood(w: Worker) {
  const itemId = pickFood[w.id] ?? availableFoods()[0]
  if (!itemId) return
  const qty = Math.max(1, Math.min(foodQtyMax(itemId), Math.floor(pickFoodQty[w.id] ?? 1)))
  game.loadFood(w.id, itemId, qty)
}

const fusePick = ref<string[]>([])

function qualityOf(w: Worker) {
  return workerQualityDef(w.qualityTier)
}

function picked(id: string) {
  return fusePick.value.includes(id)
}

function toggleFuse(id: string) {
  const i = fusePick.value.indexOf(id)
  if (i >= 0) {
    fusePick.value = fusePick.value.filter((x) => x !== id)
    return
  }
  if (fusePick.value.length >= 2) fusePick.value = [fusePick.value[1], id]
  else fusePick.value = [...fusePick.value, id]
}

function onFuse() {
  const [a, b] = fusePick.value
  const result = game.fuse(a, b)
  if (result.ok) fusePick.value = []
}
</script>

<template>
  <section class="panel roster">
    <p>工人</p>
    <p class="hint">
      金币 {{ game.save.gold }} · 名册 {{ game.save.workers.length }} · 空闲 {{ idleCount(game.save) }}
    </p>
    <p class="hint">
      同品质两人合成升一档，满档不可再升。新职业从该档池里随机，可能是两人已有的，也可能是池里其它职业。
    </p>
    <div class="row">
      <button type="button" @click="game.recruit()">抽工人（{{ RECRUIT_COST }} 金）</button>
      <button type="button" @click="onFuse">
        合成{{ fusePick.length === 2 ? '（已选 2）' : fusePick.length === 1 ? '（再选 1）' : '' }}
      </button>
    </div>
    <ul v-if="game.save.workers.length">
      <li
        v-for="w in game.save.workers"
        :key="w.id"
        class="card"
        :class="{ picked: picked(w.id), rainbow: qualityOf(w).id === 'rainbow' }"
        :style="{ borderColor: qualityOf(w).color }"
      >
        <p class="name">
          <b
            class="qmark"
            :style="{ color: qualityOf(w).color, borderColor: qualityOf(w).color }"
          >{{ qualityOf(w).label }}</b>
          {{ w.name ?? w.id }} · {{ w.classId ? CLASS_LABEL[w.classId] : '未标' }}
        </p>
        <div class="row">
          <button
            type="button"
            :class="{ on: picked(w.id) }"
            :aria-pressed="picked(w.id)"
            @click="toggleFuse(w.id)"
          >
            {{ picked(w.id) ? '取消选入' : w.qualityTier >= QUALITY_MAX ? '满档' : '选入合成' }}
          </button>
        </div>
        <p class="hint">{{ toolLine(w) }}</p>
        <div class="row tool-row">
          <template v-if="w.toolSlot">
            <button type="button" @click="game.unequipTool(w.id)">卸下</button>
          </template>
          <template v-else-if="availableTools().length">
            <select
              class="tool-select"
              :value="pickItem[w.id] ?? availableTools()[0]"
              @change="pickItem[w.id] = ($event.target as HTMLSelectElement).value as (typeof TOOL_ITEM_IDS)[number]"
            >
              <option v-for="id in availableTools()" :key="id" :value="id">
                {{ ITEM_DEF[id].label }} ×{{ bankQty(game.save, id) }}
              </option>
            </select>
            <select
              class="tool-select"
              :value="pickType[w.id] ?? queuedType(pickItem[w.id] ?? availableTools()[0])"
              @change="pickType[w.id] = ($event.target as HTMLSelectElement).value as ToolTypeId"
            >
              <option v-for="id in TOOL_TYPE_IDS" :key="id" :value="id">
                {{ TOOL_TYPE_DEF[id].label }}（{{ STATION_DEF[TOOL_TYPE_DEF[id].matchStationId].label }}）
              </option>
            </select>
            <button type="button" @click="onEquip(w)">装备</button>
          </template>
          <span v-else class="hint">物资里没有工具</span>
        </div>
        <p class="hint">{{ foodLine(w) }}</p>
        <div class="row tool-row">
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
            :disabled="atStation(w, id)"
            :aria-pressed="atStation(w, id)"
            @click="game.assign(w.id, id)"
          >
            {{ STATION_DEF[id].label }}
          </button>
          <button
            type="button"
            :class="{ on: resting(w) }"
            :disabled="resting(w)"
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
  padding: 14px 16px;
}

.panel p,
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

.card.picked {
  box-shadow: 0 3px 0 currentColor, inset 0 0 0 2px #fff8e0;
}

.card.rainbow {
  background: linear-gradient(#fffdf8, #ffe8f4);
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
  background: var(--plate);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-align: center;
}

.hint {
  color: var(--muted);
  font-size: 14px;
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
