<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { xpToNextKnightLevel } from '../sim/knightLevel'
import { nextModuleUnlock } from '../sim/moduleUnlock'
import { useGameStore } from './gameStore'

const emit = defineEmits<{ close: [] }>()
const game = useGameStore()

const ready = ref(false)
const shown = ref(0)
const flash = ref(false)
let flashTimer = 0

const level = computed(() => game.save.knightLevel)
const xp = computed(() => (Number.isFinite(game.save.knightXp) ? Math.max(0, Math.floor(game.save.knightXp)) : 0))
const need = computed(() => xpToNextKnightLevel(level.value))
const remain = computed(() => Math.max(0, need.value - xp.value))
const ratio = computed(() => (need.value <= 0 ? 0 : Math.min(1, xp.value / need.value)))
const nextLine = computed(() => nextModuleUnlock(level.value, game.save)?.label ?? '玩法都已开放')
const barPct = computed(() => `${(shown.value * 100).toFixed(2)}%`)

function onKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape') emit('close')
}

onMounted(() => {
  shown.value = ratio.value
  window.addEventListener('keydown', onKey)
  requestAnimationFrame(() => {
    ready.value = true
  })
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  window.clearTimeout(flashTimer)
})

watch(
  () => [game.save.knightLevel, game.save.knightXp] as const,
  ([lv], prev) => {
    const nextRatio = ratio.value
    if (!ready.value || !prev) {
      shown.value = nextRatio
      return
    }
    if (lv > prev[0]) {
      shown.value = 1
      flash.value = true
      window.clearTimeout(flashTimer)
      flashTimer = window.setTimeout(() => {
        flash.value = false
        shown.value = nextRatio
      }, 360)
      return
    }
    shown.value = nextRatio
  },
)
</script>

<template>
  <div class="mask" @click.self="emit('close')">
    <section class="panel box" role="dialog" aria-modal="true" aria-labelledby="knight-level-title">
      <header>
        <h2 id="knight-level-title" class="title">酋长 {{ level }} 级</h2>
        <button type="button" class="close" @click="emit('close')">关闭</button>
      </header>
      <p class="next">{{ nextLine }}</p>
      <div class="bar" :class="{ flash }" aria-hidden="true">
        <i class="fill" :style="{ width: barPct }" />
      </div>
      <p class="remain">距下一级还差 {{ remain }}</p>
    </section>
  </div>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: var(--z-sheet);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 72px 16px 24px;
  background: rgba(8, 28, 14, 0.58);
}

.box {
  width: min(440px, 100%);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 12px 14px;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

header .title {
  margin: 0;
  font-size: 18px;
}

.next {
  margin: 0;
  color: var(--ink);
  font-weight: 700;
}

.bar {
  height: 14px;
  border: 2px solid var(--gold-deep);
  border-radius: 999px;
  background: rgba(92, 58, 26, 0.12);
  overflow: hidden;
}

.fill {
  display: block;
  height: 100%;
  width: 0;
  border-radius: inherit;
  background: linear-gradient(90deg, #c6ff6a, #2fbf32);
  transition: width 0.55s linear;
}

.bar.flash .fill {
  animation: knight-bar-flash 0.35s ease;
}

.remain {
  margin: 0;
  font-variant-numeric: tabular-nums;
}

@keyframes knight-bar-flash {
  0%,
  100% {
    filter: brightness(1);
  }
  45% {
    filter: brightness(1.85);
  }
}

@media (prefers-reduced-motion: reduce) {
  .fill,
  .bar.flash .fill {
    transition: none;
    animation: none;
  }
}
</style>
