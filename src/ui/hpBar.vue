<script setup lang="ts">
import { computed } from 'vue'
import { hpBarFill, hpBarLabel, hpBarTone } from './hpBar'

const props = defineProps<{
  hp: number
  hpMax: number
  compact?: boolean
}>()

const fillPct = computed(() => `${(hpBarFill(props.hp, props.hpMax) * 100).toFixed(2)}%`)
const label = computed(() => hpBarLabel(props.hp, props.hpMax))
const tone = computed(() => hpBarTone(props.hp, props.hpMax))
</script>

<template>
  <div
    class="hp"
    :class="[tone, { compact }]"
    role="progressbar"
    :aria-valuenow="hp"
    :aria-valuemin="0"
    :aria-valuemax="hpMax"
    :aria-label="label"
  >
    <i class="fill" :style="{ width: fillPct }" />
    <span>{{ label }}</span>
  </div>
</template>

<style scoped>
.hp {
  position: relative;
  width: 100%;
  height: 22px;
  overflow: hidden;
  border: 2px solid var(--gold-deep);
  border-radius: var(--radius-pill);
  background: linear-gradient(180deg, #efe0b0, var(--bar-track));
  box-shadow: inset 0 1px 2px rgba(106, 66, 24, 0.16);
}

.hp .fill {
  display: block;
  height: 100%;
  background: var(--bar-fill-moss);
}

.hp.mid .fill {
  background: var(--bar-fill-gold);
}

.hp.low .fill {
  background: var(--bar-fill-hp);
}

.hp span {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--ink);
  text-shadow: 0 0 3px #fff8ee, 0 1px 0 #fff8ee;
}

.hp.compact {
  height: 16px;
}

.hp.compact span {
  font-size: 9px;
  font-weight: 900;
}
</style>
