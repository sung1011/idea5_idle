<script setup lang="ts">
import { potionIconPaths } from './potionIcons'
import type { PotionItemId } from '../sim/types'

defineProps<{
  name: PotionItemId
}>()
</script>

<template>
  <svg class="potion-ico" viewBox="0 0 16 16" aria-hidden="true">
    <path v-for="(d, i) in potionIconPaths(name)" :key="i" :d="d" fill-rule="evenodd" />
  </svg>
</template>

<style scoped>
.potion-ico {
  display: block;
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  fill: currentColor;
}
</style>
