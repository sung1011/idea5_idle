<script setup lang="ts">
import { computed, ref } from 'vue'
import { bankQty } from '../sim/bank'
import { formatCostOptions } from '../sim/costs'
import { stationMergeLabel } from '../sim/fuse'
import { gatherStatusText, isGatherFrozen } from '../sim/gather'
import {
  assignedCount,
  assignedWorkers,
  consumeRuleSets,
  currentSpeed,
  stationBottleneckText,
  stationStockRows,
} from '../sim/query'
import { categoryPickOptions, selectedCategoryDef } from '../sim/stationProgress'
import {
  ITEM_DEF,
  STATION_DEF,
  STATION_WORKER_CAP,
  TOOL_ITEM_IDS,
  TOOL_TYPE_DEF,
  TOOL_TYPE_IDS,
  toolTypeByStation,
  xpToNextLevel,
  type ToolItemId,
} from '../sim/tables'
import type { CategoryId, StationId, ToolTypeId } from '../sim/types'
import { useGameStore } from './gameStore'
import { useVisualProgress } from './visualProgress'

const props = defineProps<{
  stationId: StationId
}>()

const game = useGameStore()
const def = computed(() => STATION_DEF[props.stationId])
const count = computed(() => assignedCount(game.save, props.stationId))
const crew = computed(() => assignedWorkers(game.save, props.stationId))
const canMerge = computed(() => crew.value.length >= STATION_WORKER_CAP)
const mergeLabel = computed(() => stationMergeLabel(game.save, props.stationId))
const station = computed(() => game.save.stations[props.stationId])
const pickTool = ref<ToolItemId | ''>('')
const availableTools = computed(() => TOOL_ITEM_IDS.filter((id) => bankQty(game.save, id) > 0))
const toolLine = computed(() => {
  const slot = station.value.toolSlot
  if (!slot) return '未装工具 · 裸效率'
  const type = TOOL_TYPE_DEF[toolTypeByStation(slot.matchStationId)]
  return `${ITEM_DEF[slot.itemId].label}（${type.label}）· 本站增效`
})
const cat = computed(() => selectedCategoryDef(game.save, props.stationId))
const speed = computed(() => currentSpeed(game.save, props.stationId))
const stall = computed(() => station.value.stallReason)
const frozen = computed(() => isGatherFrozen(game.save, props.stationId))
const gatherLine = computed(() => gatherStatusText(game.save, props.stationId))
const pickCaption = computed(() => {
  if (props.stationId === 'fishing') return '渔场'
  if (props.stationId === 'hunting') return '猎物'
  if (props.stationId === 'mining') return '矿脉'
  if (props.stationId === 'cooking') return '菜谱'
  return '品类'
})
const visual = useVisualProgress(() => ({
  progress: station.value.progress,
  speed: speed.value,
  stalled: !!stall.value || frozen.value,
  assigned: count.value,
  lastTick: game.save.lastTick,
}))
const pct = computed(() => Math.min(100, visual.value * 100))
const pctLabel = computed(() => Math.round(pct.value))
const xpNeed = computed(() => xpToNextLevel(station.value.stationLevel))
const xpPct = computed(() => Math.min(100, Math.round((station.value.stationXp / xpNeed.value) * 100)))
const pickOptions = computed(() => categoryPickOptions(game.save, props.stationId))
const costText = computed(() => formatCostOptions(consumeRuleSets(game.save, props.stationId)))
const hasCosts = computed(() => costText.value !== '—')
const stallLine = computed(() => stationBottleneckText(game.save, props.stationId))
const stock = computed(() => stationStockRows(game.save, props.stationId))

function pick(id: CategoryId) {
  game.selectCategory(props.stationId, id)
}

function onPick(ev: Event) {
  const value = (ev.target as HTMLSelectElement).value as CategoryId
  const opt = pickOptions.value.find((c) => c.id === value)
  if (!opt?.unlocked) return
  pick(value)
}

function onToolType(ev: Event) {
  const value = (ev.target as HTMLSelectElement).value as ToolTypeId
  game.selectToolType(value)
}

function onEquipTool() {
  const itemId = pickTool.value || availableTools.value[0]
  if (!itemId) return
  game.equipStationTool(props.stationId, itemId)
}

function onUnequipTool() {
  game.unequipStationTool(props.stationId)
}

function onMerge() {
  game.fuseStation(props.stationId)
}
</script>

<template>
  <article class="card" :class="{ stall: !!stall, wait: frozen && !stall }">
    <header>
      <i class="sprite sprite-station" :class="stationId" aria-hidden="true" />
      <div class="titles">
        <h2>
          {{ def.label }} · Lv{{ station.stationLevel }}
        </h2>
        <p class="meta">{{ count }}/{{ STATION_WORKER_CAP }} 人 · {{ cat.label }} {{ cat.cycleS }}s/次</p>
      </div>
    </header>
    <div class="bar live" :aria-valuenow="pctLabel">
      <i :style="{ width: pct.toFixed(2) + '%' }" />
    </div>
    <div class="bar xp" :aria-valuenow="xpPct">
      <i :style="{ width: xpPct + '%' }" />
    </div>
    <p class="stat">进度 {{ pctLabel }}% · XP {{ station.stationXp }}/{{ xpNeed }} · 速度 {{ speed.toFixed(2) }}/s</p>
    <p v-if="gatherLine" class="stat gather">{{ gatherLine }}</p>
    <p v-if="station.craftNotice" class="stat gather">{{ station.craftNotice }}</p>
    <p v-if="stallLine" class="stat jam">{{ stallLine }}</p>
    <p v-if="hasCosts" class="stat">消耗 {{ costText }}</p>
    <div v-if="stock.costs.length || stock.outputs.length" class="stock">
      <p v-if="stock.costs.length" class="stock-row">
        <span class="stock-k">消耗库存</span>
        <span
          v-for="row in stock.costs"
          :key="row.itemId"
          class="stock-item"
          :class="{ now: row.current, empty: row.qty === 0 }"
        >
          {{ row.label }} {{ row.qty }}
        </span>
      </p>
      <p v-if="stock.outputs.length" class="stock-row">
        <span class="stock-k">产出库存</span>
        <span
          v-for="row in stock.outputs"
          :key="row.itemId"
          class="stock-item"
          :class="{ now: row.current, empty: row.qty === 0 }"
        >
          {{ row.label }} {{ row.qty }}
        </span>
      </p>
    </div>
    <label v-if="stationId === 'forging'" class="cats">
      <span class="sr">工具类型</span>
      <select class="cat-select" :value="station.selectedToolType ?? 'pick'" @change="onToolType">
        <option v-for="id in TOOL_TYPE_IDS" :key="id" :value="id">
          {{ TOOL_TYPE_DEF[id].label }}（{{ STATION_DEF[TOOL_TYPE_DEF[id].matchStationId].label }}）
        </option>
      </select>
    </label>
    <label v-if="pickOptions.length > 1" class="cats">
      <span class="sr">{{ pickCaption }}</span>
      <select class="cat-select" :value="station.selectedCategory" @change="onPick">
        <option v-for="c in pickOptions" :key="c.id" :value="c.id" :disabled="!c.unlocked">
          {{ c.unlocked ? c.label : `${c.label}（Lv${c.unlockLevel}）` }}
        </option>
      </select>
    </label>
    <p class="stat">{{ toolLine }}</p>
    <div class="row tool-row">
      <template v-if="station.toolSlot">
        <button type="button" @click="onUnequipTool">卸下工具</button>
      </template>
      <template v-if="availableTools.length">
        <select
          class="cat-select"
          :value="pickTool || availableTools[0]"
          @change="pickTool = ($event.target as HTMLSelectElement).value as ToolItemId"
        >
          <option v-for="id in availableTools" :key="id" :value="id">
            {{ ITEM_DEF[id].label }} ×{{ bankQty(game.save, id) }}
          </option>
        </select>
        <button type="button" @click="onEquipTool">{{ station.toolSlot ? '换装' : '装备' }}</button>
      </template>
      <span v-else-if="!station.toolSlot" class="hint">物资里没有工具</span>
    </div>
    <div class="row">
      <button type="button" @click="game.assignIdle(stationId)">派入</button>
      <button type="button" @click="game.withdraw(stationId)">撤出</button>
      <button v-if="canMerge" type="button" @click="onMerge">{{ mergeLabel }}</button>
    </div>
  </article>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
}

.jam {
  color: var(--danger);
}

header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.titles {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

h2,
.meta,
.stat {
  margin: 0;
}

h2 {
  font-size: 18px;
  letter-spacing: 0.08em;
}

.meta,
.stat {
  color: var(--muted);
  font-size: 13px;
}

.gather {
  color: var(--copper);
}

.card.wait {
  box-shadow: inset 0 0 0 3px #d4a017;
}

.stock,
.stock-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
}

.stock {
  flex-direction: column;
}

.stock-row {
  margin: 0;
}

.stock-k {
  color: var(--muted);
  font-size: 12px;
  letter-spacing: 0.06em;
}

.stock-item {
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 2px 8px;
  border: 2px solid var(--seam);
  border-radius: 8px;
  background: var(--slot);
}

.stock-item.now {
  border-color: var(--gold-deep);
  color: var(--ink);
}

.stock-item.empty {
  color: var(--danger);
}

.cats,
.row {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

.cat-select {
  font: inherit;
  color: var(--ink);
  min-height: 36px;
  min-width: 140px;
  padding: 6px 12px;
  border: 3px solid var(--gold-deep);
  border-radius: 12px;
  background: linear-gradient(#fffbeb, var(--btn));
  box-shadow: 0 3px 0 var(--shadow);
}

.tool-row {
  align-items: center;
}

.hint {
  color: var(--muted);
  font-size: 13px;
}
</style>
