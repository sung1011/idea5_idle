<script setup lang="ts">
import { classIconPaths } from './classIcons'
import type { ClassId } from '../sim/types'

defineProps<{
  name: ClassId
}>()
</script>

<template>
  <svg class="class-ico" viewBox="0 0 16 16" aria-hidden="true">
    <path v-for="(d, i) in classIconPaths(name)" :key="i" :d="d" />
  </svg>
</template>

<style scoped>
.class-ico {
  display: block;
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  fill: currentColor;
}
</style>
