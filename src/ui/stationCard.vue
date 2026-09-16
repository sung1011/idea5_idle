<script setup lang="ts">
import { computed } from 'vue'
import { formatCosts } from '../sim/costs'
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
const costText = computed(() => {
  const main = formatCosts(cat.value.costs)
  if (!cat.value.altCosts?.length) return main
  return `${main}（或 ${formatCosts(cat.value.altCosts)}）`
})
const hasCosts = computed(() => cat.value.costs.length > 0 || (cat.value.altCosts?.length ?? 0) > 0)

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
      <i class="sprite sprite-station" :class="stationId" aria-hidden="true" />
      <div class="titles">
        <h2>
          {{ def.label }} · Lv{{ station.stationLevel }}
          <em v-if="resonating" class="reso">共振</em>
        </h2>
        <p class="meta">{{ count }} 人 · {{ cat.label }} {{ cat.cycleS }}s/次</p>
      </div>
    </header>
    <div class="bar" :aria-valuenow="pct">
      <i :style="{ width: pct + '%' }" />
    </div>
    <div class="bar xp" :aria-valuenow="xpPct">
      <i :style="{ width: xpPct + '%' }" />
    </div>
    <p class="stat">进度 {{ pct }}% · XP {{ station.stationXp }}/{{ xpNeed }} · 速度 {{ speed.toFixed(2) }}/s</p>
    <p v-if="hasCosts" class="stat">消耗 {{ costText }}</p>
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

.cats,
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.cat.on {
  color: var(--ink);
  background: linear-gradient(#ffe27a, #f0b83a);
  box-shadow: 0 3px 0 var(--shadow);
  opacity: 1;
  filter: none;
}
</style>
