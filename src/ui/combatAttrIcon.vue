<script setup lang="ts">
import { COMBAT_ATTR_KIND, COMBAT_ATTR_LABEL } from '../sim/combatAttrs'
import type { CombatAttrId } from '../sim/types'
import { combatAttrIconPaths } from './combatAttrIcons'

defineProps<{
  attr?: CombatAttrId | null
}>()
</script>

<template>
  <i
    class="chip"
    :class="attr ? COMBAT_ATTR_KIND[attr] : 'unknown'"
    :title="attr ? COMBAT_ATTR_LABEL[attr] : '未揭示'"
    :aria-label="attr ? COMBAT_ATTR_LABEL[attr] : '未揭示'"
    role="img"
  >
    <svg v-if="attr" viewBox="0 0 16 16" aria-hidden="true">
      <path v-for="(d, i) in combatAttrIconPaths(attr)" :key="i" :d="d" />
    </svg>
    <template v-else>?</template>
  </i>
</template>

<style scoped>
.chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 2px solid var(--gold-deep);
  border-radius: 6px;
  background: var(--slot);
  color: var(--ink);
  font-style: normal;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  text-align: center;
}

.chip svg {
  display: block;
  width: 14px;
  height: 14px;
  fill: currentColor;
}

.chip.physical {
  color: #6b3f12;
  background: #f3e2c0;
}

.chip.elemental {
  color: #1f56b0;
  background: #dcebff;
}

.chip.unknown {
  color: var(--muted);
}
</style>
