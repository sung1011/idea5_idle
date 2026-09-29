<script setup lang="ts">
import type { FoodItemId } from '../sim/tables'
import { foodIconPaths } from './foodIcons'

defineProps<{
  name: FoodItemId
}>()
</script>

<template>
  <svg class="food-ico" viewBox="0 0 16 16" aria-hidden="true">
    <path v-for="(d, i) in foodIconPaths(name)" :key="i" :d="d" />
  </svg>
</template>

<style scoped>
.food-ico {
  display: block;
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  fill: currentColor;
}
</style>
