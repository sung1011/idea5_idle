<script setup lang="ts">
import ActIcon from './actIcon.vue'
import type { ActIconId } from './actIcons'

defineProps<{
  icon: ActIconId
  kind: 'primary' | 'minor' | 'danger'
  tone?: 'combat' | 'gain' | 'produce'
  cost?: string
}>()
</script>

<template>
  <button type="button" class="act" :class="[kind, tone]">
    <ActIcon :name="icon" />
    <span class="lab"><slot /></span>
    <small v-if="cost" class="cost">· {{ cost }}</small>
  </button>
</template>
