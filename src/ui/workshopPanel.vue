<script setup lang="ts">
import { computed } from 'vue'
import {
  formatMarchClock,
  isWorkshopBuffActive,
  workshopBuffMul,
  workshopBuffRemainS,
} from '../sim/encounters'
import { PLAYABLE_CHAINS, STATION_DEF } from '../sim/tables'
import type { StationId } from '../sim/types'
import { useGameStore } from './gameStore'
import StationCard from './stationCard.vue'
import SuppliesPanel from './suppliesPanel.vue'

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
</script>

<template>
  <div class="wrap">
    <p v-if="buffOn" class="buff">{{ buffLabel }}</p>
    <SuppliesPanel />
    <section v-for="ids in PLAYABLE_CHAINS" :key="chainTitle(ids)" class="chain">
      <p class="chain-title">{{ chainTitle(ids) }}</p>
      <div class="grid">
        <StationCard v-for="id in ids" :key="id" :station-id="id" />
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
</style>
