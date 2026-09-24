<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { playerDisplayName, type PlayerAvatarId } from '../sim/createSave'
import { APP_TABS, appTab, selectAppTab } from './appNav'
import { dockStationHp } from './dockStationHp'
import { useGameStore } from './gameStore'
import EncounterPanel from './encounterPanel.vue'
import PvpPanel from './pvpPanel.vue'
import MessagePanel from './messagePanel.vue'
import SettingsPanel from './settingsPanel.vue'
import TechPanel from './techPanel.vue'
import WorkersPanelV2 from './workersPanelV2.vue'
import FloatTips from './floatTips.vue'
import GuideQuestFloat from './guideQuestFloat.vue'
import {
  hudChipAmount,
  hudChipAriaLabel,
  hudChipDetail,
  listHudChips,
  type HudChipId,
} from './hudResource'
import HudResourceSheet from './hudResourceSheet.vue'
import PlayerAvatar from './playerAvatar.vue'
import PlayerProfileSheet from './playerProfileSheet.vue'
import UiIcon from './uiIcon.vue'

const game = useGameStore()
const tab = appTab
const mailOpen = ref(false)
const settingsOpen = ref(false)
const resourceOpen = ref<HudChipId | null>(null)
const profileOpen = ref(false)
const playerName = computed(() => playerDisplayName(game.save.playerName))
const chips = computed(() => listHudChips(game.save))
const stationHp = computed(() => dockStationHp(game.save))
const resourceDetail = computed(() => (resourceOpen.value ? hudChipDetail(game.save, resourceOpen.value) : null))

onMounted(() => {
  game.startClock()
})

onUnmounted(() => {
  game.stopClock()
})

function confirmProfile(payload: { name: string; avatarId: PlayerAvatarId }) {
  game.setPlayerProfile(payload.name, payload.avatarId)
  profileOpen.value = false
}
</script>

<template>
  <div class="shell">
    <header class="hud" aria-label="资源">
      <button type="button" class="player" aria-label="玩家" @click="profileOpen = true">
        <PlayerAvatar :id="game.save.playerAvatarId" />
        <span class="player-name">{{ playerName }}</span>
      </button>
      <div class="resources">
        <button
          v-for="chip in chips"
          :key="chip.id"
          type="button"
          class="chip"
          :aria-label="hudChipAriaLabel(game.save, chip)"
          @click="resourceOpen = chip.id"
        >
          <i v-if="chip.id === 'gold'" class="sprite sprite-res gold" aria-hidden="true" />
          <i v-else-if="chip.id === 'diamonds'" class="sprite sprite-res diamonds" aria-hidden="true" />
          <i v-else-if="chip.id === 'workers'" class="sprite sprite-res workers" aria-hidden="true" />
          <svg v-else-if="chip.id === 'knight'" class="hud-ico" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M14.6 3.4 20.6 9.4 19.2 10.8 17.5 9.1 8.8 17.8v2.3h2.3l1.6-1.6 1.4 1.4-4.4 4.4-1.4-1.4.7-.7H3.8v-4.8l-.7.7-1.4-1.4 4.4-4.4 1.4 1.4-1.6 1.6H8.2v2.3l8.7-8.7-1.7-1.7z"
            />
          </svg>
          <span v-if="chip.kind === 'item'">{{ chip.name }} {{ hudChipAmount(game.save, chip.id) }}</span>
          <span v-else>{{ hudChipAmount(game.save, chip.id) }}</span>
        </button>
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
      <WorkersPanelV2 v-if="tab === 'workshop'" />
      <EncounterPanel v-else-if="tab === 'encounters'" />
      <PvpPanel v-else-if="tab === 'pvp'" />
      <TechPanel v-else />
    </main>

    <nav class="dock" role="tablist" aria-label="主界面页签">
      <div class="dock-hp" aria-hidden="true">
        <i v-for="cell in stationHp" :key="cell.stationId" class="cell">
          <b class="fill" :class="cell.tone" :style="{ width: `${(cell.fill * 100).toFixed(2)}%` }" />
        </i>
      </div>
      <div class="dock-tabs">
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
      </div>
    </nav>

    <GuideQuestFloat />
    <MessagePanel v-if="mailOpen" @close="mailOpen = false" />
    <SettingsPanel v-if="settingsOpen" @close="settingsOpen = false" />
    <HudResourceSheet v-if="resourceDetail" :detail="resourceDetail" @close="resourceOpen = null" />
    <PlayerProfileSheet
      v-if="profileOpen"
      :name="game.save.playerName"
      :avatar-id="game.save.playerAvatarId"
      @close="profileOpen = false"
      @confirm="confirmProfile"
    />
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

.player {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 1 auto;
  max-width: 46%;
  min-height: 36px;
  padding: 2px 8px 2px 2px;
  border-radius: 999px;
}

.player-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 5.5em;
  font-size: 13px;
  font-weight: 700;
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

.resources > .chip:hover:not(:disabled) {
  filter: brightness(1.03);
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

.page.workshop > *,
.page.workers > * {
  overflow: hidden;
}

.dock {
  z-index: var(--z-dock);
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 0 0 auto;
  padding: var(--dock-pad-y) 8px calc(var(--dock-pad-y) + env(safe-area-inset-bottom, 0px));
  background:
    var(--paper-grain),
    linear-gradient(0deg, #fffdf6, var(--paper));
  background-blend-mode: multiply, normal;
  border-top: var(--border) solid var(--gold);
  box-shadow: 0 -2px 0 var(--gold-deep);
}

.dock-hp {
  display: flex;
  gap: 3px;
  height: 5px;
  pointer-events: none;
}

.dock-hp .cell {
  flex: 1 1 0;
  min-width: 0;
  height: 5px;
  overflow: hidden;
  border-radius: 1px;
  background: linear-gradient(180deg, #efe0b0, var(--bar-track));
}

.dock-hp .fill {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #e0b020, #a8700c);
}

.dock-hp .fill.full {
  background: linear-gradient(90deg, #6fc43a, #2d7a1c);
}

.dock-hp .fill.low {
  background: linear-gradient(90deg, #d04a38, #a02820);
}

.dock-tabs {
  display: flex;
  gap: 4px;
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
  padding: 4px 2px;
  font-family: var(--font-display);
  font-size: 11px;
  letter-spacing: 0.02em;
}

.dock button.on {
  color: var(--ink);
  background: linear-gradient(#ffe27a, #f0b83a);
  box-shadow: 0 3px 0 var(--shadow), inset 0 1px 0 rgba(255, 255, 255, 0.55);
  opacity: 1;
  filter: none;
}

.dock .ui-ico {
  width: 24px;
  height: 24px;
}

@media (prefers-reduced-motion: reduce) {
  .page > * {
    animation: none;
  }
}
</style>
