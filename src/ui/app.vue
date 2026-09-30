<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { campDockCount, campDockTone } from '../sim/campDock'
import { playerDisplayName, type PlayerAvatarId } from '../sim/createSave'
import { guideFuseCue, guideQuestFlashId, isGuideQuestFlash } from '../sim/guideQuest'
import { xpToNextKnightLevel } from '../sim/knightLevel'
import { bannerFrameOf, bannerLevelOf, treasureAssaultWarning } from '../sim/treasureMine'
import { appTabLockedTip, isAppTabUnlocked, isModuleUnlocked, moduleNoticeOn } from '../sim/moduleUnlock'
import { mainlineStepOf } from '../sim/mainlineQuest'
import { APP_TABS, appTab, selectAppTab } from './appNav'
import CampSheet from './campSheet.vue'
import { campSheetOpen, toggleCampSheet } from './campDockNav'
import { guideExploreCue } from './guideExploreCue'
import { guideCampOpenRequest, guideCampSheetOpen, takeGuideCampOpenRequest } from './guideQuestNav'
import { mainlineTab } from './mainlineTabs'
import { dockStationHp, showDockStationHp } from './dockStationHp'
import { shouldShowAddToHomeBubble, type AddToHomeGuide } from './addToHome'
import { addToHomeChoiceNow, addToHomeDismissedNow, markAddToHomeDismissed, requestAddToHome, startAddToHomeWatch } from './addToHomeState'
import { dismissUpdateBubble, refreshToNewVersion, startAppUpdateSchedule, updateBubble, updateReady } from './appUpdateState'
import AddToHomeBubble from './addToHomeBubble.vue'
import AppUpdateBubble from './appUpdateBubble.vue'
import { useGameStore } from './gameStore'
import EncounterPanel from './encounterPanel.vue'
import PvpPanel from './pvpPanel.vue'
import MessagePanel from './messagePanel.vue'
import SettingsPanel from './settingsPanel.vue'
import TechPanel from './techPanel.vue'
import WorkersPanelV2 from './workersPanelV2.vue'
import WorkshopActivityBar from './workshopActivityBar.vue'
import FloatTips from './floatTips.vue'
import GuideQuestFloat from './guideQuestFloat.vue'
import { formatHudGrouped } from './formatHud'
import {
  hudChipAriaLabel,
  hudChipDetail,
  hudChipGrouped,
  hudChipTone,
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

const game = useGameStore()
let stopAppUpdate: (() => void) | null = null
let stopAddToHome: (() => void) | null = null
const tab = appTab
const mailOpen = ref(false)
const settingsOpen = ref(false)
const settingsBtn = ref<HTMLButtonElement | null>(null)
const addToHomeFollow = ref<AddToHomeGuide | null>(null)
const addToHomeBubbleOn = computed(() =>
  shouldShowAddToHomeBubble({
    choice: addToHomeChoiceNow.value,
    dismissed: addToHomeDismissedNow.value,
    guideQuestStep: game.save.guideQuestStep,
    combatStep: mainlineStepOf('combat'),
  }),
)
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
const chips = computed(() => listHudChips(game.save))
const resourceChips = computed(() => chips.value.filter((chip) => chip.id !== 'knight'))
const knightLevel = computed(() => (Number.isFinite(game.save.knightLevel) ? Math.max(0, Math.floor(game.save.knightLevel)) : 1))
const knightXp = computed(() => (Number.isFinite(game.save.knightXp) ? Math.max(0, Math.floor(game.save.knightXp)) : 0))
const knightNeed = computed(() => xpToNextKnightLevel(knightLevel.value))
const knightXpPct = computed(() => {
  const need = knightNeed.value
  if (need <= 0) return '0%'
  return `${Math.min(100, (knightXp.value / need) * 100).toFixed(2)}%`
})
const knightXpLabel = computed(() => `${formatHudGrouped(knightXp.value)} / ${formatHudGrouped(knightNeed.value)}`)
const stationHp = computed(() => dockStationHp(game.save))
const showStationHp = computed(() => showDockStationHp(tab.value))
const dockLead = APP_TABS.slice(0, 2)
const dockTail = APP_TABS.slice(2)
const campCount = computed(() => campDockCount(game.save))
const campTone = computed(() => campDockTone(game.save))
const campCue = computed(() => guideFuseCue(game.save, guideCampSheetOpen.value))
const campButtonFlash = computed(() => {
  if (campCue.value === 'openCamp') return true
  if (campCue.value === 'wait' && !campSheetOpen.value) return true
  if (campSheetOpen.value) return false
  if (isGuideQuestFlash(game.save, 'potionInstall') || isGuideQuestFlash(game.save, 'potionUse')) return true
  return isGuideQuestFlash(game.save, 'recruit') || campCue.value === 'recruit'
})
const exploreCue = computed(() =>
  guideExploreCue(isGuideQuestFlash(game.save, 'explore'), tab.value === 'encounters', mainlineTab.value),
)
const guideActive = computed(() => guideQuestFlashId(game.save) != null)
const dockGuideRaised = ref(false)
const fingerOn = ref(false)
const fingerLeft = ref('0px')
const fingerTop = ref('0px')
let guideTimer = 0

function syncGuideChrome() {
  if (!guideActive.value) {
    dockGuideRaised.value = false
    fingerOn.value = false
    return
  }
  const nodes = document.querySelectorAll<HTMLElement>('.guide-flash')
  for (const node of nodes) {
    const rect = node.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) continue
    dockGuideRaised.value = node.closest('.dock') != null
    fingerLeft.value = `${Math.round(rect.left + rect.width * 0.62)}px`
    fingerTop.value = `${Math.round(rect.top + rect.height * 0.42)}px`
    fingerOn.value = true
    return
  }
  dockGuideRaised.value = false
  fingerOn.value = false
}
const resourceDetail = computed(() => (resourceOpen.value ? hudChipDetail(game.save, resourceOpen.value) : null))

function openRequestedCamp() {
  if (!takeGuideCampOpenRequest()) return
  campSheetOpen.value = true
}

onMounted(() => {
  game.startClock()
  stopAppUpdate = startAppUpdateSchedule()
  stopAddToHome = startAddToHomeWatch()
  openRequestedCamp()
  syncGuideChrome()
  window.addEventListener('resize', syncGuideChrome)
  guideTimer = window.setInterval(syncGuideChrome, 200)
})

onUnmounted(() => {
  game.stopClock()
  stopAppUpdate?.()
  stopAppUpdate = null
  stopAddToHome?.()
  stopAddToHome = null
  window.removeEventListener('resize', syncGuideChrome)
  window.clearInterval(guideTimer)
})

watch([guideActive, tab, exploreCue, campButtonFlash], () => {
  void nextTick(syncGuideChrome)
})

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

function dockNotice(id: (typeof APP_TABS)[number]['id']) {
  if (tabLocked(id)) return false
  if (id === 'tech') return moduleNoticeOn(game.save, 'tech')
  if (id === 'pvp') {
    return moduleNoticeOn(game.save, 'herb') || moduleNoticeOn(game.save, 'beast') || moduleNoticeOn(game.save, 'treasure')
  }
  return false
}

function onDock(id: (typeof APP_TABS)[number]['id']) {
  if (tabLocked(id)) {
    if (id === 'tech' || id === 'pvp') pushFloatTip(appTabLockedTip(game.save, id), 'err')
    return
  }
  selectAppTab(id)
  if (id === 'tech') game.markModuleSeen('tech')
}

function onCamp() {
  toggleCampSheet()
}

function closeAddToHomeBubble() {
  markAddToHomeDismissed()
  addToHomeFollow.value = null
}

async function onAddToHomeBubble() {
  markAddToHomeDismissed()
  const choice = addToHomeChoiceNow.value
  if (choice === 'ios' || choice === 'external') addToHomeFollow.value = choice
  const result = await requestAddToHome()
  if (addToHomeChoiceNow.value === 'hidden') {
    addToHomeFollow.value = null
    return
  }
  if (result === 'ios' || result === 'external' || result === 'wait') addToHomeFollow.value = result
  else addToHomeFollow.value = null
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

watch(
  campSheetOpen,
  (open) => {
    guideCampSheetOpen.value = open
  },
  { immediate: true },
)

watch(guideCampOpenRequest, openRequestedCamp)

watch(addToHomeChoiceNow, (choice) => {
  if (choice === 'hidden') addToHomeFollow.value = null
})
</script>

<template>
  <div class="shell">
    <header class="hud" aria-label="资源">
      <div class="chief">
        <button type="button" class="player" aria-label="酋长等级" @click="knightOpen = true">
          <span class="chief-face" :class="{ 'knight-jump': knightJump }">
            <PlayerAvatar :id="game.save.playerAvatarId" :frame="bannerFrame" />
            <span class="lv-badge">Lv{{ knightLevel }}</span>
          </span>
        </button>
        <button type="button" class="player-name" :aria-label="`玩家 ${playerName}`" @click="profileOpen = true">
          {{ playerName }}
        </button>
      </div>
      <div class="hud-stack">
        <div class="resources">
          <button
            v-for="chip in resourceChips"
            :key="chip.id"
            type="button"
            class="chip"
            :class="`tone-${hudChipTone(chip.id)}`"
            :aria-label="hudChipAriaLabel(game.save, chip)"
            @click="onChip(chip.id)"
          >
            <i v-if="chip.id === 'gold'" class="sprite sprite-res gold" aria-hidden="true" />
            <i v-else-if="chip.id === 'diamonds'" class="sprite sprite-res diamonds" aria-hidden="true" />
            <i v-else-if="chip.id === 'workers'" class="sprite sprite-res workers" aria-hidden="true" />
            <i v-else class="mark" aria-hidden="true">{{ chip.name.slice(0, 1) }}</i>
            <span class="qty">{{ hudChipGrouped(game.save, chip.id) }}</span>
          </button>
        </div>
        <button
          ref="knightBtn"
          type="button"
          class="xp-meter"
          :aria-label="`酋长经验 ${knightXpLabel}`"
          @click="knightOpen = true"
        >
          <span class="xp-track">
            <i class="xp-fill" :style="{ width: knightXpPct }" />
          </span>
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
      <WorkshopActivityBar v-if="tab === 'workshop'" />
      <WorkersPanelV2 v-if="tab === 'workshop'" />
      <EncounterPanel v-else-if="tab === 'encounters'" />
      <PvpPanel v-else-if="tab === 'pvp'" />
      <TechPanel v-else />
    </main>

    <nav class="dock" :class="{ 'guide-raised': dockGuideRaised }" role="tablist" aria-label="主界面页签">
      <div v-if="showStationHp" class="dock-hp" aria-hidden="true">
        <i v-for="cell in stationHp" :key="cell.stationId" class="cell" :class="{ empty: cell.empty }">
          <b
            v-if="!cell.empty"
            class="fill"
            :class="cell.tone"
            :style="{ width: `${(cell.fill * 100).toFixed(2)}%` }"
          />
        </i>
      </div>
      <div class="dock-tabs">
        <button
          v-for="t in dockLead"
          :key="t.id"
          type="button"
          role="tab"
          :aria-selected="tab === t.id"
          :class="{
            on: tab === t.id,
            locked: tabLocked(t.id),
            'guide-flash': exploreCue === 'dock' && t.id === 'encounters',
          }"
          @click="onDock(t.id)"
        >
          <UiIcon :name="t.id" />
          <span>{{ t.label }}</span>
          <i v-if="tabLocked(t.id)" class="lock" aria-hidden="true" />
          <i v-else-if="dockNotice(t.id)" class="notice" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="camp-fab"
          :class="[campTone, { 'guide-flash': campButtonFlash, open: campSheetOpen }]"
          :aria-pressed="campSheetOpen"
          :aria-label="campTone === 'blocked' ? '营地，堵队' : campTone === 'ready' ? `营地，可派 ${campCount}` : '营地'"
          @click="onCamp"
        >
          <b v-if="campTone === 'blocked'" class="camp-mark">堵</b>
          <b v-else-if="campTone === 'ready'" class="camp-num">{{ campCount }}</b>
          <UiIcon v-else name="workers" />
          <span>营地</span>
        </button>
        <button
          v-for="t in dockTail"
          :key="t.id"
          type="button"
          role="tab"
          :aria-selected="tab === t.id"
          :class="{
            on: tab === t.id,
            locked: tabLocked(t.id),
          }"
          @click="onDock(t.id)"
        >
          <UiIcon :name="t.id" />
          <span>{{ t.label }}</span>
          <i v-if="tabLocked(t.id)" class="lock" aria-hidden="true" />
          <i v-else-if="dockNotice(t.id) || (t.id === 'pvp' && assaultAlert)" class="notice" />
        </button>
      </div>
    </nav>

    <CampSheet v-if="campSheetOpen" />

    <AppUpdateBubble
      v-if="updateBubble && !settingsOpen"
      :version="updateBubble.version"
      :lines="updateBubble.lines"
      :gap="updateBubble.gap"
      :anchor="settingsBtn"
      @close="dismissUpdateBubble"
      @refresh="refreshToNewVersion"
    />
    <AddToHomeBubble
      v-if="!updateBubble && !settingsOpen && (addToHomeBubbleOn || addToHomeFollow)"
      :anchor="settingsBtn"
      :guide="addToHomeFollow"
      @close="closeAddToHomeBubble"
      @add="onAddToHomeBubble"
    />
    <GuideQuestFloat :workshop="tab === 'workshop'" />
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
    <div v-if="guideActive" class="guide-mask" aria-hidden="true" />
    <div v-if="fingerOn" class="guide-finger" :style="{ left: fingerLeft, top: fingerTop }" aria-hidden="true">👆</div>
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
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 4px 6px 3px;
  background: transparent;
  border: none;
  box-shadow: none;
}

.chief {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  align-self: stretch;
  flex: 0 0 auto;
  gap: 0;
  width: 52px;
}

.player,
.player-name,
.xp-meter,
.resources > .chip {
  border: none;
  background: transparent;
  box-shadow: none;
}

.player,
.player-name,
.xp-meter {
  min-height: 0;
  padding: 0;
}

.player:active:not(:disabled),
.player-name:active:not(:disabled),
.xp-meter:active:not(:disabled),
.resources > .chip:active:not(:disabled) {
  transform: none;
  box-shadow: none;
  filter: brightness(1.06);
}

.chief-face {
  position: relative;
  display: grid;
  flex: 0 0 auto;
  width: 46px;
  height: 46px;
}

.chief-face :deep(.face) {
  width: 46px;
  height: 46px;
  border-width: 4px;
  border-color: #c4a06a;
  box-shadow:
    0 0 0 3px #5c3a1e,
    inset 0 0 0 2px rgba(255, 248, 230, 0.55);
}

.chief-face :deep(.face svg) {
  width: 30px;
  height: 30px;
}

.chief-face :deep(.face::after) {
  inset: -9px;
  background:
    radial-gradient(circle at 50% 0, #f7f1e4 0 5px, #3a2414 5.2px 6.6px, transparent 7.2px),
    radial-gradient(circle at 50% 100%, #f7f1e4 0 5px, #3a2414 5.2px 6.6px, transparent 7.2px),
    radial-gradient(circle at 0 50%, #f7f1e4 0 5px, #3a2414 5.2px 6.6px, transparent 7.2px),
    radial-gradient(circle at 100% 50%, #f7f1e4 0 5px, #3a2414 5.2px 6.6px, transparent 7.2px);
}

.lv-badge {
  position: absolute;
  right: -8px;
  bottom: -2px;
  z-index: 3;
  display: grid;
  place-items: center;
  min-width: 26px;
  height: 28px;
  padding: 5px 2px 6px;
  border: none;
  border-radius: 0;
  background: linear-gradient(180deg, #f8e7b0 0%, #e2b15a 46%, #a86a28 100%);
  clip-path: polygon(50% 0%, 100% 16%, 86% 62%, 50% 100%, 14% 62%, 0 16%);
  color: #fff8ee;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 900;
  line-height: 1;
  letter-spacing: 0;
  text-align: center;
  text-shadow:
    0 1px 0 #3a2414,
    0 -1px 0 #3a2414,
    1px 0 0 #3a2414,
    -1px 0 0 #3a2414;
  pointer-events: none;
  filter: drop-shadow(0 1px 0 #3a2414);
}

.player-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 52px;
  margin-top: -2px;
  border-radius: 0;
  color: #fff6e0;
  font-size: 9px;
  font-weight: 800;
  line-height: 1.1;
  text-shadow:
    0 1px 0 #1a1208,
    0 0 2px #1a1208;
}

.hud-stack {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  flex: 1 1 auto;
  min-width: 0;
}

.xp-meter {
  position: relative;
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  width: 100%;
  min-width: 0;
  height: 10px;
  padding: 0 8px;
  border: 2px solid #3a2414;
  border-radius: 999px;
  background: linear-gradient(180deg, #4a3018, #24160e);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.45);
  overflow: visible;
}

.xp-meter::before,
.xp-meter::after {
  content: '';
  position: absolute;
  top: 50%;
  width: 12px;
  height: 8px;
  transform: translateY(-50%);
  z-index: 2;
  pointer-events: none;
  background:
    radial-gradient(circle at 3px 50%, #f7f1e4 0 2.6px, #3a2414 2.8px 3.6px, transparent 4px),
    radial-gradient(circle at 9px 50%, #f7f1e4 0 2.6px, #3a2414 2.8px 3.6px, transparent 4px);
}

.xp-meter::before {
  left: -2px;
}

.xp-meter::after {
  right: -2px;
}

.xp-track {
  position: relative;
  flex: 1 1 auto;
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: #1a100c;
}

.xp-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-radius: inherit;
  background: linear-gradient(180deg, #e8ff8a 0%, #7adf3a 42%, #2ea828 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.resources > .chip .qty {
  color: #fff;
  font-weight: 900;
  line-height: 1;
  text-shadow:
    0 1px 0 #1a1208,
    0 -1px 0 #1a1208,
    1px 0 0 #1a1208,
    -1px 0 0 #1a1208,
    1px 1px 0 #1a1208,
    -1px -1px 0 #1a1208;
}

.resources {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 2px 4px;
  width: 100%;
  min-width: 0;
  padding: 0 0 0 10px;
  overflow: hidden;
}

.resources > .chip {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  max-width: 100%;
  height: 20px;
  min-height: 20px;
  margin-left: 6px;
  padding: 0 6px 0 10px;
  gap: 0;
  border: 2px solid #e6b325;
  border-radius: 999px;
  background: linear-gradient(180deg, #3d2a18 0%, #24180f 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 236, 196, 0.16),
    0 1px 0 rgba(0, 0, 0, 0.35);
  font-size: clamp(9px, 2.8vw, 12px);
}

.resources > .chip.tone-gold {
  border-color: #e6b325;
}

.resources > .chip.tone-gem {
  border-color: #c45cff;
}

.resources > .chip.tone-grass {
  border-color: #5dcc3a;
}

.resources > .chip.tone-worker {
  border-color: #e08a3c;
}

.resources > .chip.tone-ore {
  border-color: #d08a4a;
}

.resources > .chip.tone-food {
  border-color: #e25a3a;
}

.resources > .chip.tone-potion {
  border-color: #4ec8d8;
}

.resources > .chip.tone-rune {
  border-color: #6aa4ff;
}

.resources > .chip.tone-wood {
  border-color: #c4924a;
}

.resources > .chip.tone-steel {
  border-color: #c8d0dc;
}

.resources > .chip.tone-beast {
  border-color: #f0e2c0;
}

.resources > .chip.tone-crystal {
  border-color: #7ee0ff;
}

.resources > .chip.tone-hunt {
  border-color: #e24a4a;
}

.resources > .chip.tone-paper {
  border-color: #f0d090;
}

.resources > .chip.tone-misc {
  border-color: #e0c080;
}

.resources > .chip .qty {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.resources > .chip .sprite-res,
.resources > .chip .mark {
  position: absolute;
  left: -11px;
  top: 50%;
  width: 22px;
  height: 22px;
  transform: translateY(-50%);
  filter: drop-shadow(0 1px 0 #1a1208);
}

.resources > .chip .mark {
  display: grid;
  place-items: center;
  border: 2px solid currentColor;
  border-radius: 50%;
  background: radial-gradient(circle at 40% 35%, #5a3e24, #24180f 70%);
  color: #fff6e0;
  font-size: 12px;
  font-style: normal;
  font-weight: 900;
}

.chief-face.knight-jump {
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

.glyph {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  color: var(--ink);
}

.hud-actions {
  display: flex;
  align-items: center;
  align-self: center;
  gap: 2px;
  flex: 0 0 auto;
  margin-left: auto;
}

.icon-btn {
  position: relative;
  display: grid;
  place-items: center;
  width: 32px;
  min-width: 32px;
  min-height: 32px;
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

.page.workshop > .activity-bar {
  flex: 0 0 52px;
  height: 52px;
  overflow: hidden;
}

.dock {
  position: relative;
  z-index: var(--z-dock);
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 0 0 auto;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow: visible;
  padding: var(--dock-pad-y) 8px calc(var(--dock-pad-y) + env(safe-area-inset-bottom, 0px));
  background:
    var(--paper-grain),
    var(--wood-face);
  background-blend-mode: multiply, normal;
  border-top: var(--border) solid var(--gold);
  box-shadow: 0 -2px 0 var(--gold-deep);
}

.dock.guide-raised {
  z-index: calc(var(--z-guide-dim) + 2);
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

.dock-hp .cell.empty {
  background: repeating-linear-gradient(-45deg, #9a9488 0 2px, #d4cfc4 2px 4px);
  box-shadow: inset 0 0 0 1px #c43a2a;
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
  align-items: flex-end;
  gap: 4px;
  width: 100%;
  min-width: 0;
  overflow: visible;
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

.dock button .notice {
  position: absolute;
  top: 4px;
  right: 8px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--danger);
  box-shadow: 0 0 0 2px var(--plate);
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

.dock button.camp-fab {
  flex: 0 0 68px;
  width: 68px;
  height: 68px;
  margin-top: -22px;
  border-radius: 50%;
  border: 3px solid var(--stroke);
  background: var(--wood-face);
  color: #6d5840;
  box-shadow: 0 3px 0 var(--stroke);
}

.dock button.camp-fab .camp-num,
.dock button.camp-fab .camp-mark {
  font-size: 22px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.dock button.camp-fab.ready {
  background: var(--accent-face);
  color: #3a2208;
  animation: camp-breathe 2.4s ease-in-out infinite;
}

.dock button.camp-fab.blocked {
  background: linear-gradient(180deg, #f0785a, #b42318);
  color: #fff8f0;
}

.dock button.camp-fab.open {
  box-shadow: 0 0 0 3px rgba(240, 184, 58, 0.45), 0 3px 0 var(--stroke);
}

@keyframes camp-breathe {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }
  50% {
    transform: translateY(-2px) scale(1.04);
  }
}

@media (prefers-reduced-motion: reduce) {
  .page > * {
    animation: none;
  }

  .dock button.camp-fab.ready {
    animation: none;
  }
}
</style>
