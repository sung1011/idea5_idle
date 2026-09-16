<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { formatClock, gameDay, timeOfDayS } from '../sim/tables'
import { useGameStore } from './gameStore'
import BankPanel from './bankPanel.vue'
import EncounterPanel from './encounterPanel.vue'
import GmPanel from './gmPanel.vue'
import MessagePanel from './messagePanel.vue'
import WorkersPanel from './workersPanel.vue'
import WorkshopPanel from './workshopPanel.vue'

const TABS = [
  { id: 'workshop', label: '工坊' },
  { id: 'bank', label: '银行' },
  { id: 'workers', label: '工人' },
  { id: 'encounters', label: '偶遇' },
] as const

type TabId = (typeof TABS)[number]['id']

const game = useGameStore()
const tab = ref<TabId>('workshop')
const gmOpen = ref(false)
const mailOpen = ref(false)

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
      <div>
        <h1>骑士工坊</h1>
      </div>
      <div class="mast-actions">
        <button
          type="button"
          class="mail-open"
          :class="{ unread: game.unread }"
          aria-label="消息"
          @click="mailOpen = true"
        >
          <svg class="envelope" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-11Zm1.7.5 6.7 4.3c.37.24.83.24 1.2 0L19.3 7H4.7Zm14.8 1.3-6.4 4.1a2.7 2.7 0 0 1-2.8 0L4.5 8.8V17h15V8.8Z"
            />
          </svg>
          消息
          <i v-if="game.unread" class="dot" />
        </button>
        <button type="button" class="gm-open" @click="gmOpen = true">GM</button>
      </div>
    </header>

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

    <MessagePanel v-if="mailOpen" @close="mailOpen = false" />
    <GmPanel v-if="gmOpen" @close="gmOpen = false" />
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
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.mast > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mast-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mail-open {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 4px 10px;
}

.envelope {
  width: 18px;
  height: 18px;
}

.dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--danger);
  box-shadow: 0 0 0 2px var(--plate);
}

.gm-open {
  min-height: 28px;
  padding: 2px 8px;
  font-size: 11px;
  letter-spacing: 0.12em;
  color: var(--muted);
  opacity: 0.42;
  box-shadow: none;
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

.notice,
.notice.err {
  color: var(--danger);
}

.notice.ok {
  color: var(--moss);
}
</style>
