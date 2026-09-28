<script setup lang="ts">
import { setWorkshopLayoutDemo, workshopLayoutDemo, type WorkshopLayoutDemo } from './workshopLayoutDemo'

const choices: { id: WorkshopLayoutDemo; label: string }[] = [
  { id: 'current', label: '现状' },
  { id: 'a', label: '轻量' },
  { id: 'b', label: '聚焦' },
  { id: 'c', label: '分区' },
]
</script>

<template>
  <div class="layout-switch" role="toolbar" aria-label="工坊精简预览">
    <span>预览</span>
    <button
      v-for="choice in choices"
      :key="choice.id"
      type="button"
      :class="{ on: workshopLayoutDemo === choice.id }"
      :aria-pressed="workshopLayoutDemo === choice.id"
      @click="setWorkshopLayoutDemo(choice.id)"
    >
      {{ choice.label }}
    </button>
  </div>
</template>

<style scoped>
.layout-switch {
  position: fixed;
  z-index: 25;
  top: calc(8px + env(safe-area-inset-top, 0px));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: calc(100vw - 16px);
  padding: 4px;
  border: 2px solid var(--gold-deep);
  border-radius: 999px;
  background: rgba(255, 248, 230, 0.96);
  box-shadow: 0 2px 0 var(--gold-deep);
}

.layout-switch span {
  padding: 0 6px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 800;
}

.layout-switch button {
  min-height: 28px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
}

.layout-switch button.on {
  background: linear-gradient(#ffe27a, #e2a31a);
  color: #5a3010;
}
</style>
