<script setup lang="ts">
import { computed, ref } from 'vue'
import { restingWorkers } from '../sim/assign'
import {
  HERB_PVP_PLAYER_CAP,
  HERB_PVP_WEED_S,
  formatHerbDuration,
  herbHud,
  herbLeaderboard,
  herbPlotLabel,
  herbPlotShort,
} from '../sim/herbPvp'
import type { HerbPlot } from '../sim/types'
import { isFullWorkshopHp } from '../sim/workshopHp'
import { pushFloatTip } from './floatTips'
import PlayerAvatar from './playerAvatar.vue'
import { useGameStore } from './gameStore'

const game = useGameStore()
const probe = ref<1 | 2 | 4 | null>(null)
const pickIndex = ref<number | null>(null)
const hud = computed(() => herbHud(game.save, Date.now()))
const board = computed(() => herbLeaderboard(game.save))
const plots = computed(() => game.save.herbPvp.plots)
const candidates = computed(() => restingWorkers(game.save).filter((worker) => isFullWorkshopHp(worker)))

function toggleProbe(size: 1 | 2 | 4) {
  probe.value = probe.value === size ? null : size
}

function onPlot(index: number) {
  const plot = plots.value[index]
  if (!plot) return
  if (probe.value) {
    game.useHerbProbe(index, probe.value)
    return
  }
  if (plot.cleared) {
    pushFloatTip('这块已经除过', 'err')
    return
  }
  if (plot.workerId) return
  if (hud.value.stamina < 1) {
    pushFloatTip('体力不足', 'err')
    return
  }
  if (hud.value.playerPlots >= HERB_PVP_PLAYER_CAP) {
    pushFloatTip('最多同时除 3 块', 'err')
    return
  }
  pickIndex.value = index
}

function dispatch(workerId: string) {
  const index = pickIndex.value
  if (index == null) return
  const result = game.startHerbWeed(index, workerId)
  if (result.ok) pickIndex.value = null
}

function progressOf(plot: HerbPlot): number {
  if (!plot.workerId || plot.cleared) return 0
  return Math.min(1, plot.progressS / HERB_PVP_WEED_S)
}

function workerName(id: string | null): string {
  if (!id) return ''
  return game.save.workers.find((worker) => worker.id === id)?.name ?? '工人'
}

function rowKey(row: { id: string; rank: number }): string {
  return `${row.rank}-${row.id}`
}
</script>

<template>
  <div class="herb">
    <p class="meta">
      体力 {{ hud.stamina }}/{{ hud.staminaMax }}
      <span v-if="hud.staminaNextS > 0"> · {{ formatHerbDuration(hud.staminaNextS) }} 后 +1</span>
      <span v-else> · 已满</span>
    </p>
    <p class="meta">第 {{ hud.rank }} 名 · {{ hud.score }} 分 · 日结 {{ formatHerbDuration(hud.dayRemainS) }}</p>
    <p v-if="hud.lastRewardText" class="reward">上次日结 {{ hud.lastRewardText }}</p>
    <div class="probes">
      <button type="button" :class="{ on: probe === 1 }" :disabled="hud.probe1 < 1" @click="toggleProbe(1)">
        1格 {{ hud.probe1 }}
      </button>
      <button type="button" :class="{ on: probe === 2 }" :disabled="hud.probe2 < 1" @click="toggleProbe(2)">
        2格 {{ hud.probe2 }}
      </button>
      <button type="button" :class="{ on: probe === 4 }" :disabled="hud.probe4 < 1" @click="toggleProbe(4)">
        4格 {{ hud.probe4 }}
      </button>
    </div>
    <p class="hint">{{ probe ? '点一块未除的地使用侦测' : '点杂草，派满血工人除草' }}</p>
    <div class="grid" role="grid" aria-label="割草地图">
      <button
        v-for="plot in plots"
        :key="plot.index"
        type="button"
        class="cell"
        :class="{ revealed: plot.revealed, cleared: plot.cleared, mine: !!plot.workerId }"
        :aria-label="herbPlotLabel(plot)"
        @click="onPlot(plot.index)"
      >
        <span>{{ herbPlotShort(plot) }}</span>
        <i v-if="plot.workerId" class="bar" :style="{ width: `${(progressOf(plot) * 100).toFixed(2)}%` }" />
        <small v-if="plot.workerId">{{ workerName(plot.workerId) }}</small>
      </button>
    </div>
    <h3 class="board-title">割草排行</h3>
    <ol class="ranks" aria-label="割草排行榜">
      <li v-for="row in board" :key="rowKey(row)" :class="{ self: row.self }">
        <PlayerAvatar :id="row.avatarId" />
        <span class="who">{{ row.rank }}. {{ row.name }}</span>
        <b>{{ row.score }}</b>
      </li>
    </ol>
    <div v-if="pickIndex != null" class="mask" @click.self="pickIndex = null">
      <div class="sheet" role="dialog" aria-label="派工人除草">
        <h3>派去这块地</h3>
        <button v-for="worker in candidates" :key="worker.id" type="button" @click="dispatch(worker.id)">
          {{ worker.name ?? worker.id }}
        </button>
        <p v-if="!candidates.length">休息区没有满血工人</p>
        <button type="button" class="ghost" @click="pickIndex = null">关闭</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.herb {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.meta,
.hint,
.reward {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
}

.reward {
  color: var(--ink);
}

.probes {
  display: flex;
  gap: 6px;
}

.probes button {
  flex: 1 1 0;
  min-height: 36px;
}

.probes button.on {
  background: linear-gradient(#ffe27a, #f0b83a);
}

.grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 3px;
}

.cell {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 2px;
  overflow: hidden;
  border-width: 2px;
  font-size: 11px;
  line-height: 1.1;
}

.cell.revealed {
  background: #f3ffe8;
}

.cell.cleared {
  opacity: 0.55;
}

.cell.mine {
  border-color: var(--moss-deep);
}

.cell small {
  max-width: 100%;
  overflow: hidden;
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bar {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 4px;
  background: var(--moss);
}

.board-title {
  margin: 4px 0 0;
  font-size: 15px;
}

.ranks {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 220px;
  margin: 0;
  padding: 0;
  overflow: auto;
  list-style: none;
}

.ranks li {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 2px 6px;
  border-radius: 8px;
  background: rgba(255, 248, 230, 0.7);
}

.ranks li.self {
  background: #fff1b8;
}

.who {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mask {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(70, 42, 12, 0.28);
}

.sheet {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(420px, 100%);
  max-height: 70vh;
  margin: 0 auto;
  padding: 14px 14px calc(16px + env(safe-area-inset-bottom));
  overflow: auto;
  border-radius: 16px 16px 0 0;
  background: var(--paper);
}

.sheet h3 {
  margin: 0;
}

.sheet button {
  min-height: 40px;
}

.ghost {
  background: transparent;
}
</style>
