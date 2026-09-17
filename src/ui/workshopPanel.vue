<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  formatMarchClock,
  isWorkshopBuffActive,
  workshopBuffMul,
  workshopBuffRemainS,
} from '../sim/encounters'
import { leftoverStockRows } from '../sim/query'
import type { StationId } from '../sim/types'
import { useGameStore } from './gameStore'
import StationCard from './stationCard.vue'
import UiIcon from './uiIcon.vue'
import {
  WORKSHOP_TAB_IDS,
  loadWorkshopTab,
  saveWorkshopTab,
  workshopTabLabel,
} from './workshopTabs'

const game = useGameStore()
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

const activeTab = ref<StationId>(loadWorkshopTab())
const leftover = computed(() => leftoverStockRows(game.save))

function selectTab(id: StationId) {
  activeTab.value = saveWorkshopTab(id)
}
</script>

<template>
  <div class="wrap">
    <p v-if="buffOn" class="buff">{{ buffLabel }}</p>
    <div class="board">
      <nav class="rail" role="tablist" aria-label="工坊站点">
        <button
          v-for="id in WORKSHOP_TAB_IDS"
          :key="id"
          type="button"
          role="tab"
          :aria-selected="activeTab === id"
          :class="{ on: activeTab === id }"
          @click="selectTab(id)"
        >
          <UiIcon :name="id" />
          {{ workshopTabLabel(id) }}
        </button>
      </nav>
      <section class="stage">
        <StationCard :station-id="activeTab" />
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
  display: flex;
  flex-direction: column;
  flex: 0 0 56px;
  width: 56px;
  gap: 4px;
  min-height: 0;
}

.rail button {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  flex: 1 1 0;
  width: 100%;
  min-height: 44px;
  padding: 2px;
  font-family: var(--font-display);
  font-size: 11px;
  letter-spacing: 0.04em;
}

.rail button.on {
  color: var(--ink);
  opacity: 1;
  filter: none;
}

.rail .ui-ico {
  width: 16px;
  height: 16px;
}

.stage {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
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
