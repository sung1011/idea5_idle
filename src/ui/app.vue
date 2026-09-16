<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useGameStore } from './gameStore'
import BankPanel from './bankPanel.vue'
import EncounterPanel from './encounterPanel.vue'
import MessagePanel from './messagePanel.vue'
import SettingsPanel from './settingsPanel.vue'
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
const mailOpen = ref(false)
const settingsOpen = ref(false)

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
      <h1>骑士工坊</h1>
      <div class="mast-actions">
        <button
          type="button"
          class="icon-btn"
          :class="{ unread: game.unread }"
          aria-label="消息"
          @click="mailOpen = true"
        >
          <svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-11Zm1.7.5 6.7 4.3c.37.24.83.24 1.2 0L19.3 7H4.7Zm14.8 1.3-6.4 4.1a2.7 2.7 0 0 1-2.8 0L4.5 8.8V17h15V8.8Z"
            />
          </svg>
          消息
          <i v-if="game.unread" class="dot" />
        </button>
        <button type="button" class="icon-btn" aria-label="设置" @click="settingsOpen = true">
          <svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M19.1 12.7a7.4 7.4 0 0 0 .1-1.4 7.4 7.4 0 0 0-.1-1.4l2-1.6a.5.5 0 0 0 .1-.6l-1.9-3.3a.5.5 0 0 0-.6-.2l-2.4 1a7 7 0 0 0-2.4-1.4l-.4-2.5a.5.5 0 0 0-.5-.4h-3.8a.5.5 0 0 0-.5.4l-.4 2.5a7 7 0 0 0-2.4 1.4l-2.4-1a.5.5 0 0 0-.6.2L2.7 7.7a.5.5 0 0 0 .1.6l2 1.6a7.4 7.4 0 0 0-.1 1.4 7.4 7.4 0 0 0 .1 1.4l-2 1.6a.5.5 0 0 0-.1.6l1.9 3.3a.5.5 0 0 0 .6.2l2.4-1a7 7 0 0 0 2.4 1.4l.4 2.5a.5.5 0 0 0 .5.4h3.8a.5.5 0 0 0 .5-.4l.4-2.5a7 7 0 0 0 2.4-1.4l2.4 1a.5.5 0 0 0 .6-.2l1.9-3.3a.5.5 0 0 0-.1-.6Zm-7.1 2.1A2.8 2.8 0 1 1 14.8 12 2.8 2.8 0 0 1 12 14.8Z"
            />
          </svg>
          设置
        </button>
      </div>
    </header>

    <section class="panel top" aria-label="资源">
      <div class="resources">
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

    <main class="page">
      <WorkshopPanel v-if="tab === 'workshop'" />
      <BankPanel v-else-if="tab === 'bank'" />
      <WorkersPanel v-else-if="tab === 'workers'" />
      <EncounterPanel v-else />
    </main>

    <nav class="dock" role="tablist" aria-label="主界面页签">
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

    <MessagePanel v-if="mailOpen" @close="mailOpen = false" />
    <SettingsPanel v-if="settingsOpen" @close="settingsOpen = false" />
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(720px, 100%);
  min-height: 100dvh;
  margin: 0 auto;
  padding: 16px 16px calc(80px + env(safe-area-inset-bottom));
}

.mast {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.mast-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon-btn {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  padding: 4px 10px;
}

.glyph {
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

h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--ink);
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
}

.notice {
  margin: 0;
  line-height: 1.5;
}

.resources {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.page {
  flex: 1 1 auto;
}

.dock {
  position: fixed;
  left: 50%;
  bottom: 0;
  z-index: 3;
  display: flex;
  gap: 8px;
  width: min(720px, 100%);
  transform: translateX(-50%);
  padding: 8px 12px calc(8px + env(safe-area-inset-bottom));
  background: var(--paper);
  border-top: 3px solid var(--gold);
  box-shadow: 0 -2px 0 var(--gold-deep);
}

.dock button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex: 1 1 64px;
  min-width: 56px;
  min-height: 48px;
  padding: 8px 8px;
}

.dock button.on {
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
