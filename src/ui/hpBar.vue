<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { HP_BAR_SHAKE_MS, hpBarFill, hpBarLabel, hpBarTone, shouldShakeHpBar } from './hpBar'

const props = defineProps<{
  hp: number
  hpMax: number
  compact?: boolean
  shakeKey?: number
  /** 敌方换皮。缺省仍是友方草绿条。 */
  variant?: 'ally' | 'enemy'
}>()

const fillPct = computed(() => `${(hpBarFill(props.hp, props.hpMax) * 100).toFixed(2)}%`)
const label = computed(() => hpBarLabel(props.hp, props.hpMax))
const tone = computed(() => hpBarTone(props.hp, props.hpMax))
const shaking = ref(false)
let shakeTimer = 0

watch(
  () => props.shakeKey,
  (next, prev) => {
    if (!shouldShakeHpBar(prev, next)) return
    shaking.value = false
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        shaking.value = true
      })
    } else {
      shaking.value = true
    }
    if (typeof window !== 'undefined') window.clearTimeout(shakeTimer)
    const later = typeof window !== 'undefined' ? window.setTimeout.bind(window) : setTimeout
    shakeTimer = later(() => {
      shaking.value = false
    }, HP_BAR_SHAKE_MS)
  },
)

onUnmounted(() => {
  if (typeof window !== 'undefined') window.clearTimeout(shakeTimer)
})
</script>

<template>
  <div
    class="hp"
    :class="[tone, { compact, shake: shaking, enemy: variant === 'enemy' }]"
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
  border: 3px solid #b88810;
  border-radius: var(--radius-pill);
  background: linear-gradient(180deg, #efe0b0, var(--bar-track));
  box-shadow: inset 0 1px 2px rgba(106, 66, 24, 0.2);
}

.hp .fill {
  display: block;
  height: 100%;
  background: var(--bar-sheen), linear-gradient(90deg, #6fc43a, #2d7a1c);
  transition: width 0.3s ease;
}

.hp.mid .fill {
  background: var(--bar-sheen), linear-gradient(90deg, #e0b020, #a8700c);
}

.hp.low .fill {
  background: var(--bar-sheen), linear-gradient(90deg, #d04a38, #a02820);
}

.hp.enemy {
  border-radius: 2px;
  border: 2px solid #4a1028;
  background: #14080e;
  box-shadow:
    0 0 0 1px #2a0614,
    inset 0 0 0 2px #6b1d3a;
}

.hp.enemy .fill,
.hp.enemy.low .fill,
.hp.enemy.mid .fill {
  background: linear-gradient(90deg, #3a1030 0%, #6b1848 46%, #a32038 100%);
  clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%);
  transition: none;
}

.hp.enemy span {
  color: #fff4ea;
  text-shadow: 0 1px 0 #1a0610, 0 0 3px #1a0610;
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

.hp.shake {
  animation: hp-shake 0.26s ease;
}

@keyframes hp-shake {
  0%,
  100% {
    transform: translateX(0);
  }
  20% {
    transform: translateX(-5px);
  }
  40% {
    transform: translateX(5px);
  }
  60% {
    transform: translateX(-3px);
  }
  80% {
    transform: translateX(3px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .hp.shake {
    animation: none;
  }

  .hp .fill {
    transition: none;
  }
}
</style>
