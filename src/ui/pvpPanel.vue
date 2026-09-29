<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { isGuideQuestFlash } from '../sim/guideQuest'
import { isModuleUnlocked, moduleLockedTip } from '../sim/moduleUnlock'
import { pushFloatTip } from './floatTips'
import { unlockFlashKey } from './moduleUnlockNav'
import { useGameStore } from './gameStore'
import HelpMark from './helpMark.vue'
import ModeHelpSheet from './modeHelpSheet.vue'
import { modeHelpOf, type ModeHelpId } from './modeHelp'
import { bootPvpView, PVP_VIEW_LABELS, PVP_VIEWS, pvpView, selectPvpView } from './pvpTabs'
import BeastPvpPanel from './beastPvpPanel.vue'
import HerbPvpPanel from './herbPvpPanel.vue'
import TreasureMinePanel from './treasureMinePanel.vue'

bootPvpView()
const game = useGameStore()
const helpOpen = ref(false)

function viewModule(id: (typeof PVP_VIEWS)[number]): 'herb' | 'beast' | 'treasure' {
  if (id === 'herb') return 'herb'
  if (id === 'beast') return 'beast'
  return 'treasure'
}

function viewLocked(id: (typeof PVP_VIEWS)[number]) {
  return !isModuleUnlocked(game.save, viewModule(id))
}

function isGuideFlash(id: (typeof PVP_VIEWS)[number]) {
  return isGuideQuestFlash(game.save, viewModule(id))
}

function onView(id: (typeof PVP_VIEWS)[number]) {
  if (viewLocked(id)) {
    pushFloatTip(moduleLockedTip(viewModule(id)), 'err')
    return
  }
  selectPvpView(id)
}

watch(
  () => [pvpView.value, game.save.knightLevel, (game.save.openedModules ?? []).join(',')] as const,
  () => {
    if (!viewLocked(pvpView.value)) return
    const next = PVP_VIEWS.find((id) => !viewLocked(id))
    if (next) selectPvpView(next)
  },
  { immediate: true },
)

function helpId(): ModeHelpId {
  if (pvpView.value === 'herb' || pvpView.value === 'beast') return pvpView.value
  return 'treasure'
}

const help = computed(() => modeHelpOf(helpId()))
</script>

<template>
  <section class="panel">
    <div class="head page-head">
      <h2 class="title">PVP</h2>
      <nav class="sub" role="tablist" aria-label="PVP玩法">
        <button
          v-for="id in PVP_VIEWS"
          :key="id"
          type="button"
          role="tab"
          :aria-selected="pvpView === id"
          :class="{
            on: pvpView === id,
            locked: viewLocked(id),
            'guide-flash': isGuideFlash(id),
            'unlock-pulse': unlockFlashKey === `pvp:${id}`,
          }"
          @click="onView(id)"
        >
          {{ PVP_VIEW_LABELS[id] }}
          <i v-if="viewLocked(id)" class="lock" aria-hidden="true" />
        </button>
      </nav>
      <HelpMark @click="helpOpen = true" />
    </div>
    <TreasureMinePanel v-if="pvpView === 'treasure'" />
    <HerbPvpPanel v-else-if="pvpView === 'herb'" />
    <BeastPvpPanel v-else />
    <ModeHelpSheet v-if="helpOpen" :title="help.title" :rows="help.rows" @close="helpOpen = false" />
  </section>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 12px 10px;
}

.head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 4px;
  background: var(--paper);
}

.title {
  margin: 0;
  font-size: 20px;
}

.sub {
  display: flex;
  flex: 1 1 auto;
  align-items: stretch;
  gap: 2px;
  min-width: 0;
  padding: 3px;
  border: 2px solid var(--gold);
  border-radius: var(--radius-pill);
  background: var(--wood-face);
}

.sub button {
  position: relative;
  flex: 1 1 0;
  min-height: 32px;
  padding: 4px 10px;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  box-shadow: none;
  color: var(--muted);
  font-family: var(--font-display);
  font-size: 14px;
  letter-spacing: 0.08em;
}

.sub button.locked {
  filter: grayscale(1);
  opacity: 0.5;
}

.sub button .lock {
  position: absolute;
  top: 4px;
  right: 6px;
  width: 7px;
  height: 6px;
  border: 1.5px solid currentColor;
  border-radius: 1px;
}

.sub button .lock::before {
  content: '';
  position: absolute;
  left: 0;
  top: -5px;
  width: 5px;
  height: 4px;
  border: 1.5px solid currentColor;
  border-bottom: 0;
  border-radius: 4px 4px 0 0;
}

.sub button.unlock-pulse {
  animation: unlock-pulse 0.45s ease-in-out 3;
}

@keyframes unlock-pulse {
  50% {
    box-shadow: 0 0 0 4px rgba(240, 184, 58, 0.65);
  }
}

.sub button.on {
  color: var(--ink);
  background: var(--tab-on);
  box-shadow: 0 2px 6px rgba(212, 160, 23, 0.32);
}

</style>
