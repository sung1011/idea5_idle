<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { idleCount } from '../sim/query'
import { formatClock, gameDay, timeOfDayS } from '../sim/tables'
import { useGameStore } from './gameStore'
import BankPanel from './bankPanel.vue'
import OfflineBanner from './offlineBanner.vue'
import EncounterPanel from './encounterPanel.vue'
import WorkersPanel from './workersPanel.vue'
import WorkshopPanel from './workshopPanel.vue'

const TABS = [
  { id: 'workshop', label: '车间' },
  { id: 'bank', label: '银行' },
  { id: 'workers', label: '工人' },
  { id: 'encounters', label: '偶遇' },
] as const

type TabId = (typeof TABS)[number]['id']

const game = useGameStore()
const tab = ref<TabId>('workshop')

const day = computed(() => gameDay(game.save.elapsedS))
const clock = computed(() => formatClock(game.save.elapsedS))
const today = computed(() => formatClock(timeOfDayS(game.save.elapsedS)))
const idle = computed(() => idleCount(game.save))

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
      <p class="shift">第一期 · 纯生活流水线 · 偶遇先交补给</p>
      <h1>车间闲置</h1>
    </header>

    <OfflineBanner />

    <section class="panel top">
      <p>游戏日 {{ day }} · 今日 {{ today }}</p>
      <p class="clock">已运行 {{ clock }}</p>
      <p>金币 {{ game.save.gold }} · 工人 {{ game.save.workers.length }} · 空闲 {{ idle }}</p>
    </section>

    <p v-if="game.notice" class="notice" :class="game.noticeKind">{{ game.notice }}</p>
    <ul v-if="game.hints.length" class="hints">
      <li v-for="(h, i) in game.hints" :key="i" :class="h.kind">{{ h.text }}</li>
    </ul>
    <p v-else class="hint">
      抽工人，把人堆到同一站加速当前品类。采矿 / 锻造可升等级解锁铁矿、铁器等。钓鱼出鱼、烹饪出熟食；伐木出木头可卖。偶遇敌人交补给后出发行军，到期只领金币。黑心商人只买、路人只换货、当铺只典当。探索重抽可刷新格。相邻站同时有人会共振。
    </p>

    <nav class="tabs" role="tablist" aria-label="主界面页签">
      <button
        v-for="t in TABS"
        :key="t.id"
        type="button"
        role="tab"
        :aria-selected="tab === t.id"
        :class="{ on: tab === t.id }"
        @click="tab = t.id"
      >
        {{ t.label }}
      </button>
    </nav>

    <WorkshopPanel v-if="tab === 'workshop'" />
    <BankPanel v-else-if="tab === 'bank'" />
    <WorkersPanel v-else-if="tab === 'workers'" />
    <EncounterPanel v-else />

    <p class="hint">存档键 idea5Idle。</p>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: min(720px, 100%);
  min-height: 100dvh;
  margin: 0 auto;
  padding: 28px 20px 36px;
  background:
    radial-gradient(ellipse at 50% -8%, #3a2818 0%, transparent 55%),
    var(--iron);
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
  padding: 14px 16px;
  border: 1px solid var(--seam);
  background: var(--plate);
}

.panel p,
.hint,
.notice {
  margin: 0;
  line-height: 1.5;
}

.clock {
  font-family: var(--font-mono);
  color: var(--copper);
}

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 8px 0;
  background: var(--iron);
}

.tabs button {
  flex: 1 1 72px;
  min-width: 64px;
  min-height: 40px;
  padding: 8px 10px;
  border: 1px solid var(--seam);
  background: #18140f;
}

.tabs button.on {
  border-color: var(--copper);
  color: var(--ember);
}

.hints {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hint {
  color: var(--muted);
  font-size: 14px;
}

.notice,
.notice.err,
.hints .bottleneck {
  color: var(--danger);
}

.notice.ok {
  color: var(--moss);
}

.hints .resonance {
  color: var(--ember);
}

.hints .progress {
  color: var(--moss);
}
</style>
