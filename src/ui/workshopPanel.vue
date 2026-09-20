<script setup lang="ts">
import { computed, nextTick, watch } from 'vue'
import {
  formatMarchClock,
  isWorkshopBuffActive,
  workshopBuffMul,
  workshopBuffRemainS,
} from '../sim/encounters'
import { leftoverStockRows } from '../sim/query'
import { isGuideQuestFlash } from '../sim/guideQuest'
import type { StationId } from '../sim/types'
import { useGameStore } from './gameStore'
import StationCard from './stationCard.vue'
import UiIcon from './uiIcon.vue'
import { useFrameNow } from './visualProgress'
import { railProgressHalted, railVisualPct, railWorkerDotColors } from './workshopRail'
import { selectWorkshopGroup, syncWorkshopTab, workshopGroup, workshopTab } from './appNav'
import {
  WORKSHOP_GROUPS,
  stationsOfWorkshopGroup,
  workshopGroupLabel,
  type WorkshopGroupId,
} from './workshopTabs'

const game = useGameStore()
const guideFlashMining = computed(() => isGuideQuestFlash(game.save, 'mining'))
const now = computed(() => {
  void game.save.elapsedS
  return Date.now()
})
const frameNow = useFrameNow()
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
const railById = computed(() => {
  const save = game.save
  const clock = frameNow.value
  return Object.fromEntries(
    WORKSHOP_GROUPS.flatMap((row) => row.stations).map((id) => [
      id,
      {
        dots: railWorkerDotColors(save, id),
        pct: railVisualPct(save, id, clock),
        halted: railProgressHalted(save, id),
      },
    ]),
  ) as Record<StationId, { dots: string[]; pct: number; halted: boolean }>
})

function selectGroup(id: WorkshopGroupId) {
  selectWorkshopGroup(id)
}

function scrollFocusedStation() {
  const root = document.getElementById(`workshop-station-${activeStation.value}`)
  root?.scrollIntoView({ block: 'nearest' })
}

watch(activeStation, async () => {
  await nextTick()
  scrollFocusedStation()
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
            halt: railById[row.stations[0]].halted && railById[row.stations[1]].halted,
            'guide-flash': row.stations.includes('mining') && guideFlashMining,
          }"
          @click="selectGroup(row.id)"
        >
          <span class="fills" aria-hidden="true">
            <span
              v-for="id in row.stations"
              :key="id"
              class="fill-clip"
              :class="{ halt: railById[id].halted }"
            >
              <i class="fill" :style="{ height: railById[id].pct.toFixed(2) + '%' }" />
            </span>
          </span>
          <span class="face">
            <span class="pair-icos">
              <UiIcon v-for="id in row.stations" :key="id" :name="id" />
            </span>
            <span class="lab">{{ workshopGroupLabel(row.id) }}</span>
            <span class="pair-dots">
              <span v-for="id in row.stations" :key="id" class="dots">
                <i
                  v-for="(color, i) in railById[id].dots"
                  :key="i"
                  :style="{ background: color }"
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
  color: var(--ink);
  background: linear-gradient(#fffdf6, #fff7d8);
  border-color: var(--gold);
  box-shadow: 0 2px 0 var(--shadow), inset 0 1px 0 rgba(255, 255, 255, 0.7);
  opacity: 1;
  filter: none;
}

.rail .fills {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  pointer-events: none;
  z-index: 0;
}

.rail .fill-clip {
  position: relative;
  overflow: hidden;
  border-radius: inherit;
}

.rail .fill {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(0deg, #3e9a2a, #c8f08a 70%, #f3d06a);
}

.rail .fill-clip.halt .fill,
.rail button.halt .fill {
  background: linear-gradient(0deg, #9a8f7c, #d4cdc0);
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
  grid-template-columns: 1fr 1fr;
  align-items: center;
  width: 100%;
  min-height: 7px;
  gap: 2px;
}

.rail .dots {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: 7px;
}

.rail .dots i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  box-shadow: 0 0 0 1px rgba(90, 58, 16, 0.28);
}

.rail button.on,
.rail button.on:hover:not(:disabled),
.rail button.on:active:not(:disabled) {
  color: #3f2208;
  font-weight: 700;
  background: #e0a21c;
  border-width: 4px;
  border-color: #8f6a0c;
  box-shadow: 0 3px 0 #8f6a0c;
  opacity: 1;
  filter: none;
}

.rail button.on::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 3;
  width: 6px;
  pointer-events: none;
  background: #8f6a0c;
  border-radius: 8px 0 0 8px;
}

.rail button.on::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  border-radius: inherit;
  box-shadow: inset 0 0 0 3px #c48a14;
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
