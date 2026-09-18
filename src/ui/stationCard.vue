<script setup lang="ts">
import { computed, ref } from 'vue'
import { bankQty } from '../sim/bank'
import { stationMergeLabel } from '../sim/fuse'
import { gatherStatusText, isGatherFrozen } from '../sim/gather'
import {
  assignedCount,
  assignedWorkers,
  currentSpeed,
  stationBottleneckText,
  stationConsumeGroups,
  stationStockRows,
  type StationConsumeToken,
} from '../sim/query'
import { categoryPickOptions, selectedCategoryDef } from '../sim/stationProgress'
import { stationConflictHint } from '../sim/tech'
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
import ConsumeJumpItem from './consumeJumpItem.vue'
import { formatConsumeToken } from './encounterDeal'
import { useGameStore } from './gameStore'
import StationTips from './stationTips.vue'
import UiIcon from './uiIcon.vue'
import { useVisualProgress } from './visualProgress'
import {
  qualityOf,
  workerQualityBadgeStyle,
  workerQualityNameStyle,
} from './workerQuality'

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
const consumeGroups = computed(() => stationConsumeGroups(game.save, props.stationId))
const stallLine = computed(() => stationBottleneckText(game.save, props.stationId))
const conflictLine = computed(() => stationConflictHint(game.save, props.stationId))
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

function consumeText(row: StationConsumeToken) {
  return formatConsumeToken({ kind: 'item', itemId: row.itemId, qty: row.need }, row.have)
}
</script>

<template>
  <article class="card" :class="{ wait: frozen && !stall }">
    <StationTips :station-id="stationId" />
    <header>
      <span class="badge">
        <UiIcon :name="stationId" />
      </span>
      <div class="titles">
        <h2>
          {{ def.label }} · Lv{{ station.stationLevel }}
        </h2>
        <p class="meta">{{ cat.label }} {{ cat.cycleS }}s/次</p>
      </div>
    </header>
    <ul class="crew" aria-label="在岗工人">
      <li v-if="crew.length" class="crew-row">
        <span v-for="w in crew" :key="w.id" class="crew-slot">
          <b class="qmark" :style="workerQualityBadgeStyle(w)">{{ qualityOf(w).label }}</b>
          <b class="crew-name" :style="workerQualityNameStyle(w)">{{ w.name ?? w.id }}</b>
          <span class="crew-lv">Lv{{ w.level }}</span>
        </span>
        <button v-if="canMerge" type="button" class="crew-merge" @click="onMerge">{{ mergeLabel }}</button>
      </li>
      <li v-else class="crew-empty">空岗</li>
    </ul>
    <div class="bars">
      <div class="bar live" :aria-valuenow="pctLabel">
        <i :style="{ width: pct.toFixed(2) + '%' }" />
      </div>
      <div class="bar xp" :aria-valuenow="xpPct">
        <i :style="{ width: xpPct + '%' }" />
      </div>
    </div>
    <p class="stat">进度 {{ pctLabel }}% · XP {{ station.stationXp }}/{{ xpNeed }} · 速度 {{ speed.toFixed(2) }}/s</p>
    <div class="sub">
      <p v-if="conflictLine" class="stat conflict">{{ conflictLine }}</p>
      <p v-if="gatherLine" class="stat gather">{{ gatherLine }}</p>
      <p v-if="station.craftNotice" class="stat gather">{{ station.craftNotice }}</p>
      <p v-if="stallLine" class="stat jam">{{ stallLine }}</p>
      <p v-if="consumeGroups.length" class="stat consume">
        <span>消耗 </span>
        <template v-for="(group, gi) in consumeGroups" :key="gi">
          <span v-if="gi" class="sep"> / </span>
          <template v-for="(row, i) in group" :key="row.itemId">
            <span v-if="i" class="sep">、</span>
            <ConsumeJumpItem :item-id="row.itemId" :text="consumeText(row)" :short="row.short" />
          </template>
        </template>
      </p>
      <div v-if="stock.costs.length" class="stock">
        <p class="stock-row">
          <span class="stock-k">消耗库存</span>
          <span
            v-for="row in stock.costs"
            :key="row.itemId"
            class="stock-item"
            :class="{ empty: row.qty === 0 }"
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
    </div>
    <div class="actions">
      <button type="button" @click="game.assignIdle(stationId)">派入</button>
      <button type="button" @click="game.withdraw(stationId)">撤出</button>
    </div>
  </article>
</template>

<style scoped>
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  padding: 12px;
}

.jam {
  color: var(--danger);
}

.consume {
  font-family: var(--font-mono);
}

header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
}

.badge {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border: 3px solid var(--gold);
  border-radius: 50%;
  background: linear-gradient(#fffef8, #ffe9b8);
  box-shadow: 0 2px 0 var(--gold-deep), inset 0 1px 0 #fffef6, inset 0 0 0 2px #fff8e0;
}

.badge :deep(.ui-ico) {
  width: 26px;
  height: 26px;
}

.titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
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
  font-size: 12px;
}

.crew {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 0 0 auto;
}

.crew-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  min-width: 0;
}

.crew-slot {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.qmark {
  flex: 0 0 auto;
  min-width: 22px;
  padding: 1px 7px;
  border: 2px solid currentColor;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-align: center;
}

.crew-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 700;
}

.crew-lv {
  flex: 0 0 auto;
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.crew-merge {
  flex: 0 0 auto;
  margin-left: auto;
  min-height: 32px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

.crew-empty {
  color: var(--muted);
  font-size: 12px;
}

.bars {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 0 0 auto;
}

.bar.live {
  height: 16px;
  border-radius: 999px;
}

.bar.xp {
  height: 10px;
  border-radius: 999px;
}

.sub {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

.gather,
.conflict {
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
  font-size: 11px;
  letter-spacing: 0.06em;
}

.stock-item {
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 2px 8px;
  border: 2px solid var(--seam);
  border-radius: 8px;
  background: var(--slot);
}

.stock-item.empty {
  color: var(--danger);
}

.cats,
.row {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
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
  min-width: 120px;
  padding: 4px 10px;
  border: 3px solid var(--gold-deep);
  border-radius: 12px;
  background: linear-gradient(#fffbeb, var(--btn));
  box-shadow: 0 3px 0 var(--shadow);
}

.tool-row {
  align-items: center;
}

.tool-row button {
  min-height: 36px;
}

.hint {
  color: var(--muted);
  font-size: 12px;
}

.actions {
  display: flex;
  gap: 8px;
  flex: 0 0 auto;
  margin-top: auto;
  padding-top: 4px;
}

.actions button {
  flex: 1 1 0;
  min-height: 48px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.12em;
}
</style>
