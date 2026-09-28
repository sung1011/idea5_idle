<script setup lang="ts">
import { computed, ref } from 'vue'
import { restCombatCandidates } from '../sim/combat'
import {
  HERB_PVP_COUNTER_RULE,
  HERB_PVP_PLAYER_CAP,
  HERB_PVP_WEED_FAST_COST,
  herbCounterMark,
  herbPlotPace,
  herbPlotShowsWeakness,
  herbWeedCost,
  herbWorkerCounters,
  formatHerbDuration,
  herbHud,
  herbLeaderboard,
  herbPlotLabel,
  herbPlotShort,
  herbProbeCells,
  orderHerbPick,
} from '../sim/herbPvp'
import type { HerbPlot, Worker } from '../sim/types'
import { isFullWorkshopHp } from '../sim/workshopHp'
import CombatAttrIcon from './combatAttrIcon.vue'
import CombatPickSheet from './combatPickSheet.vue'
import { pushFloatTip } from './floatTips'
import PlayerAvatar from './playerAvatar.vue'
import { useGameStore } from './gameStore'

const game = useGameStore()
const aiming = ref(false)
const aimIndex = ref<number | null>(null)
const pickIndex = ref<number | null>(null)
const picked = ref<string[]>([])
const hud = computed(() => herbHud(game.save, Date.now()))
const board = computed(() => herbLeaderboard(game.save))
const plots = computed(() => game.save.herbPvp.plots)
const pickPlot = computed(() => (pickIndex.value == null ? null : plots.value[pickIndex.value] ?? null))
const candidates = computed(() => orderHerbPick(restCombatCandidates(game.save), pickPlot.value?.weakness))
const aimSet = computed(() =>
  aiming.value && aimIndex.value != null ? new Set(herbProbeCells(aimIndex.value)) : new Set<number>(),
)

function stopAim() {
  aiming.value = false
  aimIndex.value = null
}

function toggleAim() {
  if (hud.value.probes < 1) {
    stopAim()
    return
  }
  aiming.value = !aiming.value
  if (!aiming.value) aimIndex.value = null
}

function previewAim(index: number) {
  if (!aiming.value) return
  aimIndex.value = index
}

function onPlot(index: number) {
  const plot = plots.value[index]
  if (!plot) return
  if (aiming.value) {
    game.useHerbProbe(index)
    if (hud.value.probes < 1) stopAim()
    return
  }
  if (plot.cleared) {
    pushFloatTip('这块已经除过', 'err')
    return
  }
  if (plot.workerId) return
  if (hud.value.stamina < HERB_PVP_WEED_FAST_COST) {
    pushFloatTip('体力不足', 'err')
    return
  }
  if (hud.value.playerPlots >= HERB_PVP_PLAYER_CAP) {
    pushFloatTip('最多同时除 3 块', 'err')
    return
  }
  pickIndex.value = index
  picked.value = []
}

function closePick() {
  pickIndex.value = null
  picked.value = []
}

function togglePick(worker: Worker) {
  if (!isFullWorkshopHp(worker)) return
  game.clearWorkerNew(worker.id)
  if (picked.value.includes(worker.id)) {
    picked.value = []
    return
  }
  if (picked.value.length >= 1) {
    pushFloatTip('最多选 1 人', 'err')
    return
  }
  picked.value = [worker.id]
}

function confirmPick() {
  const workerId = picked.value[0]
  if (!workerId) return
  dispatch(workerId)
}

function dispatch(workerId: string) {
  const index = pickIndex.value
  if (index == null) return
  const result = game.startHerbWeed(index, workerId)
  if (result.ok) closePick()
}

function progressOf(plot: HerbPlot): number {
  if (!plot.workerId || plot.cleared) return 0
  return Math.min(1, plot.progressS / herbPlotPace(plot))
}

function canSend(worker: Worker): boolean {
  if (!isFullWorkshopHp(worker)) return false
  const plot = pickPlot.value
  if (!plot) return false
  return hud.value.stamina >= herbWeedCost(herbWorkerCounters(worker.combatAttrs, plot.weakness))
}

function markCounter(worker: Worker): string | null {
  return herbCounterMark(worker.combatAttrs, pickPlot.value?.weakness)
}

function workerName(id: string | null): string {
  if (!id) return ''
  return game.save.workers.find((worker) => worker.id === id)?.name ?? '苦工'
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
      <button type="button" :class="{ on: aiming }" :disabled="hud.probes < 1" @click="toggleAim">
        侦测 {{ hud.probes }}
      </button>
    </div>
    <p class="hint">
      {{
        aiming
          ? '点一块未除的地，揭开以它为中心的 3×3'
          : `点杂草，派满血苦工。${HERB_PVP_COUNTER_RULE}。撞上人只有打死才扣体力`
      }}
    </p>
    <div class="grid" role="grid" aria-label="割草地图" @pointerleave="aimIndex = null">
      <button
        v-for="plot in plots"
        :key="plot.index"
        type="button"
        class="cell"
        :class="{ revealed: plot.revealed, cleared: plot.cleared, mine: !!plot.workerId, aim: aimSet.has(plot.index) }"
        :aria-label="herbPlotLabel(plot)"
        @pointerenter="previewAim(plot.index)"
        @click="onPlot(plot.index)"
      >
        <span class="label">{{ herbPlotShort(plot) }}</span>
        <CombatAttrIcon v-if="herbPlotShowsWeakness(plot)" class="weak-mark" :attr="plot.weakness" />
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
    <CombatPickSheet
      :open="pickIndex != null"
      :max="1"
      :candidates="candidates"
      :picked="picked"
      :runes="{}"
      mode="start"
      title-text="派去这块地"
      confirm-text="除草"
      :note-text="HERB_PVP_COUNTER_RULE"
      :show-runes="false"
      :show-assist="false"
      :can-pick="canSend"
      :recommend-label="markCounter"
      @close="closePick"
      @confirm="confirmPick"
      @toggle="togglePick"
    />
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

.cell.aim {
  background: #fff1b8;
  box-shadow: inset 0 0 0 2px #c9842a;
}

.cell .label {
  max-width: 100%;
  padding-right: 8px;
}

.cell :deep(.weak-mark) {
  position: absolute;
  top: 1px;
  right: 1px;
  z-index: 1;
  width: 12px;
  height: 12px;
  min-width: 12px;
  min-height: 12px;
  max-width: 12px;
  max-height: 12px;
  border-width: 1px;
  border-radius: 3px;
  pointer-events: none;
}

.cell :deep(.weak-mark svg) {
  width: 8px;
  height: 8px;
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
</style>
