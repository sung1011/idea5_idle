<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { APP_TABS, appTab, selectAppTab } from './appNav'
import { formatHudQty } from './formatHud'
import { useGameStore } from './gameStore'
import EncounterPanel from './encounterPanel.vue'
import MessagePanel from './messagePanel.vue'
import SettingsPanel from './settingsPanel.vue'
import TechPanel from './techPanel.vue'
import WorkersPanel from './workersPanel.vue'
import WorkshopPanel from './workshopPanel.vue'
import FloatTips from './floatTips.vue'
import GuideQuestFloat from './guideQuestFloat.vue'
import UiIcon from './uiIcon.vue'

const game = useGameStore()
const tab = appTab
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
    <header class="hud" aria-label="资源">
      <div class="resources">
        <div class="chip">
          <i class="sprite sprite-res gold" aria-hidden="true" />
          <span>{{ formatHudQty(game.save.gold) }}</span>
        </div>
        <div class="chip">
          <i class="sprite sprite-res diamonds" aria-hidden="true" />
          <span>{{ formatHudQty(game.save.diamonds) }}</span>
        </div>
        <div class="chip">
          <i class="sprite sprite-res workers" aria-hidden="true" />
          <span>{{ formatHudQty(game.save.workers.length) }}</span>
        </div>
        <div class="chip">
          <svg class="hud-ico" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M14.6 3.4 20.6 9.4 19.2 10.8 17.5 9.1 8.8 17.8v2.3h2.3l1.6-1.6 1.4 1.4-4.4 4.4-1.4-1.4.7-.7H3.8v-4.8l-.7.7-1.4-1.4 4.4-4.4 1.4 1.4-1.6 1.6H8.2v2.3l8.7-8.7-1.7-1.7z"
            />
          </svg>
          <span>Lv{{ game.save.knightLevel }}</span>
        </div>
        <div class="chip">
          <svg class="hud-ico" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 2.4 13.7 8.1 19.4 9.8 13.7 11.5 12 17.2 10.3 11.5 4.6 9.8 10.3 8.1ZM18.2 14.2 19 16.6 21.4 17.4 19 18.2 18.2 20.6 17.4 18.2 15 17.4 17.4 16.6Z"
            />
          </svg>
          <span>{{ formatHudQty(game.save.techPoints) }}</span>
        </div>
      </div>
      <div class="hud-actions">
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
          <i v-if="game.unread" class="dot" />
        </button>
        <button type="button" class="icon-btn" aria-label="设置" @click="settingsOpen = true">
          <svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M19.1 12.7a7.4 7.4 0 0 0 .1-1.4 7.4 7.4 0 0 0-.1-1.4l2-1.6a.5.5 0 0 0 .1-.6l-1.9-3.3a.5.5 0 0 0-.6-.2l-2.4 1a7 7 0 0 0-2.4-1.4l-.4-2.5a.5.5 0 0 0-.5-.4h-3.8a.5.5 0 0 0-.5.4l-.4 2.5a7 7 0 0 0-2.4 1.4l-2.4-1a.5.5 0 0 0-.6.2L2.7 7.7a.5.5 0 0 0 .1.6l2 1.6a7.4 7.4 0 0 0-.1 1.4 7.4 7.4 0 0 0 .1 1.4l-2 1.6a.5.5 0 0 0-.1.6l1.9 3.3a.5.5 0 0 0 .6.2l2.4-1a7 7 0 0 0 2.4 1.4l.4 2.5a.5.5 0 0 0 .5.4h3.8a.5.5 0 0 0 .5-.4l.4-2.5a7 7 0 0 0 2.4-1.4l2.4 1a.5.5 0 0 0 .6-.2l1.9-3.3a.5.5 0 0 0-.1-.6Zm-7.1 2.1A2.8 2.8 0 1 1 14.8 12 2.8 2.8 0 0 1 12 14.8Z"
            />
          </svg>
        </button>
      </div>
    </header>

    <main class="page" :class="tab">
      <WorkshopPanel v-if="tab === 'workshop'" />
      <WorkersPanel v-else-if="tab === 'workers'" />
      <EncounterPanel v-else-if="tab === 'encounters'" />
      <TechPanel v-else />
    </main>

    <nav class="dock" role="tablist" aria-label="主界面页签">
      <button
        v-for="t in APP_TABS"
        :key="t.id"
        type="button"
        role="tab"
        :aria-selected="tab === t.id"
        :class="{ on: tab === t.id }"
        @click="selectAppTab(t.id)"
      >
        <UiIcon :name="t.id" />
        <span>{{ t.label }}</span>
      </button>
    </nav>

    <GuideQuestFloat />
    <MessagePanel v-if="mailOpen" @close="mailOpen = false" />
    <SettingsPanel v-if="settingsOpen" @close="settingsOpen = false" />
    <FloatTips />
  </div>
</template>

<style scoped>
.shell {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 480px;
  height: 100dvh;
  margin: 0 auto;
  padding-top: env(safe-area-inset-top);
}

.hud {
  position: sticky;
  top: 0;
  z-index: var(--z-hud);
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 52px;
  padding: 6px 8px;
  background:
    var(--paper-grain),
    linear-gradient(180deg, #fffdf6, var(--paper));
  background-blend-mode: multiply, normal;
  border-bottom: 3px solid var(--gold);
  box-shadow: 0 2px 0 var(--gold-deep);
}

.resources {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
  flex: 1 1 auto;
  min-width: 0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.resources::-webkit-scrollbar {
  display: none;
}

.chip {
  flex: 0 0 auto;
  min-height: 32px;
  padding: 2px 8px 2px 4px;
  font-size: 13px;
}

.chip .sprite-res {
  width: 22px;
  height: 22px;
}

.hud-ico,
.glyph {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  color: var(--ink);
}

.hud-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
}

.icon-btn {
  position: relative;
  display: grid;
  place-items: center;
  width: 44px;
  min-width: 44px;
  min-height: 44px;
  padding: 0;
}

.dot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--danger);
  box-shadow: 0 0 0 2px var(--plate);
}

.page {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  padding: 8px 8px 6px;
}

.page > * {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  animation: page-in var(--motion) ease;
}

@keyframes page-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.page.workshop > * {
  overflow: hidden;
}

.dock {
  z-index: var(--z-dock);
  display: flex;
  gap: 6px;
  flex: 0 0 auto;
  padding: var(--dock-pad-y) 8px calc(var(--dock-pad-y) + env(safe-area-inset-bottom, 0px));
  background:
    var(--paper-grain),
    linear-gradient(0deg, #fffdf6, var(--paper));
  background-blend-mode: multiply, normal;
  border-top: var(--border) solid var(--gold);
  box-shadow: 0 -2px 0 var(--gold-deep);
}

.dock button {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  flex: 1 1 0;
  min-width: 0;
  min-height: var(--dock-item-min-h);
  padding: 4px;
  font-family: var(--font-display);
  font-size: 12px;
  letter-spacing: 0.08em;
}

.dock button.on {
  color: var(--ink);
  background: linear-gradient(#ffe27a, #f0b83a);
  box-shadow: 0 3px 0 var(--shadow), inset 0 1px 0 rgba(255, 255, 255, 0.55);
  opacity: 1;
  filter: none;
}

.dock .ui-ico {
  width: 18px;
  height: 18px;
}

@media (prefers-reduced-motion: reduce) {
  .page > * {
    animation: none;
  }
}
</style>
