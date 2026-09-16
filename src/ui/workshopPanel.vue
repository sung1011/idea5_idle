<script setup lang="ts">
import { computed } from 'vue'
import {
  formatMarchClock,
  isWorkshopBuffActive,
  workshopBuffMul,
  workshopBuffRemainS,
} from '../sim/encounters'
import { leftoverStockRows } from '../sim/query'
import { PLAYABLE_CHAINS, STATION_DEF } from '../sim/tables'
import type { StationId } from '../sim/types'
import { useGameStore } from './gameStore'
import StationCard from './stationCard.vue'

const game = useGameStore()
const now = computed(() => {
  void game.save.elapsedS
  return Date.now()
})
const buffOn = computed(() => isWorkshopBuffActive(game.save, now.value))
const buffLabel = computed(() => {
  if (!buffOn.value) return ''
  const pct = Math.round((workshopBuffMul(game.save, now.value) - 1) * 100)
  return `工匠加持：产量 +${pct}% · 剩余 ${formatMarchClock(workshopBuffRemainS(game.save, now.value))}`
})

function chainTitle(ids: StationId[]): string {
  return ids.map((id) => STATION_DEF[id].label).join(' → ')
}

const leftover = computed(() => leftoverStockRows(game.save))
</script>

<template>
  <div class="wrap">
    <p v-if="buffOn" class="buff">{{ buffLabel }}</p>
    <section v-for="ids in PLAYABLE_CHAINS" :key="chainTitle(ids)" class="chain">
      <p class="chain-title">{{ chainTitle(ids) }}</p>
      <div class="grid">
        <StationCard v-for="id in ids" :key="id" :station-id="id" />
      </div>
    </section>
    <section v-if="leftover.length" class="leftover" aria-label="其它库存">
      <p class="chain-title">其它库存</p>
      <div class="stock-row">
        <span v-for="row in leftover" :key="row.itemId" class="stock-item">{{ row.label }} {{ row.qty }}</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.wrap,
.chain {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chain-title,
.buff {
  margin: 0;
  line-height: 1.5;
  letter-spacing: 0.08em;
}

.chain-title {
  color: var(--copper);
}

.buff {
  padding: 8px 12px;
  border: 2px solid var(--moss-deep);
  border-radius: 10px;
  background: #e7f8d8;
  color: var(--moss-deep);
  font-weight: 700;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}

.leftover,
.stock-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
}

.leftover {
  flex-direction: column;
}

.stock-row {
  margin: 0;
}

.stock-item {
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 2px 8px;
  border: 2px solid var(--seam);
  border-radius: 8px;
  background: var(--slot);
}
</style>
