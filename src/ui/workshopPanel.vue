<script setup lang="ts">
import { assignedCount } from '../sim/query'
import { PLAYABLE_CHAINS, SKELETON_STATION_IDS, STATION_DEF } from '../sim/tables'
import type { StationId } from '../sim/types'
import { useGameStore } from './gameStore'
import StationCard from './stationCard.vue'

const game = useGameStore()

function chainTitle(ids: StationId[]): string {
  return ids.map((id) => STATION_DEF[id].label).join(' → ')
}
</script>

<template>
  <div class="wrap">
    <section v-for="ids in PLAYABLE_CHAINS" :key="chainTitle(ids)" class="chain">
      <p class="chain-title">{{ chainTitle(ids) }}</p>
      <div class="grid">
        <StationCard v-for="id in ids" :key="id" :station-id="id" />
      </div>
    </section>

    <details class="panel more">
      <summary>其它站点骨架（炼金）</summary>
      <p class="hint">
        炼金耗木头出药剂和渣滓。铜器锻造可用渣滓回流。同站堆人规则一样，本档不当主玩。
      </p>
      <div class="grid">
        <StationCard v-for="id in SKELETON_STATION_IDS" :key="id" :station-id="id" skeleton />
      </div>
    </details>

    <p class="hint">
      采矿 {{ assignedCount(game.save, 'mining') }} 人 / 锻造 {{ assignedCount(game.save, 'forging') }} 人 · 钓鱼
      {{ assignedCount(game.save, 'fishing') }} 人 / 烹饪 {{ assignedCount(game.save, 'cooking') }} 人 · 伐木
      {{ assignedCount(game.save, 'woodcutting') }} 人。
    </p>
  </div>
</template>

<style scoped>
.wrap,
.chain,
.more {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.more {
  padding: 14px 16px;
  border: 1px solid var(--seam);
  background: var(--plate);
}

.chain-title,
.hint,
.more p {
  margin: 0;
  line-height: 1.5;
}

.chain-title {
  color: var(--copper);
  letter-spacing: 0.08em;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}

.hint {
  color: var(--muted);
  font-size: 14px;
}

summary {
  cursor: pointer;
  color: var(--copper);
}
</style>
