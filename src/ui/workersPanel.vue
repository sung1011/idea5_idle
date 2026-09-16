<script setup lang="ts">
import { assignedCount, idleCount } from '../sim/query'
import { CLASS_LABEL, PLAYABLE_STATION_IDS, RECRUIT_COST, STATION_DEF } from '../sim/tables'
import type { StationId, Worker } from '../sim/types'
import { useGameStore } from './gameStore'

const game = useGameStore()

function atStation(w: Worker, id: StationId) {
  return w.assignment === id
}

function resting(w: Worker) {
  return w.assignment === null
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
    <p v-if="!game.save.workers.length" class="hint">先抽人，再点站点按钮派人。同一站可以堆多人加速。</p>
    <ul v-else>
      <li v-for="w in game.save.workers" :key="w.id" class="card">
        <p class="name">{{ w.name ?? w.id }} · {{ w.classId ? CLASS_LABEL[w.classId] : '未标' }}</p>
        <div class="row">
          <button
            v-for="id in PLAYABLE_STATION_IDS"
            :key="id"
            type="button"
            :class="{ on: atStation(w, id) }"
            :disabled="atStation(w, id)"
            :aria-pressed="atStation(w, id)"
            @click="game.assign(w.id, id)"
          >
            {{ STATION_DEF[id].label }}
          </button>
          <button
            type="button"
            :class="{ on: resting(w) }"
            :disabled="resting(w)"
            :aria-pressed="resting(w)"
            @click="game.assign(w.id, null)"
          >
            休息
          </button>
        </div>
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
.hint,
.name {
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

button.on {
  border-color: var(--copper);
  color: var(--ember);
  opacity: 1;
}

ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--seam);
  background: #18140f;
}

.name {
  font-family: var(--font-mono);
  color: var(--copper);
}

.hint {
  color: var(--muted);
  font-size: 14px;
}
</style>
