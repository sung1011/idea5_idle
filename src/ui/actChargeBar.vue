<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  fill: number
  stunned?: boolean
  enemy?: boolean
}>()

const width = computed(() => {
  const n = Number.isFinite(props.fill) ? Math.min(1, Math.max(0, props.fill)) : 0
  return `${(n * 100).toFixed(2)}%`
})

const valueNow = computed(() => {
  const n = Number.isFinite(props.fill) ? Math.min(1, Math.max(0, props.fill)) : 0
  return Math.round(n * 100)
})
</script>

<template>
  <div
    class="act"
    :class="{ stunned, enemy }"
    role="progressbar"
    aria-label="出手"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="valueNow"
  >
    <i :style="{ width }" />
  </div>
</template>

<style scoped>
.act {
  height: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: #efe0b0;
  border: 1px solid #a67c2a;
}

.act i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #c4841a, #f3d06a);
}

.act.enemy {
  border-radius: 1px;
  background: #1a0c14;
  border: 1px solid #4a1028;
  box-shadow: inset 0 0 0 1px #6b1d3a;
}

.act.enemy i {
  background: linear-gradient(90deg, #5a1840, #c43b4a);
  clip-path: polygon(0 0, calc(100% - 4px) 0, 100% 50%, calc(100% - 4px) 100%, 0 100%);
}

.act.stunned {
  background: #d9d3c8;
  border-color: #8a8478;
  box-shadow: none;
}

.act.stunned i,
.act.enemy.stunned i {
  background: #9a9084;
  clip-path: none;
}
</style>
