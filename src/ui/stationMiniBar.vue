<script setup lang="ts">
import { computed } from 'vue'
import { assignedCount, currentSpeed } from '../sim/query'
import { isGatherFrozen } from '../sim/gather'
import { stationHpEfficiencyLabel, stationHpWorkMul } from '../sim/workshopHp'
import type { StationId } from '../sim/types'
import { useGameStore } from './gameStore'
import { useVisualProgress } from './visualProgress'
import { stationProgressStyle } from './workshopTabs'

const props = withDefaults(
  defineProps<{
    stationId: StationId
    layout?: 'rail' | 'sheet'
  }>(),
  { layout: 'rail' },
)

const game = useGameStore()
const station = computed(() => game.save.stations[props.stationId])
const speed = computed(() => currentSpeed(game.save, props.stationId))
const frozen = computed(() => isGatherFrozen(game.save, props.stationId))
const assigned = computed(() => assignedCount(game.save, props.stationId))
const stalled = computed(() => !!station.value.stallReason || frozen.value)
const visual = useVisualProgress(() => ({
  progress: station.value.progress,
  speed: speed.value,
  stalled: stalled.value,
  assigned: assigned.value,
  lastTick: game.save.lastTick,
}))
const pct = computed(() => Math.min(100, visual.value * 100))
const eff = computed(() => stationHpEfficiencyLabel(stationHpWorkMul(game.save, props.stationId)))
const tone = computed(() => stationProgressStyle(props.stationId))
const halted = computed(() => stalled.value || assigned.value <= 0)
</script>

<template>
  <span class="mini" :class="layout">
    <i
      class="bar"
      :class="{ halt: halted }"
      :style="halted ? undefined : tone"
      role="progressbar"
      aria-label="制造进度"
      :aria-valuenow="Math.round(pct)"
      aria-valuemin="0"
      aria-valuemax="100"
    ><b :style="{ width: pct.toFixed(2) + '%' }" /></i>
    <em v-if="layout === 'sheet'">{{ Math.round(pct) }}%</em>
    <em v-if="assigned > 0">{{ eff }}</em>
    <em v-else-if="layout === 'sheet'">空岗</em>
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
  height: 7px;
  border-radius: 99px;
  background: rgba(90, 58, 20, 0.18);
  overflow: hidden;
}

.sheet .bar {
  height: 10px;
}

.bar b {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--workshop-progress-from, #d7a441), var(--workshop-progress-to, #f0c14a));
}

.bar.halt b {
  background: linear-gradient(90deg, #d4cdc0, #9a8f7c);
}

em {
  flex: 0 0 auto;
  font-style: normal;
  font-size: 9px;
  font-weight: 800;
  color: var(--ink-soft, #6b4e2e);
}

.sheet em {
  font-size: 12px;
}
</style>
