<script setup lang="ts">
import { computed } from 'vue'
import { assignedCount, currentSpeed } from '../sim/query'
import { isGatherFrozen } from '../sim/gather'
import { STATION_HP_EFFICIENCY_RESERVE, stationHpEfficiencyLabel, stationHpWorkMul } from '../sim/workshopHp'
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
  wrap: true,
}))
const pct = computed(() => Math.min(100, Math.max(0, visual.value * 100)))
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
      :aria-valuenow="Math.round(Math.min(100, Math.max(0, pct)))"
      aria-valuemin="0"
      aria-valuemax="100"
    ><b :style="{ width: Math.min(100, Math.max(0, pct)).toFixed(2) + '%' }" /></i>
    <em class="eff">
      <span class="eff-reserve" aria-hidden="true">{{ STATION_HP_EFFICIENCY_RESERVE }}</span>
      <span class="eff-value">{{ eff }}</span>
    </em>
  </span>
</template>

<style scoped>
.mini {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.mini.rail {
  display: contents;
}

.bar {
  flex: 1 1 auto;
  height: 7px;
  border-radius: 99px;
  background: rgba(90, 58, 20, 0.18);
  overflow: hidden;
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

.mini.rail .eff {
  display: inline-grid;
  justify-items: end;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
  white-space: nowrap;
  line-height: 1;
}

.mini.rail .eff-reserve,
.mini.rail .eff-value {
  grid-area: 1 / 1;
}

.mini.rail .eff-reserve {
  visibility: hidden;
}

</style>
