<script setup lang="ts">
import type { CombatAttrId } from '../sim/types'
import CombatAttrIcon from './combatAttrIcon.vue'

withDefaults(
  defineProps<{
    attrs: readonly CombatAttrId[]
    /** 选人面板没有克制时留空，不写「无克制属性」。 */
    blankEmpty?: boolean
  }>(),
  { blankEmpty: false },
)
</script>

<template>
  <span v-if="!attrs.length && blankEmpty" class="empty blank" aria-hidden="true"></span>
  <span v-else-if="!attrs.length" class="empty">无克制属性</span>
  <span v-else class="row">
    <CombatAttrIcon v-for="id in attrs" :key="id" :attr="id" />
  </span>
</template>

<style scoped>
.row {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  align-content: center;
  gap: 4px;
  vertical-align: middle;
}

.row :deep(.chip) {
  flex: none;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  aspect-ratio: 1;
}

.empty {
  color: var(--muted);
  font-size: 13px;
}

.empty.blank {
  display: inline-block;
  width: 0;
  min-height: 20px;
  overflow: hidden;
}
</style>
