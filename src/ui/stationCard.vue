<script setup lang="ts">
import { computed } from 'vue'
import { formatCosts } from '../sim/costs'
import { gatherStatusText, isGatherFrozen } from '../sim/gather'
import { assignedCount, currentSpeed, stationResonating } from '../sim/query'
import { categoryPickOptions, selectedCategoryDef } from '../sim/stationProgress'
import { STATION_DEF, xpToNextLevel } from '../sim/tables'
import type { CategoryId, StationId } from '../sim/types'
import { useGameStore } from './gameStore'
import { useVisualProgress } from './visualProgress'

const props = defineProps<{
  stationId: StationId
  skeleton?: boolean
}>()

const game = useGameStore()
const def = computed(() => STATION_DEF[props.stationId])
const count = computed(() => assignedCount(game.save, props.stationId))
const station = computed(() => game.save.stations[props.stationId])
const cat = computed(() => selectedCategoryDef(game.save, props.stationId))
const speed = computed(() => currentSpeed(game.save, props.stationId))
const resonating = computed(() => stationResonating(game.save, props.stationId))
const stall = computed(() => station.value.stallReason)
const frozen = computed(() => isGatherFrozen(game.save, props.stationId))
const gatherLine = computed(() => gatherStatusText(game.save, props.stationId))
const pickCaption = computed(() => {
  if (props.stationId === 'fishing') return '渔场'
  if (props.stationId === 'hunting') return '猎物'
  if (props.stationId === 'mining') return '矿脉'
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
const costText = computed(() => {
  const main = formatCosts(cat.value.costs)
  if (!cat.value.altCosts?.length) return main
  return `${main}（或 ${formatCosts(cat.value.altCosts)}）`
})
const hasCosts = computed(() => cat.value.costs.length > 0 || (cat.value.altCosts?.length ?? 0) > 0)

function pick(id: CategoryId) {
  game.selectCategory(props.stationId, id)
}

function onPick(ev: Event) {
  const value = (ev.target as HTMLSelectElement).value as CategoryId
  const opt = pickOptions.value.find((c) => c.id === value)
  if (!opt?.unlocked) return
  pick(value)
}
</script>

<template>
  <article class="card" :class="{ skeleton, stall: !!stall, wait: frozen && !stall, hot: resonating }">
    <header>
      <i class="sprite sprite-station" :class="stationId" aria-hidden="true" />
      <div class="titles">
        <h2>
          {{ def.label }} · Lv{{ station.stationLevel }}
          <em v-if="resonating" class="reso">共振</em>
        </h2>
        <p class="meta">{{ count }} 人 · {{ cat.label }} {{ cat.cycleS }}s/次</p>
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
    <p v-if="hasCosts" class="stat">消耗 {{ costText }}</p>
    <label v-if="pickOptions.length > 1" class="cats">
      <span class="sr">{{ pickCaption }}</span>
      <select class="cat-select" :value="station.selectedCategory" @change="onPick">
        <option v-for="c in pickOptions" :key="c.id" :value="c.id" :disabled="!c.unlocked">
          {{ c.unlocked ? c.label : `${c.label}（Lv${c.unlockLevel}）` }}
        </option>
      </select>
    </label>
    <div class="row">
      <button type="button" @click="game.assignIdle(stationId)">派入</button>
      <button type="button" @click="game.withdraw(stationId)">撤出</button>
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

.card.skeleton {
  opacity: 0.78;
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
</style>
