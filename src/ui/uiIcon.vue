<script setup lang="ts">
import { computed } from 'vue'
import { uiIconPaths, uiIconSprite, type UiIconId } from './uiIcons'

const props = defineProps<{
  name: UiIconId
}>()

const sprite = computed(() => uiIconSprite(props.name))
</script>

<template>
  <i
    v-if="sprite"
    class="ui-ico sprite"
    :class="[sprite === 'tab' ? 'sprite-tab' : 'sprite-station', name]"
    aria-hidden="true"
  />
  <svg v-else class="ui-ico" viewBox="0 0 16 16" aria-hidden="true">
    <path v-for="(d, i) in uiIconPaths(name)" :key="i" :d="d" />
  </svg>
</template>
