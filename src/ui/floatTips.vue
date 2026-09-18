<script setup lang="ts">
import { useFloatTips } from './floatTips'

const { tips } = useFloatTips()
</script>

<template>
  <Teleport to="body">
    <div class="layer" aria-live="polite">
      <p
        v-for="tip in tips"
        :key="tip.id"
        class="tip"
        :class="tip.kind"
        :style="{ left: `${tip.x}px`, top: `${tip.y}px` }"
      >
        {{ tip.text }}
      </p>
    </div>
  </Teleport>
</template>

<style scoped>
.layer {
  position: fixed;
  inset: 0;
  z-index: var(--z-tips);
  pointer-events: none;
}

.tip {
  position: absolute;
  margin: 0;
  max-width: min(280px, 70vw);
  padding: 4px 10px;
  border: 2px solid var(--gold-deep);
  border-radius: 10px;
  background: rgba(255, 248, 230, 0.94);
  color: var(--ink);
  font-size: 14px;
  line-height: 1.4;
  transform: translate(-50%, -120%);
  animation: float-tip 1.4s ease-out forwards;
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

@keyframes float-tip {
  0% {
    opacity: 0;
    transform: translate(-50%, -80%);
  }
  12% {
    opacity: 1;
    transform: translate(-50%, -120%);
  }
  70% {
    opacity: 1;
    transform: translate(-50%, -160%);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -190%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tip {
    animation: float-tip-static 1.4s linear forwards;
  }
}

@keyframes float-tip-static {
  0%,
  70% {
    opacity: 1;
    transform: translate(-50%, -120%);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -120%);
  }
}
</style>
