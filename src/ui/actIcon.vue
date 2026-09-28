<script setup lang="ts">
import { actIconPaths, type ActIconId } from './actIcons'

defineProps<{
  name: ActIconId
}>()
</script>

<template>
  <svg class="act-ico" viewBox="0 0 16 16" aria-hidden="true">
    <path v-for="(d, i) in actIconPaths(name)" :key="i" :d="d" fill-rule="evenodd" />
  </svg>
</template>

<style scoped>
.act-ico {
  display: block;
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  fill: currentColor;
}
</style>
