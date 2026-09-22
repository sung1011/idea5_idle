<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import {
  formatMarchClock,
  isWorkshopBuffActive,
  workshopBuffMul,
  workshopBuffRemainS,
} from '../sim/encounters'
import { leftoverStockRows } from '../sim/query'
import { isGuideQuestFlash } from '../sim/guideQuest'
import { isStationUnlocked, workshopGroupLockedTip } from '../sim/stationUnlock'
import { pushFloatTip } from './floatTips'
import { useGameStore } from './gameStore'
import StationCard from './stationCard.vue'
import { dismissWorkshopBanter, greetWorkshopBanter } from './workshopBanter'
import UiIcon from './uiIcon.vue'
import { railGroupSlotDots } from './workshopRail'
import { selectWorkshopGroup, syncWorkshopTab, workshopGroup, workshopTab } from './appNav'
import {
  WORKSHOP_GROUPS,
  stationsOfWorkshopGroup,
  workshopGroupLabel,
  type WorkshopGroupId,
} from './workshopTabs'

const game = useGameStore()
const guideFlashAlchemy = computed(() => isGuideQuestFlash(game.save, 'alchemy'))
const now = computed(() => {
  void game.save.elapsedS
  return Date.now()
})
const buffOn = computed(() => isWorkshopBuffActive(game.save, now.value))
const buffLabel = computed(() => {
  if (!buffOn.value) return ''
  const pct = Math.round((workshopBuffMul(game.save, now.value) - 1) * 100)
  return `工匠加持：产量 +${pct}% · 剩余 ${formatMarchClock(workshopBuffRemainS(game.save, now.value))}`
})

const activeStation = workshopTab
const activeGroup = workshopGroup
syncWorkshopTab()
const leftover = computed(() => leftoverStockRows(game.save))
const groupStations = computed(() => stationsOfWorkshopGroup(activeGroup.value))
const railDotsByGroup = computed(() => {
  const save = game.save
  return Object.fromEntries(
    WORKSHOP_GROUPS.map((row) => [row.id, railGroupSlotDots(save, row.stations)]),
  ) as Record<WorkshopGroupId, ReturnType<typeof railGroupSlotDots>>
})

function selectGroup(id: WorkshopGroupId) {
  const stations = stationsOfWorkshopGroup(id)
  if (stations.every((sid) => !isStationUnlocked(game.save, sid))) {
    const tip = workshopGroupLockedTip(game.save, stations)
    if (tip) pushFloatTip(tip)
  }
  selectWorkshopGroup(id)
}

function groupLocked(id: WorkshopGroupId) {
  return stationsOfWorkshopGroup(id).every((sid) => !isStationUnlocked(game.save, sid))
}

function scrollFocusedStation() {
  const root = document.getElementById(`workshop-station-${activeStation.value}`)
  root?.scrollIntoView({ block: 'nearest' })
}

watch(activeStation, async () => {
  await nextTick()
  scrollFocusedStation()
})

onMounted(() => {
  greetWorkshopBanter(game.save)
})

watch(activeGroup, () => {
  greetWorkshopBanter(game.save)
})

onUnmounted(() => {
  dismissWorkshopBanter()
})
</script>

<template>
  <div class="wrap">
    <p v-if="buffOn" class="buff">{{ buffLabel }}</p>
    <div class="board">
      <nav class="rail" role="tablist" aria-label="工坊分组">
        <button
          v-for="row in WORKSHOP_GROUPS"
          :key="row.id"
          type="button"
          role="tab"
          :aria-selected="activeGroup === row.id"
          :class="{
            on: activeGroup === row.id,
            locked: groupLocked(row.id),
            'guide-flash': row.stations.includes('alchemy') && guideFlashAlchemy,
          }"
          @click="selectGroup(row.id)"
        >
          <span class="face">
            <span class="pair-icos">
              <UiIcon v-for="id in row.stations" :key="id" :name="id" />
            </span>
            <span class="lab">{{ workshopGroupLabel(row.id) }}</span>
            <span class="pair-dots" aria-hidden="true">
              <span v-for="(dot, i) in railDotsByGroup[row.id]" :key="i" class="dot-cell">
                <i
                  v-if="dot"
                  :class="{ idle: dot.idle }"
                  :style="{ background: dot.color }"
                />
              </span>
            </span>
          </span>
        </button>
      </nav>
      <section class="stage">
        <div
          v-for="id in groupStations"
          :id="'workshop-station-' + id"
          :key="id"
          class="slot"
        >
          <StationCard :station-id="id" :focused="activeStation === id" />
        </div>
      </section>
    </div>
    <section v-if="leftover.length" class="leftover" aria-label="其它库存">
      <p class="note">其它库存</p>
      <div class="stock-row">
        <span v-for="row in leftover" :key="row.itemId" class="stock-item">{{ row.label }} {{ row.qty }}</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
  height: 100%;
  min-height: 0;
}

.board {
  display: flex;
  align-items: stretch;
  gap: 8px;
  flex: 1 1 auto;
  min-height: 0;
}

.rail {
  display: grid;
  grid-template-rows: repeat(3, minmax(var(--workshop-rail-row-min), 1fr));
  flex: 0 0 56px;
  width: 56px;
  gap: var(--workshop-rail-row-gap);
  min-height: 0;
}

.rail button {
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  width: 100%;
  min-height: var(--workshop-rail-row-min);
  min-width: 0;
  padding: 2px 2px 3px;
  font-family: var(--font-display);
  font-size: 11px;
  letter-spacing: 0.04em;
  border-width: var(--border-thin);
  border-color: var(--gold);
  background: linear-gradient(#fffef8, var(--btn));
  box-shadow: none;
  opacity: 0.52;
}

.rail .face {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 0;
  max-width: 100%;
}

.rail .pair-icos {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.rail .lab {
  line-height: 1.1;
}

.rail .pair-dots {
  display: grid;
  grid-template-columns: 7px 7px;
  grid-template-rows: 7px 7px;
  justify-content: center;
  align-content: center;
  width: 100%;
  gap: 3px;
}

.rail .dot-cell {
  width: 7px;
  height: 7px;
}

.rail .dot-cell i {
  display: block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  box-shadow: 0 0 0 1px rgba(90, 58, 16, 0.28);
}

.rail .dot-cell i.idle {
  box-shadow: 0 0 0 1.5px #8b1515;
  animation: rail-idle-flash 1.1s ease-in-out infinite;
}

.rail button:active:not(:disabled):not(.on) {
  transform: none;
  box-shadow: none;
}

.rail button.on,
.rail button.on:hover:not(:disabled),
.rail button.on:active:not(:disabled) {
  color: var(--ink);
  font-weight: inherit;
  z-index: 1;
  background: #fffaf0;
  border-width: var(--border-thin);
  border-color: #a67c2a;
  box-shadow:
    0 5px 12px rgba(90, 58, 16, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.85);
  transform: translateY(-3px);
  opacity: 1;
  filter: none;
}

.rail button.locked {
  filter: grayscale(0.85);
  opacity: 0.45;
}

.rail .ui-ico {
  width: 13px;
  height: 13px;
}

.stage {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  min-height: 0;
  overflow: auto;
}

.slot {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
}

.slot :deep(.card) {
  height: auto;
  min-height: 100%;
}

.note,
.buff {
  margin: 0;
  line-height: 1.4;
  letter-spacing: 0.06em;
}

.note {
  color: var(--copper);
  font-size: 12px;
}

.buff {
  flex: 0 0 auto;
  padding: 6px 10px;
  border: 2px solid var(--moss-deep);
  border-radius: 10px;
  background: #e7f8d8;
  color: var(--moss-deep);
  font-size: 12px;
  font-weight: 700;
}

.leftover,
.stock-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
}

.leftover {
  flex: 0 0 auto;
  flex-direction: column;
}

.stock-row {
  margin: 0;
}

.stock-item {
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 2px 8px;
  border: 2px solid var(--seam);
  border-radius: 8px;
  background: var(--slot);
}
</style>
