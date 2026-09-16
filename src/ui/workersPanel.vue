<script setup lang="ts">
import { reactive } from 'vue'
import { bankQty } from '../sim/bank'
import { idleCount } from '../sim/query'
import { isToolMatched } from '../sim/tools'
import {
  CLASS_LABEL,
  ITEM_DEF,
  PLAYABLE_STATION_IDS,
  RECRUIT_COST,
  STATION_DEF,
  TOOL_ITEM_IDS,
  TOOL_TYPE_DEF,
  TOOL_TYPE_IDS,
  toolTypeByStation,
} from '../sim/tables'
import type { StationId, ToolTypeId, Worker } from '../sim/types'
import { useGameStore } from './gameStore'

const game = useGameStore()
const pickItem = reactive<Record<string, (typeof TOOL_ITEM_IDS)[number]>>({})
const pickType = reactive<Record<string, ToolTypeId>>({})

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
</script>

<template>
  <section class="panel roster">
    <p>工人</p>
    <p class="hint">
      金币 {{ game.save.gold }} · 名册 {{ game.save.workers.length }} · 空闲 {{ idleCount(game.save) }}
    </p>
    <div class="row">
      <button type="button" @click="game.recruit()">抽工人（{{ RECRUIT_COST }} 金）</button>
    </div>
    <ul v-if="game.save.workers.length">
      <li v-for="w in game.save.workers" :key="w.id" class="card">
        <p class="name">{{ w.name ?? w.id }} · {{ w.classId ? CLASS_LABEL[w.classId] : '未标' }}</p>
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

.name {
  font-family: var(--font-mono);
  color: var(--copper);
}

.hint {
  color: var(--muted);
  font-size: 14px;
}

.tool-row {
  align-items: center;
}

.tool-select {
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
</style>
