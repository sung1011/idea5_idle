<script setup lang="ts">
import type { CombatAttrId } from '../sim/types'
import CombatAttrIcon from './combatAttrIcon.vue'

defineProps<{
  attrs: readonly CombatAttrId[]
}>()
</script>

<template>
  <span v-if="!attrs.length" class="empty">无战斗属性</span>
  <span v-else class="row">
    <CombatAttrIcon v-for="id in attrs" :key="id" :attr="id" />
  </span>
</template>

<style scoped>
.row {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  vertical-align: middle;
}

.empty {
  color: var(--muted);
  font-size: 13px;
}
</style>
