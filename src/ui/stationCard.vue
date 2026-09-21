<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { stationMergeLabel } from '../sim/fuse'
import { gatherStatusText, isGatherFrozen } from '../sim/gather'
import {
  assignedCount,
  assignedWorkers,
  currentSpeed,
  stationBottleneckText,
  stationCycleS,
  stationConsumeGroups,
  type StationConsumeToken,
} from '../sim/query'
import { categoryPickOptions, selectedCategoryDef } from '../sim/stationProgress'
import { isGuideQuestFlash } from '../sim/guideQuest'
import { isStationUnlocked, stationLockedTip } from '../sim/stationUnlock'
import { pushFloatTip } from './floatTips'
import { stationConflictHint } from '../sim/tech'
import { STATION_DEF, STATION_WORKER_CAP, xpToNextLevel } from '../sim/tables'
import type { CategoryId, StationId } from '../sim/types'
import ConsumeJumpItem from './consumeJumpItem.vue'
import { formatConsumeToken } from './encounterDeal'
import { useGameStore } from './gameStore'
import { stationHelpCopy } from './stationHelp'
import StationTips from './stationTips.vue'
import UiIcon from './uiIcon.vue'
import UiSelect from './uiSelect.vue'
import type { UiSelectOption } from './uiSelect'
import { useVisualProgress } from './visualProgress'
import { stationProgressStyle } from './workshopTabs'
import {
  qualityOf,
  workerQualityBadgeStyle,
  workerQualityNameStyle,
} from './workerQuality'

const props = defineProps<{
  stationId: StationId
  focused?: boolean
}>()

const game = useGameStore()
const def = computed(() => STATION_DEF[props.stationId])
const count = computed(() => assignedCount(game.save, props.stationId))
const crew = computed(() => assignedWorkers(game.save, props.stationId))
const canMerge = computed(() => crew.value.length >= STATION_WORKER_CAP)
const mergeLabel = computed(() => stationMergeLabel(game.save, props.stationId))
const station = computed(() => game.save.stations[props.stationId])
const cat = computed(() => selectedCategoryDef(game.save, props.stationId))
const speed = computed(() => currentSpeed(game.save, props.stationId))
const stall = computed(() => station.value.stallReason)
const frozen = computed(() => isGatherFrozen(game.save, props.stationId))
const gatherLine = computed(() => gatherStatusText(game.save, props.stationId))
const pickCaption = computed(() => {
  if (props.stationId === 'hunting') return '猎物'
  if (props.stationId === 'mining') return '矿脉'
  if (props.stationId === 'cooking') return '菜谱'
  return '品类'
})
const visual = useVisualProgress(() => ({
  progress: station.value.progress,
  speed: speed.value,
  stalled: !!stall.value || frozen.value,
  assigned: count.value,
  lastTick: game.save.lastTick,
}))
const pct = computed(() => Math.min(100, visual.value * 100))
const pctLabel = computed(() => Math.round(pct.value))
const progressTone = computed(() => stationProgressStyle(props.stationId))
const xpNeed = computed(() => xpToNextLevel(station.value.stationLevel))
const xpPct = computed(() => Math.min(100, Math.round((station.value.stationXp / xpNeed.value) * 100)))
const pickOptions = computed(() => categoryPickOptions(game.save, props.stationId))
const consumeGroups = computed(() => stationConsumeGroups(game.save, props.stationId))
const stallLine = computed(() => stationBottleneckText(game.save, props.stationId))
const conflictLine = computed(() => stationConflictHint(game.save, props.stationId))
const guideFlashAlchemy = computed(
  () => props.stationId === 'alchemy' && isGuideQuestFlash(game.save, 'alchemy'),
)
const locked = computed(() => !isStationUnlocked(game.save, props.stationId))
const canWithdraw = computed(() => count.value > 0)
const helpOpen = ref(false)
const help = computed(() => stationHelpCopy(props.stationId))

function onAssignIdle() {
  if (locked.value) {
    pushFloatTip(stationLockedTip(props.stationId))
    return
  }
  game.assignIdle(props.stationId)
}

function onLockedTap(ev: Event) {
  if (!locked.value) return
  if (ev.target instanceof HTMLElement && ev.target.closest('button, select, label, input')) return
  pushFloatTip(stationLockedTip(props.stationId))
}
const categorySelectOptions = computed<UiSelectOption[]>(() =>
  pickOptions.value.map((c) => ({
    value: c.id,
    label: c.unlocked ? c.label : `${c.label}（Lv${c.unlockLevel}）`,
    disabled: !c.unlocked,
  })),
)

function pick(id: CategoryId) {
  game.selectCategory(props.stationId, id)
}

function onPick(value: string) {
  const opt = pickOptions.value.find((c) => c.id === value)
  if (!opt?.unlocked) return
  pick(value as CategoryId)
}

function onMerge() {
  game.fuseStation(props.stationId)
}

function consumeText(row: StationConsumeToken) {
  return formatConsumeToken({ kind: 'item', itemId: row.itemId, qty: row.need }, row.have)
}

function toggleHelp() {
  helpOpen.value = !helpOpen.value
}

function closeHelp() {
  helpOpen.value = false
}

function onHelpKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape' && helpOpen.value) closeHelp()
}

onMounted(() => {
  window.addEventListener('keydown', onHelpKey)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onHelpKey)
})
</script>

<template>
  <article
    class="card"
    :data-station="stationId"
    :class="{ wait: frozen && !stall, locked: locked, 'guide-flash': guideFlashAlchemy, focus: focused }"
    @click="onLockedTap"
  >
    <StationTips :station-id="stationId" />
    <header>
      <span class="badge">
        <UiIcon :name="stationId" />
      </span>
      <div class="titles">
        <h2 class="station-title">
          {{ def.label }} · Lv{{ station.stationLevel }}
        </h2>
        <p class="meta">{{ cat.label }} {{ stationCycleS(game.save, stationId) }}s/次</p>
      </div>
      <button
        type="button"
        class="help"
        :aria-pressed="helpOpen"
        :aria-label="`查看${def.label}说明`"
        @click.stop="toggleHelp"
      >？</button>
    </header>
    <ul class="crew" aria-label="在岗工人">
      <li v-if="crew.length" class="crew-row">
        <span v-for="w in crew" :key="w.id" class="crew-slot">
          <b class="qmark" :style="workerQualityBadgeStyle(w)">{{ qualityOf(w).label }}</b>
          <b class="crew-name" :style="workerQualityNameStyle(w)">{{ w.name ?? w.id }}</b>
          <span class="crew-lv">Lv{{ w.level }}</span>
        </span>
        <button
          v-if="canMerge"
          type="button"
          class="crew-merge"
          :class="{ 'guide-flash': isGuideQuestFlash(game.save, 'fuse') }"
          @click="onMerge"
        >{{ mergeLabel }}</button>
      </li>
      <li v-else class="crew-empty">空岗</li>
    </ul>
    <div class="bars">
      <div class="bar live" :class="{ halt: !!stall || frozen }" :style="progressTone" :aria-valuenow="pctLabel">
        <i :style="{ width: pct.toFixed(2) + '%' }" />
      </div>
      <div class="bar xp" :aria-valuenow="xpPct">
        <i :style="{ width: xpPct + '%' }" />
      </div>
    </div>
    <p class="stat">进度 {{ pctLabel }}% · XP {{ station.stationXp }}/{{ xpNeed }} · 速度 {{ speed.toFixed(2) }}/s</p>
    <div class="sub">
      <p v-if="conflictLine" class="stat conflict">{{ conflictLine }}</p>
      <p v-if="gatherLine" class="stat gather">{{ gatherLine }}</p>
      <p v-if="station.craftNotice" class="stat gather">{{ station.craftNotice }}</p>
      <p v-if="stallLine" class="stat jam">{{ stallLine }}</p>
      <p v-if="consumeGroups.length" class="stat consume">
        <span>消耗 </span>
        <template v-for="(group, gi) in consumeGroups" :key="gi">
          <span v-if="gi" class="sep"> / </span>
          <template v-for="(row, i) in group" :key="row.itemId">
            <span v-if="i" class="sep">、</span>
            <ConsumeJumpItem :item-id="row.itemId" :text="consumeText(row)" :short="row.short" />
          </template>
        </template>
      </p>
      <label v-if="pickOptions.length > 1" class="cats">
        <span class="sr">{{ pickCaption }}</span>
        <UiSelect
          :model-value="station.selectedCategory"
          :options="categorySelectOptions"
          :aria-label="pickCaption"
          @update:model-value="onPick"
        />
      </label>
    </div>
    <div class="actions">
      <button
        type="button"
        class="act"
        :disabled="!canWithdraw"
        @click="game.withdraw(stationId)"
      >撤出</button>
      <button
        type="button"
        class="act"
        :class="{ 'guide-flash': guideFlashAlchemy }"
        @click="onAssignIdle"
      >派入</button>
    </div>
    <Teleport to="body">
      <div
        v-if="helpOpen"
        class="help-mask"
        @click.self="closeHelp"
      >
        <section class="help-panel panel" role="dialog" aria-modal="true" :aria-labelledby="`station-help-${stationId}`">
          <header>
            <h3 :id="`station-help-${stationId}`" class="title">{{ help.title }}</h3>
            <button type="button" class="close" @click="closeHelp">关闭</button>
          </header>
          <p class="help-body">{{ help.body }}</p>
        </section>
      </div>
    </Teleport>
  </article>
</template>

<style scoped>
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  padding: 12px;
}

.card.locked {
  filter: grayscale(0.85);
  opacity: 0.5;
}

.jam {
  color: var(--danger);
}

.consume {
  font-family: var(--font-mono);
}

header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
}

.badge {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border: 3px solid var(--gold);
  border-radius: 50%;
  background: linear-gradient(#fffef8, #ffe9b8);
  box-shadow: 0 2px 0 var(--gold-deep), inset 0 1px 0 #fffef6, inset 0 0 0 2px #fff8e0;
}

.badge :deep(.ui-ico) {
  width: 26px;
  height: 26px;
}

.titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1 1 auto;
}

h2,
.meta,
.stat {
  margin: 0;
}

h2.station-title {
  font-family: var(--font-body);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--ink);
}

.meta,
.stat {
  color: var(--muted);
  font-size: 12px;
}

.crew {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 0 0 auto;
}

.crew-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  min-width: 0;
}

.crew-slot {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.qmark {
  flex: 0 0 auto;
  min-width: 22px;
  padding: 1px 7px;
  border: 2px solid currentColor;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-align: center;
}

.crew-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 700;
}

.crew-lv {
  flex: 0 0 auto;
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.crew-merge {
  flex: 0 0 auto;
  margin-left: auto;
  min-height: 32px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

.crew-empty {
  color: var(--muted);
  font-size: 12px;
}

.bars {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 0 0 auto;
}

.bar.live {
  height: 16px;
  border-radius: 999px;
}

.bar.xp {
  height: 10px;
  border-radius: 999px;
}

.sub {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

.gather,
.conflict {
  color: var(--copper);
}

.card.wait {
  box-shadow: inset 0 0 0 3px #d4a017;
}

.card.focus {
  box-shadow:
    0 3px 0 var(--shadow),
    inset 0 0 0 2px #ffe27a,
    inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.cats,
.row {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  width: 100%;
}

.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

.hint {
  color: var(--muted);
  font-size: 12px;
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  margin-top: auto;
  padding-top: 4px;
}

.help {
  flex: 0 0 28px;
  align-self: flex-start;
  margin-left: auto;
  z-index: 3;
  width: 28px;
  min-width: 28px;
  min-height: 28px;
  padding: 0;
  border-width: 2px;
  border-radius: 50%;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0;
}

.actions .act {
  flex: 1 1 0;
  min-width: 88px;
  min-height: 48px;
  padding: 6px 12px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.help-mask {
  position: fixed;
  inset: 0;
  z-index: var(--z-sheet);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 72px 16px 24px;
  background: rgba(92, 58, 26, 0.28);
}

.help-panel {
  width: min(440px, 100%);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 12px 10px;
}

.help-panel header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.help-panel .title {
  margin: 0;
  font-size: 20px;
}

.help-panel .close {
  min-height: 32px;
  padding: 4px 10px;
}

.help-body {
  margin: 0;
  padding: 8px 10px;
  border: 2px solid var(--gold);
  border-radius: 12px;
  background: var(--slot);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.5;
}
</style>
