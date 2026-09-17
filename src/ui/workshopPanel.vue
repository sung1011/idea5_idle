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
          <i class="sprite sprite-station" :class="id" aria-hidden="true" />
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
  gap: 8px;
}

.board {
  display: flex;
  align-items: stretch;
  gap: 10px;
}

.rail {
  display: flex;
  flex-direction: column;
  flex: 0 0 72px;
  width: 72px;
  gap: 6px;
}

.rail button {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 100%;
  min-height: 48px;
  padding: 4px 4px;
  font-size: 12px;
  letter-spacing: 0.08em;
}

.rail button.on {
  color: var(--ink);
  background: linear-gradient(#ffe27a, #f0b83a);
  box-shadow: 0 3px 0 var(--shadow);
  opacity: 1;
  filter: none;
}

.rail .sprite-station {
  width: 28px;
  height: 32px;
}

.stage {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
}

.note,
.buff {
  margin: 0;
  line-height: 1.5;
  letter-spacing: 0.08em;
}

.note {
  color: var(--copper);
}

.buff {
  padding: 8px 12px;
  border: 2px solid var(--moss-deep);
  border-radius: 10px;
  background: #e7f8d8;
  color: var(--moss-deep);
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

@media (max-width: 420px) {
  .rail {
    flex-basis: 56px;
    width: 56px;
  }

  .rail button {
    min-height: 44px;
    font-size: 11px;
    padding: 3px 2px;
  }
}
</style>
