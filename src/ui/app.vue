<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
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
      <p class="shift">第一期 · 纯生活流水线 · 偶遇一键出发</p>
      <h1>车间闲置</h1>
    </header>

    <OfflineBanner />

    <section class="panel top">
      <p>游戏日 {{ day }} · 今日 {{ today }}</p>
      <p class="clock">已运行 {{ clock }}</p>
      <div class="resources" aria-label="资源">
        <div class="chip">
          <i class="sprite sprite-res gold" aria-hidden="true" />
          <span>{{ game.save.gold }}</span>
        </div>
        <div class="chip">
          <i class="sprite sprite-res diamonds" aria-hidden="true" />
          <span>{{ game.save.diamonds }}</span>
        </div>
        <div class="chip">
          <i class="sprite sprite-res workers" aria-hidden="true" />
          <span>{{ game.save.workers.length }}</span>
        </div>
      </div>
    </section>

    <p v-if="game.notice" class="notice" :class="game.noticeKind">{{ game.notice }}</p>
    <p class="hint">
      抽工人，把人堆到同一站加速当前品类。采矿 / 锻造可升等级解锁铁矿、铁器等。钓鱼出鱼、烹饪出熟食；伐木出木头可卖。偶遇敌人货够则一键出发行军，到期只领金币。黑心商人只买、路人只换货、当铺只典当。探索重抽可刷新格。停产看站点红框，共振标在对应卡片上。工人页看按钮选中态就知道人在哪。钻石是高级代币占位，本轮没有获得途径。
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
        <i class="sprite sprite-tab" :class="t.id" aria-hidden="true" />
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
  color: var(--ink);
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
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

.resources {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 8px 0;
  background: var(--paper);
}

.tabs button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex: 1 1 72px;
  min-width: 64px;
  min-height: 40px;
  padding: 8px 10px;
}

.tabs button.on {
  color: var(--ink);
  background: linear-gradient(#ffe27a, #f0b83a);
  box-shadow: 0 3px 0 var(--shadow);
  opacity: 1;
  filter: none;
}

.hint {
  color: var(--muted);
  font-size: 14px;
}

.notice,
.notice.err {
  color: var(--danger);
}

.notice.ok {
  color: var(--moss);
}
</style>
