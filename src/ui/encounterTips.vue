<script setup lang="ts">
import { toRef } from 'vue'
import { useEncounterTips } from './encounterTips'

const props = defineProps<{
  encounterId: string
}>()

const { tips } = useEncounterTips(toRef(props, 'encounterId'))
</script>

<template>
  <div class="layer" aria-live="polite">
    <p v-for="tip in tips" :key="tip.id" class="tip" :class="tip.kind">
      {{ tip.text }}
    </p>
  </div>
</template>

<style scoped>
.layer {
  position: absolute;
  left: 50%;
  top: 22%;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: min(88%, 240px);
  pointer-events: none;
  transform: translateX(-50%);
}

.tip {
  margin: 0;
  max-width: 100%;
  padding: 4px 10px;
  border: 2px solid var(--gold-deep);
  border-radius: 10px;
  background: rgba(255, 248, 230, 0.94);
  color: var(--ink);
  font-size: 13px;
  line-height: 1.4;
  text-align: center;
  animation: encounter-tip 1.4s ease-out forwards;
  box-shadow: 0 2px 0 var(--gold-deep);
}

.tip.err {
  border-color: #c43b30;
  color: #9a2f24;
  background: rgba(255, 236, 230, 0.95);
}

.tip.ok {
  border-color: #3e9a2a;
  color: #2d7a1c;
  background: rgba(232, 248, 220, 0.95);
}

@keyframes encounter-tip {
  0% {
    opacity: 0;
    transform: translateY(8px);
  }
  12% {
    opacity: 1;
    transform: translateY(0);
  }
  70% {
    opacity: 1;
    transform: translateY(-18px);
  }
  100% {
    opacity: 0;
    transform: translateY(-36px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tip {
    animation: encounter-tip-static 1.4s linear forwards;
  }
}

@keyframes encounter-tip-static {
  0%,
  70% {
    opacity: 1;
    transform: none;
  }
  100% {
    opacity: 0;
    transform: none;
  }
}
</style>
