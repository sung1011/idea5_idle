<script setup lang="ts">
import { computed } from 'vue'
import { assignedCount, currentSpeed } from '../sim/query'
import { isGatherFrozen } from '../sim/gather'
import { stationHpEfficiencyLabel, stationHpWorkMul } from '../sim/workshopHp'
import type { StationId } from '../sim/types'
import { useGameStore } from './gameStore'
import { useVisualProgress } from './visualProgress'
import { stationProgressStyle } from './workshopTabs'

const props = defineProps<{
  stationId: StationId
}>()

const game = useGameStore()
const station = computed(() => game.save.stations[props.stationId])
const speed = computed(() => currentSpeed(game.save, props.stationId))
const frozen = computed(() => isGatherFrozen(game.save, props.stationId))
const visual = useVisualProgress(() => ({
  progress: station.value.progress,
  speed: speed.value,
  stalled: !!station.value.stallReason || frozen.value,
  assigned: assignedCount(game.save, props.stationId),
  lastTick: game.save.lastTick,
}))
const pct = computed(() => Math.min(100, visual.value * 100))
const eff = computed(() => stationHpEfficiencyLabel(stationHpWorkMul(game.save, props.stationId)))
const tone = computed(() => stationProgressStyle(props.stationId))
</script>

<template>
  <span class="mini">
    <i class="bar" :style="tone" aria-hidden="true"><b :style="{ width: pct.toFixed(2) + '%' }" /></i>
    <em>{{ eff }}</em>
  </span>
</template>

<style scoped>
.mini {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.bar {
  flex: 1 1 auto;
  height: 4px;
  border-radius: 99px;
  background: rgba(90, 58, 20, 0.16);
  overflow: hidden;
}

.bar b {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--workshop-progress-from, #d7a441), var(--workshop-progress-to, #f0c14a));
}

em {
  flex: 0 0 auto;
  font-style: normal;
  font-size: 9px;
  font-weight: 800;
  color: var(--ink-soft, #6b4e2e);
}
</style>
