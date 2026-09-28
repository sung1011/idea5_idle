<script setup lang="ts">
import type { BeastKind } from '../sim/types'

const props = defineProps<{
  kind: BeastKind | 'oil'
}>()

const PATHS: Record<BeastKind | 'oil', readonly string[]> = {
  boar: [
    'M2.2 9.2c.2-2.6 2.4-4.6 5.2-4.6h2.2c1.6 0 2.8.6 3.6 1.6l1.5-.8c.5-.3 1.1 0 1.2.6l.2 1.4c.9.5 1.5 1.4 1.5 2.5 0 1.7-1.4 3-3.2 3H4.8C3.1 13 2 11.8 2 10.2c0-.3 0-.7.2-1Z',
    'M5.2 8.2h.1M8.4 8.2h.1',
  ],
  wolf: [
    'M3.1 6.4 5.2 2.4l1.6 2.2L8 2.6l1.2 2 1.6-2.2 2.1 4c1.5.7 2.4 2 2.4 3.6 0 2.2-1.9 4-4.3 4H5C2.6 14.2.7 12.4.7 10.2c0-1.6.9-2.9 2.4-3.8Z',
    'M5.4 9.2h.1M8.8 9.2h.1',
  ],
  stag: [
    'M5.2 2.2c.2 1.2-.4 2.2-1.4 2.8.8.2 1.5.1 2.2-.4.4 1 .2 2-.6 2.8 1 .1 1.8-.2 2.4-1 .2 1.1-.2 2.1-1.1 2.8 2.4.6 4.1 2.4 4.1 4.6 0 2.2-1.8 3.8-4.2 3.8H6.2C3.8 17.6 2 16 2 13.8c0-1.6.8-2.9 2-3.6C3.2 9.4 3.4 8.2 4 7.2 3.2 6.4 3.4 5 4.2 4c.2-1 .4-1.6 1-1.8Z',
    'M7.2 11.2h.1M10.2 11.2h.1',
  ],
  oil: [
    'M6.2 1.6h3.6v2.2H6.2Z',
    'M5.1 4.2h5.8l.8 1.4v7.2c0 1.3-1.4 2.4-3.7 2.4s-3.7-1.1-3.7-2.4V5.6Z',
  ],
}
</script>

<template>
  <svg class="beast-ico" viewBox="0 0 16 16" aria-hidden="true">
    <path v-for="(d, index) in PATHS[props.kind]" :key="index" :d="d" fill="currentColor" />
  </svg>
</template>

<style scoped>
.beast-ico {
  width: 28px;
  height: 28px;
  display: block;
}
</style>
