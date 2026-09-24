<script setup lang="ts">
import { uiIconPaths, type UiIconId } from './uiIcons'

defineProps<{
  name: UiIconId
}>()
</script>

<template>
  <svg class="ui-ico" viewBox="0 0 16 16" aria-hidden="true">
    <path v-for="(d, i) in uiIconPaths(name)" :key="i" :d="d" />
  </svg>
</template>
