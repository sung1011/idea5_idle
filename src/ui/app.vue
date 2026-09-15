<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { bankQty } from '../sim/bank'
import { assignedCount, idleCount } from '../sim/query'
import {
  CLASS_LABEL,
  PLAYABLE_STATION_IDS,
  RECRUIT_COST,
  SKELETON_STATION_IDS,
  STATION_DEF,
  formatClock,
  gameDay,
  timeOfDayS,
} from '../sim/tables'
import type { StationId } from '../sim/types'
import { useGameStore } from './gameStore'
import StationCard from './stationCard.vue'

const game = useGameStore()

const day = computed(() => gameDay(game.save.elapsedS))
const clock = computed(() => formatClock(game.save.elapsedS))
const today = computed(() => formatClock(timeOfDayS(game.save.elapsedS)))
const ore = computed(() => bankQty(game.save, 'ore'))
const weapon = computed(() => bankQty(game.save, 'weapon'))
const idle = computed(() => idleCount(game.save))

function stationLabel(id: StationId | null): string {
  return id ? STATION_DEF[id].label : '空闲'
}

onMounted(() => {
  game.startClock()
})

onUnmounted(() => {
  game.stopClock()
})
</script>

<template>
  <div class="shell">
    <header class="mast">
      <p class="shift">第一期 · 纯生活流水线</p>
      <h1>车间闲置</h1>
    </header>

    <section class="panel top">
      <p>游戏日 {{ day }} · 今日 {{ today }}</p>
      <p class="clock">已运行 {{ clock }}</p>
      <p>金币 {{ game.save.gold }} · 工人 {{ game.save.workers.length }} · 空闲 {{ idle }}</p>
      <div class="row">
        <button type="button" @click="game.recruit()">抽工人（{{ RECRUIT_COST }} 金）</button>
      </div>
    </section>

    <section class="panel bank">
      <p>银行缓冲</p>
      <p class="nums">
        矿石 <strong>{{ ore }}</strong> / 20
        <button type="button" :disabled="ore === 0" @click="game.sell('ore')">卖 1</button>
        · 武器 <strong>{{ weapon }}</strong> / 50
        <button type="button" :disabled="weapon === 0" @click="game.sell('weapon')">卖 1</button>
      </p>
    </section>

    <p v-if="game.notice" class="notice">{{ game.notice }}</p>
    <ul v-if="game.hints.length" class="hints">
      <li v-for="(h, i) in game.hints" :key="i" :class="h.kind">{{ h.text }}</li>
    </ul>
    <p v-else class="hint">抽工人，把人堆到同一站加速。采矿出矿，锻造耗矿出武器。相邻站同时有人会共振。</p>

    <section class="grid">
      <StationCard v-for="id in PLAYABLE_STATION_IDS" :key="id" :station-id="id" />
    </section>

    <section v-if="game.save.workers.length" class="panel roster">
      <p>工人名册</p>
      <ul>
        <li v-for="w in game.save.workers" :key="w.id">
          <span>{{ w.name ?? w.id }} · {{ w.classId ? CLASS_LABEL[w.classId] : '未标' }} · {{ stationLabel(w.assignment) }}</span>
          <span class="row">
            <button type="button" @click="game.assign(w.id, 'mining')">采矿</button>
            <button type="button" @click="game.assign(w.id, 'forging')">锻造</button>
            <button type="button" :disabled="!w.assignment" @click="game.assign(w.id, null)">休息</button>
          </span>
        </li>
      </ul>
    </section>

    <details class="panel more">
      <summary>其它站点骨架（钓鱼 / 烹饪 / 伐木 / 炼金）</summary>
      <p class="hint">
        钓鱼出鱼、烹饪耗鱼；伐木弱接炼金；炼金渣滓可回流锻造。同站堆人规则一样。
      </p>
      <div class="grid">
        <StationCard v-for="id in SKELETON_STATION_IDS" :key="id" :station-id="id" skeleton />
      </div>
    </details>

    <p class="hint">
      采矿 {{ assignedCount(game.save, 'mining') }} 人 / 锻造 {{ assignedCount(game.save, 'forging') }} 人。存档键 idea5Idle。
    </p>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: min(720px, 100%);
  min-height: 100dvh;
  margin: 0 auto;
  padding: 28px 20px 36px;
  background:
    radial-gradient(ellipse at 50% -8%, #3a2818 0%, transparent 55%),
    var(--iron);
}

.mast {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.shift {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  letter-spacing: 0.18em;
}

h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 0.1em;
}

.panel,
.more {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border: 1px solid var(--seam);
  background: var(--plate);
}

.panel p,
.hint,
.notice,
.more p {
  margin: 0;
  line-height: 1.5;
}

.clock,
.nums {
  font-family: var(--font-mono);
  color: var(--copper);
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

button {
  padding: 6px 10px;
  border: 1px solid var(--seam);
  background: #18140f;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}

.roster ul,
.hints {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.roster li {
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

.notice,
.hints .bottleneck {
  color: var(--danger);
}

.hints .resonance {
  color: var(--ember);
}

summary {
  cursor: pointer;
  color: var(--copper);
}
</style>
