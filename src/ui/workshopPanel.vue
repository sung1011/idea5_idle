<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  formatMarchClock,
  isWorkshopBuffActive,
  workshopBuffMul,
  workshopBuffRemainS,
} from '../sim/encounters'
import { leftoverStockRows } from '../sim/query'
import { useGameStore } from './gameStore'
import StationCard from './stationCard.vue'
import {
  WORKSHOP_LINES,
  loadWorkshopLine,
  saveWorkshopLine,
  workshopLineOf,
  workshopLineTitle,
  type WorkshopLineId,
} from './workshopLines'

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

const activeLineId = ref<WorkshopLineId>(loadWorkshopLine())
const activeLine = computed(() => workshopLineOf(activeLineId.value))
const stageTitle = computed(() => workshopLineTitle(activeLine.value))
const leftover = computed(() => leftoverStockRows(game.save))

function selectLine(id: WorkshopLineId) {
  activeLineId.value = saveWorkshopLine(id)
}
</script>

<template>
  <div class="wrap">
    <p v-if="buffOn" class="buff">{{ buffLabel }}</p>
    <div class="board">
      <nav class="rail" role="tablist" aria-label="产线">
        <button
          v-for="line in WORKSHOP_LINES"
          :key="line.id"
          type="button"
          role="tab"
          :aria-selected="activeLineId === line.id"
          :class="{ on: activeLineId === line.id }"
          @click="selectLine(line.id)"
        >
          <i class="sprite sprite-station" :class="line.stationIds[0]" aria-hidden="true" />
          {{ line.label }}
        </button>
      </nav>
      <section class="stage">
        <p class="chain-title">{{ stageTitle }}</p>
        <div class="grid" :class="{ solo: activeLine.stationIds.length < 2 }">
          <StationCard v-for="id in activeLine.stationIds" :key="id" :station-id="id" />
        </div>
      </section>
    </div>
    <section v-if="leftover.length" class="leftover" aria-label="其它库存">
      <p class="chain-title">其它库存</p>
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
  gap: 8px;
}

.rail button {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  min-height: 64px;
  padding: 6px 4px;
  font-size: 13px;
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
  width: 32px;
  height: 36px;
}

.stage {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.chain-title,
.buff {
  margin: 0;
  line-height: 1.5;
  letter-spacing: 0.08em;
}

.chain-title {
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

.grid {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: 12px;
}

.grid > * {
  flex: 1 1 0;
  min-width: 0;
}

.grid.solo {
  justify-content: center;
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
    flex-basis: 60px;
    width: 60px;
  }

  .rail button {
    min-height: 56px;
    font-size: 12px;
    padding: 4px 2px;
  }
}
</style>
