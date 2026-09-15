<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { CLASS_DEF } from '../sim/tables/classDef'
import { formatClock, gameDay, timeOfDayS } from '../sim/tables/clock'
import type { Assignment } from '../sim/types'
import { useGameStore } from './gameStore'

const game = useGameStore()

const day = computed(() => gameDay(game.save.elapsedS))
const clock = computed(() => formatClock(game.save.elapsedS))
const today = computed(() => formatClock(timeOfDayS(game.save.elapsedS)))
const noWorkers = computed(() => game.save.workers.length === 0)

function assignmentLabel(job: Assignment): string {
  if (!job) return '空闲'
  if (job.type === 'combat') return '战斗'
  if (job.lifeId === 'woodcutting') return '伐木'
  if (job.lifeId === 'alchemy') return '炼金'
  if (job.lifeId === 'mining') return '采矿'
  return '派遣中'
}

onMounted(() => {
  game.startClock()
})

onUnmounted(() => {
  game.stopClock()
})
</script>

<template>
  <div class="shell">
    <header class="mast">
      <p class="shift">阶段 0 · 脚手架</p>
      <h1>双线闲置</h1>
    </header>
    <section class="panel">
      <p>游戏日 {{ day }} · 今日 {{ today }}</p>
      <p class="clock">已运行 {{ clock }}</p>
      <p>账号金币 {{ game.save.gold }}</p>
      <p>worker {{ game.save.workers.length }}</p>
    </section>
    <section v-if="!noWorkers" class="panel">
      <p v-for="w in game.save.workers" :key="w.id">
        {{ w.name ?? w.id }} · {{ CLASS_DEF[w.classId].label }} ·
        {{ assignmentLabel(w.assignment) }}
      </p>
    </section>
    <p v-if="noWorkers" class="hint">还没有 worker。创建 worker 时选择职业，才能派遣生活挂机 / 战斗，或用账号金币学战斗技能。</p>
    <p v-else class="hint">账号共用银行和金币。每个 worker 可派去不同活：一人采矿、一人战斗可以同时进行。</p>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: min(640px, 100%);
  min-height: 100dvh;
  margin: 0 auto;
  padding: 28px 20px 36px;
  background:
    radial-gradient(ellipse at 50% -8%, #2a2418 0%, transparent 55%),
    var(--soil);
}

.mast {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.shift {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  letter-spacing: 0.18em;
}

h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 0.1em;
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border: 1px solid #3a3328;
  background: #18140f;
}

.panel p,
.hint {
  margin: 0;
  line-height: 1.5;
}

.clock {
  font-family: var(--font-mono);
  color: var(--bark);
}

.hint {
  color: var(--ember);
  font-size: 14px;
}
</style>
