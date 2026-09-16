<script setup lang="ts">
import { assignedCount, idleCount } from '../sim/query'
import { CLASS_LABEL, PLAYABLE_STATION_IDS, RECRUIT_COST, STATION_DEF } from '../sim/tables'
import type { StationId } from '../sim/types'
import { useGameStore } from './gameStore'

const game = useGameStore()

function stationLabel(id: StationId | null): string {
  return id ? STATION_DEF[id].label : '空闲'
}
</script>

<template>
  <section class="panel roster">
    <p>工人</p>
    <p class="hint">
      金币 {{ game.save.gold }} · 名册 {{ game.save.workers.length }} · 空闲 {{ idleCount(game.save) }}
    </p>
    <div class="row">
      <button type="button" @click="game.recruit()">抽工人（{{ RECRUIT_COST }} 金）</button>
    </div>
    <p v-if="!game.save.workers.length" class="hint">先抽人，再派到站点。同一站可以堆多人加速。</p>
    <ul v-else>
      <li v-for="w in game.save.workers" :key="w.id">
        <span>{{ w.name ?? w.id }} · {{ w.classId ? CLASS_LABEL[w.classId] : '未标' }} · {{ stationLabel(w.assignment) }}</span>
        <span class="row">
          <button
            v-for="id in PLAYABLE_STATION_IDS"
            :key="id"
            type="button"
            @click="game.assign(w.id, id)"
          >
            {{ STATION_DEF[id].label }}
          </button>
          <button type="button" :disabled="!w.assignment" @click="game.assign(w.id, null)">休息</button>
        </span>
      </li>
    </ul>
    <p class="hint">
      采矿 {{ assignedCount(game.save, 'mining') }} / 锻造 {{ assignedCount(game.save, 'forging') }} · 钓鱼
      {{ assignedCount(game.save, 'fishing') }} / 烹饪 {{ assignedCount(game.save, 'cooking') }} · 伐木
      {{ assignedCount(game.save, 'woodcutting') }}
    </p>
  </section>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border: 1px solid var(--seam);
  background: var(--plate);
}

.panel p,
.hint {
  margin: 0;
  line-height: 1.5;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

button {
  padding: 6px 10px;
  min-height: 36px;
  border: 1px solid var(--seam);
  background: #18140f;
}

ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

li {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
}

.hint {
  color: var(--muted);
  font-size: 14px;
}
</style>
