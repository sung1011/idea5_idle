<script setup lang="ts">
import { treasureActIconPaths, type TreasureActIconId } from './treasureActIcons'

defineProps<{
  name: TreasureActIconId
}>()
</script>

<template>
  <svg class="treasure-act-ico" viewBox="0 0 16 16" aria-hidden="true">
    <path v-for="(d, i) in treasureActIconPaths(name)" :key="i" :d="d" fill-rule="evenodd" />
  </svg>
</template>

<style scoped>
.treasure-act-ico {
  display: block;
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  fill: currentColor;
}
</style>
