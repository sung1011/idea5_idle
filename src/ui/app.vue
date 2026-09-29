<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { playerDisplayName, type PlayerAvatarId } from '../sim/createSave'
import { bannerFrameOf, bannerLevelOf, treasureAssaultWarning } from '../sim/treasureMine'
import { appTabLockedTip, isAppTabUnlocked, isModuleId, isModuleUnlocked, moduleBlurb, moduleLabel } from '../sim/moduleUnlock'
import { APP_TABS, appTab, selectAppTab } from './appNav'
import { dockStationHp, showDockStationHp } from './dockStationHp'
import { dismissUpdateBubble, refreshToNewVersion, startAppUpdateSchedule, updateBubble, updateReady } from './appUpdateState'
import AppUpdateBubble from './appUpdateBubble.vue'
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
import KnightLevelSheet from './knightLevelSheet.vue'
import { knightXpPop, knightXpPopToken } from './knightXpToast'
import PlayerAvatar from './playerAvatar.vue'
import PlayerProfileSheet from './playerProfileSheet.vue'
import UiIcon from './uiIcon.vue'
import { pushFloatTip } from './floatTips'
import { openUnlockedModule, unlockFlashKey } from './moduleUnlockNav'

const game = useGameStore()
let stopAppUpdate: (() => void) | null = null
const tab = appTab
const mailOpen = ref(false)
const settingsOpen = ref(false)
const settingsBtn = ref<HTMLButtonElement | null>(null)
const resourceOpen = ref<HudChipId | null>(null)
const knightOpen = ref(false)
const knightBtn = ref<HTMLButtonElement | null>(null)
const xpText = ref(0)
const xpStyle = ref<{ left: string; top: string }>({ left: '0px', top: '0px' })
const knightJump = ref(false)
let xpTimer = 0
let jumpTimer = 0
const profileOpen = ref(false)
const playerName = computed(() => playerDisplayName(game.save.playerName))
const bannerFrame = computed(() => bannerFrameOf(bannerLevelOf(game.save)))
const assaultAlert = computed(
  () => isModuleUnlocked(game.save, 'treasure') && treasureAssaultWarning(game.save),
)
const unlockNotice = computed(() => {
  const id = game.save.moduleUnlockQueue?.[0]
  return isModuleId(id) ? id : null
})
const chips = computed(() => listHudChips(game.save))
const stationHp = computed(() => dockStationHp(game.save))
const showStationHp = computed(() => showDockStationHp(tab.value))
const resourceDetail = computed(() => (resourceOpen.value ? hudChipDetail(game.save, resourceOpen.value) : null))

onMounted(() => {
  game.startClock()
  stopAppUpdate = startAppUpdateSchedule()
})

onUnmounted(() => {
  game.stopClock()
  stopAppUpdate?.()
  stopAppUpdate = null
})

function setKnightBtn(el: unknown) {
  knightBtn.value = el instanceof HTMLButtonElement ? el : null
}

function placeXpPop() {
  const el = knightBtn.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  xpStyle.value = { left: `${rect.right + 6}px`, top: `${rect.top + rect.height / 2}px` }
}

function onChip(id: HudChipId) {
  if (id === 'knight') {
    knightOpen.value = true
    return
  }
  resourceOpen.value = id
}

function confirmProfile(payload: { name: string; avatarId: PlayerAvatarId }) {
  game.setPlayerProfile(payload.name, payload.avatarId)
  profileOpen.value = false
}

function tabLocked(id: (typeof APP_TABS)[number]['id']) {
  return !isAppTabUnlocked(game.save, id)
}

function onDock(id: (typeof APP_TABS)[number]['id']) {
  if (tabLocked(id)) {
    if (id === 'tech' || id === 'pvp') pushFloatTip(appTabLockedTip(game.save, id), 'err')
    return
  }
  selectAppTab(id)
}

function onUnlockGo() {
  const id = unlockNotice.value
  game.dismissModuleUnlock()
  if (id) openUnlockedModule(id)
}

watch(knightXpPopToken, () => {
  if (knightXpPop.value <= 0) return
  xpText.value = knightXpPop.value
  placeXpPop()
  window.clearTimeout(xpTimer)
  xpTimer = window.setTimeout(() => {
    xpText.value = 0
  }, 1100)
})

watch(
  () => game.save.knightLevel,
  (next, prev) => {
    if (prev == null || next === prev) return
    knightJump.value = true
    window.clearTimeout(jumpTimer)
    jumpTimer = window.setTimeout(() => {
      knightJump.value = false
    }, 480)
  },
)

watch(
  () => [tab.value, game.save.knightLevel, (game.save.openedModules ?? []).join(',')] as const,
  () => {
    if (!isAppTabUnlocked(game.save, tab.value)) selectAppTab('workshop')
  },
  { immediate: true },
)
</script>

<template>
  <div class="shell">
    <header class="hud" aria-label="资源">
      <button type="button" class="player" aria-label="玩家" @click="profileOpen = true">
        <span class="chief-face">
          <PlayerAvatar :id="game.save.playerAvatarId" :frame="bannerFrame" />
          <span class="lv-badge">{{ hudChipAmount(game.save, 'knight') }}</span>
        </span>
        <span class="player-name">{{ playerName }}</span>
      </button>
      <div class="resources">
        <button
          v-for="chip in chips"
          :key="chip.id"
          type="button"
          class="chip"
          :class="{ 'knight-jump': chip.id === 'knight' && knightJump }"
          :ref="chip.id === 'knight' ? setKnightBtn : undefined"
          :aria-label="hudChipAriaLabel(game.save, chip)"
          @click="onChip(chip.id)"
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
          <span v-else :class="{ 'level-jump': chip.id === 'knight' && knightJump }">{{
            hudChipAmount(game.save, chip.id)
          }}</span>
        </button>
      </div>
      <i v-if="xpText" class="xp-pop" :style="xpStyle">+{{ xpText }} 经验</i>
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
        <button
          ref="settingsBtn"
          type="button"
          class="icon-btn"
          :class="{ unread: updateReady }"
          :aria-label="updateReady ? '设置，有新版本' : '设置'"
          @click="settingsOpen = true"
        >
          <svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M19.1 12.7a7.4 7.4 0 0 0 .1-1.4 7.4 7.4 0 0 0-.1-1.4l2-1.6a.5.5 0 0 0 .1-.6l-1.9-3.3a.5.5 0 0 0-.6-.2l-2.4 1a7 7 0 0 0-2.4-1.4l-.4-2.5a.5.5 0 0 0-.5-.4h-3.8a.5.5 0 0 0-.5.4l-.4 2.5a7 7 0 0 0-2.4 1.4l-2.4-1a.5.5 0 0 0-.6.2L2.7 7.7a.5.5 0 0 0 .1.6l2 1.6a7.4 7.4 0 0 0-.1 1.4 7.4 7.4 0 0 0 .1 1.4l-2 1.6a.5.5 0 0 0-.1.6l1.9 3.3a.5.5 0 0 0 .6.2l2.4-1a7 7 0 0 0 2.4 1.4l.4 2.5a.5.5 0 0 0 .5.4h3.8a.5.5 0 0 0 .5-.4l.4-2.5a7 7 0 0 0 2.4-1.4l2.4 1a.5.5 0 0 0 .6-.2l1.9-3.3a.5.5 0 0 0-.1-.6Zm-7.1 2.1A2.8 2.8 0 1 1 14.8 12 2.8 2.8 0 0 1 12 14.8Z"
            />
          </svg>
          <i v-if="updateReady" class="dot" />
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
      <div v-if="showStationHp" class="dock-hp" aria-hidden="true">
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
          :class="{
            on: tab === t.id,
            locked: tabLocked(t.id),
            'unlock-pulse': unlockFlashKey === `tab:${t.id}`,
          }"
          @click="onDock(t.id)"
        >
          <UiIcon :name="t.id" />
          <span>{{ t.label }}</span>
          <i v-if="tabLocked(t.id)" class="lock" aria-hidden="true" />
          <i v-if="t.id === 'pvp' && assaultAlert && !tabLocked(t.id)" class="dot" />
        </button>
      </div>
    </nav>

    <AppUpdateBubble
      v-if="updateBubble && !settingsOpen"
      :version="updateBubble.version"
      :lines="updateBubble.lines"
      :anchor="settingsBtn"
      @close="dismissUpdateBubble"
      @refresh="refreshToNewVersion"
    />
    <GuideQuestFloat />
    <div v-if="unlockNotice" class="unlock-card" role="dialog" aria-label="新玩法开放">
      <div class="unlock-sheet">
        <p class="unlock-kicker">新玩法开放</p>
        <h3>{{ moduleLabel(unlockNotice) }}</h3>
        <p class="unlock-blurb">{{ moduleBlurb(unlockNotice) }}</p>
        <button type="button" class="unlock-go" @click="onUnlockGo">前往</button>
      </div>
    </div>
    <MessagePanel v-if="mailOpen" @close="mailOpen = false" />
    <SettingsPanel v-if="settingsOpen" @close="settingsOpen = false" />
    <KnightLevelSheet v-if="knightOpen" @close="knightOpen = false" />
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
  overflow: hidden;
  padding-top: env(safe-area-inset-top);
}

.hud {
  position: sticky;
  top: 0;
  z-index: var(--z-hud);
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 44px;
  min-width: 0;
  padding: 4px 6px;
  background:
    var(--paper-grain),
    var(--wood-face);
  background-blend-mode: multiply, normal;
  border-bottom: 3px solid var(--gold);
  box-shadow: 0 2px 0 var(--gold-deep);
}

.player {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 1 auto;
  max-width: 108px;
  min-width: 0;
  min-height: 36px;
  padding: 1px 6px 1px 2px;
  border-color: transparent;
  border-radius: 999px;
  background: transparent;
  box-shadow: none;
}

.player:active:not(:disabled) {
  transform: none;
  box-shadow: none;
}

.chief-face {
  position: relative;
  display: grid;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
}

.lv-badge {
  position: absolute;
  right: -7px;
  bottom: -2px;
  z-index: 2;
  min-width: 24px;
  height: 14px;
  padding: 0 3px;
  border: 2px solid var(--stroke);
  border-radius: var(--radius-pill);
  background: var(--accent-face);
  color: #3a2208;
  font-family: var(--font-mono);
  font-size: 8px;
  font-weight: 900;
  line-height: 10px;
  letter-spacing: 0;
  text-align: center;
  pointer-events: none;
  box-shadow: 0 1px 0 var(--stroke-deep);
}

.player-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 4em;
  font-size: 12px;
  font-weight: 700;
}

.resources {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 3px;
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
  min-height: 28px;
  padding: 1px 5px 1px 2px;
  gap: 2px;
  border-width: 2px;
  font-size: 12px;
}

.level-jump {
  display: inline-block;
  animation: knight-level-jump 0.42s ease;
}

.xp-pop {
  position: fixed;
  z-index: calc(var(--z-hud) + 2);
  margin: 0;
  font-style: normal;
  font-weight: 800;
  font-size: 13px;
  color: #8a4b12;
  text-shadow: 0 1px 0 #fff8e8;
  pointer-events: none;
  animation: knight-xp-pop 1.05s ease-out forwards;
}

@keyframes knight-level-jump {
  0% {
    transform: scale(1);
  }
  35% {
    transform: scale(1.28);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes knight-xp-pop {
  0% {
    opacity: 0;
    transform: translateY(6px);
  }
  18% {
    opacity: 1;
    transform: translateY(0);
  }
  100% {
    opacity: 0;
    transform: translateY(-16px);
  }
}

.resources > .chip:hover:not(:disabled) {
  filter: brightness(1.03);
}

.chip .sprite-res {
  width: 16px;
  height: 16px;
}

.hud-ico,
.glyph {
  width: 16px;
  height: 16px;
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
  width: 36px;
  min-width: 36px;
  min-height: 36px;
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
  width: 100%;
  min-width: 0;
  max-width: 100%;
  padding: var(--dock-pad-y) 8px calc(var(--dock-pad-y) + env(safe-area-inset-bottom, 0px));
  background:
    var(--paper-grain),
    var(--wood-face);
  background-blend-mode: multiply, normal;
  border-top: var(--border) solid var(--gold);
  box-shadow: 0 -2px 0 var(--gold-deep);
}

.dock-hp {
  display: flex;
  gap: 3px;
  height: 5px;
  width: 100%;
  min-width: 0;
  pointer-events: none;
}

.dock-hp .cell {
  flex: 1 1 0;
  min-width: 0;
  height: 5px;
  overflow: hidden;
  border-radius: 1px;
  background: var(--bar-track-face);
}

.dock-hp .fill {
  display: block;
  height: 100%;
  max-width: 100%;
  background: linear-gradient(90deg, #e0b020, #a8700c);
}

.dock-hp .fill.full {
  background: linear-gradient(90deg, #c6ff6a, #2fbf32);
}

.dock-hp .fill.low {
  background: linear-gradient(90deg, #d04a38, #a02820);
}

.dock-tabs {
  display: flex;
  gap: 4px;
  width: 100%;
  min-width: 0;
}

.dock button {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  flex: 1 1 0;
  min-width: 0;
  min-height: var(--dock-item-min-h);
  padding: 4px 2px;
  border-radius: 12px;
  font-family: var(--font-display);
  font-size: 11px;
  letter-spacing: 0.02em;
}

.dock button.locked {
  filter: grayscale(1);
  opacity: 0.55;
}

.dock button .lock {
  position: absolute;
  top: 4px;
  right: 8px;
  width: 8px;
  height: 8px;
  border: 1.5px solid currentColor;
  border-radius: 2px;
}

.dock button .lock::before {
  content: '';
  position: absolute;
  left: 1px;
  top: -5px;
  width: 4px;
  height: 4px;
  border: 1.5px solid currentColor;
  border-bottom: 0;
  border-radius: 4px 4px 0 0;
}

.dock button.unlock-pulse {
  animation: unlock-pulse 0.45s ease-in-out 3;
}

@keyframes unlock-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(240, 184, 58, 0.2);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(240, 184, 58, 0.55);
  }
}

.unlock-card {
  position: absolute;
  inset: 0;
  z-index: calc(var(--z-sheet) + 2);
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(8, 28, 14, 0.58);
}

.unlock-sheet {
  width: min(280px, 100%);
  padding: 16px 16px 14px;
  border: 3px solid var(--stroke);
  border-radius: 16px;
  background: var(--wood-face);
  background-blend-mode: multiply, normal;
  box-shadow: 0 4px 0 var(--stroke);
  text-align: center;
  color: var(--ink);
}

.unlock-kicker {
  margin: 0;
  color: #8a5a12;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.unlock-sheet h3 {
  margin: 6px 0 0;
  font-size: 22px;
}

.unlock-blurb {
  margin: 8px 0 0;
  font-size: 14px;
  line-height: 1.4;
}

.unlock-go {
  width: 100%;
  margin-top: 12px;
  min-height: 36px;
  border: 3px solid var(--stroke);
  border-radius: 12px;
  background: var(--accent-face);
  color: #3a2208;
  box-shadow: 0 3px 0 var(--stroke);
  font-weight: 800;
}

.dock button.on {
  color: #14300c;
  background: var(--tab-on);
  border-color: #1d5a16;
  box-shadow: 0 3px 0 #1a4a14, inset 0 1px 0 rgba(255, 255, 255, 0.55);
  opacity: 1;
  filter: none;
}

.dock button:disabled,
.dock button.locked {
  color: #6d665c;
  background: #cfc6ba;
  filter: grayscale(0.85);
  opacity: 0.72;
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
