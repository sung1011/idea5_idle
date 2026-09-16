<script setup lang="ts">
import { PLAYABLE_CHAINS, SKELETON_STATION_IDS, STATION_DEF } from '../sim/tables'
import type { StationId } from '../sim/types'
import StationCard from './stationCard.vue'

function chainTitle(ids: StationId[]): string {
  return ids.map((id) => STATION_DEF[id].label).join(' → ')
}
</script>

<template>
  <div class="wrap">
    <section v-for="ids in PLAYABLE_CHAINS" :key="chainTitle(ids)" class="chain">
      <p class="chain-title">{{ chainTitle(ids) }}</p>
      <div class="grid">
        <StationCard v-for="id in ids" :key="id" :station-id="id" />
      </div>
    </section>

    <details class="panel more">
      <summary>炼金</summary>
      <div class="grid">
        <StationCard v-for="id in SKELETON_STATION_IDS" :key="id" :station-id="id" skeleton />
      </div>
    </details>
  </div>
</template>

<style scoped>
.wrap,
.chain,
.more {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.more {
  padding: 14px 16px;
}

.chain-title {
  margin: 0;
  line-height: 1.5;
  color: var(--copper);
  letter-spacing: 0.08em;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}

summary {
  cursor: pointer;
  color: var(--copper);
}
</style>
