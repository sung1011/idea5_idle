<script setup lang="ts">
import { computed } from 'vue'
import { assignedCount, currentSpeed, stationResonating } from '../sim/query'
import { selectedCategoryDef } from '../sim/stationProgress'
import { STATION_DEF, stationCategories, xpToNextLevel } from '../sim/tables'
import type { CategoryId, StationId } from '../sim/types'
import { useGameStore } from './gameStore'

const props = defineProps<{
  stationId: StationId
  skeleton?: boolean
}>()

const game = useGameStore()
const def = computed(() => STATION_DEF[props.stationId])
const count = computed(() => assignedCount(game.save, props.stationId))
const station = computed(() => game.save.stations[props.stationId])
const cat = computed(() => selectedCategoryDef(game.save, props.stationId))
const pct = computed(() => Math.min(100, Math.round(station.value.progress * 100)))
const xpNeed = computed(() => xpToNextLevel(station.value.stationLevel))
const xpPct = computed(() => Math.min(100, Math.round((station.value.stationXp / xpNeed.value) * 100)))
const speed = computed(() => currentSpeed(game.save, props.stationId))
const resonating = computed(() => stationResonating(game.save, props.stationId))
const stall = computed(() => station.value.stallReason)
const categories = computed(() => stationCategories(props.stationId))

function unlocked(id: CategoryId): boolean {
  return station.value.unlockedCategories.includes(id)
}

function pick(id: CategoryId) {
  game.selectCategory(props.stationId, id)
}
</script>

<template>
  <article class="card" :class="{ skeleton, stall: !!stall, hot: resonating }">
    <header>
      <h2>{{ def.label }} · Lv{{ station.stationLevel }}</h2>
      <p class="meta">{{ count }} 人 · {{ cat.label }} {{ cat.cycleS }}s/次</p>
    </header>
    <div class="bar" :aria-valuenow="pct">
      <i :style="{ width: pct + '%' }" />
    </div>
    <div class="bar xp" :aria-valuenow="xpPct">
      <i :style="{ width: xpPct + '%' }" />
    </div>
    <p class="stat">
      进度 {{ pct }}% · XP {{ station.stationXp }}/{{ xpNeed }} · 速度 {{ speed.toFixed(2) }}/s
      <span v-if="resonating"> · 共振</span>
      <span v-if="stall === 'emptyInput'"> · 原料见底</span>
      <span v-if="stall === 'fullOutput'"> · 产物堆满</span>
    </p>
    <div v-if="categories.length > 1" class="cats">
      <button
        v-for="c in categories"
        :key="c.id"
        type="button"
        class="cat"
        :class="{ on: station.selectedCategory === c.id }"
        :disabled="!unlocked(c.id)"
        @click="pick(c.id)"
      >
        {{ c.label }}
        <span v-if="!unlocked(c.id)"> Lv{{ c.unlockLevel }}</span>
      </button>
    </div>
    <div class="row">
      <button type="button" @click="game.assignIdle(stationId)">派入</button>
      <button type="button" :disabled="count === 0" @click="game.withdraw(stationId)">撤出</button>
    </div>
  </article>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--seam);
  background: var(--plate);
}

.card.hot {
  border-color: var(--copper);
}

.card.stall {
  border-color: var(--danger);
}

.card.skeleton {
  opacity: 0.78;
}

header {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: baseline;
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

.bar {
  height: 10px;
  background: #120f0c;
  border: 1px solid var(--seam);
}

.bar i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--copper), var(--ember));
}

.bar.xp {
  height: 6px;
}

.bar.xp i {
  background: linear-gradient(90deg, var(--moss), var(--copper));
}

.cats,
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

button {
  padding: 6px 10px;
  border: 1px solid var(--seam);
  background: #18140f;
}

.cat.on {
  border-color: var(--copper);
  color: var(--ember);
}
</style>
