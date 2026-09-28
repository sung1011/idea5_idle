<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
  beijingDayRemainS,
  formatHerbDuration,
  herbHud,
  herbStaminaBubbleText,
  herbStaminaFill,
  HERB_PVP_STAMINA_MAX,
  herbLeaderboard,
  herbPlotLabel,
  herbPlotShort,
  herbPlotSpot,
  herbProbeCells,
  discardHerbClearEvents,
  orderHerbPick,
  takeHerbClearEvents,
} from '../sim/herbPvp'
import type { HerbPlot, Worker } from '../sim/types'
import { isFullWorkshopHp } from '../sim/workshopHp'
import CombatAttrIcon from './combatAttrIcon.vue'
import CombatPickSheet from './combatPickSheet.vue'
import { createHerbClearBoard, offerHerbClearFx, pumpHerbClearFx, type HerbClearFx } from './herbClearFx'
import { herbProbeAimAfterPlot, herbProbeAimOnOutside, nextHerbProbeAim } from './herbProbeAim'
import { pushFloatTip } from './floatTips'
import PlayerAvatar from './playerAvatar.vue'
import { useGameStore } from './gameStore'
import { useFrameNow } from './visualProgress'

const game = useGameStore()
const aiming = ref(false)
const aimIndex = ref<number | null>(null)
const gridEl = ref<HTMLElement | null>(null)
const probeEl = ref<HTMLElement | null>(null)
const pickIndex = ref<number | null>(null)
const picked = ref<string[]>([])
const staminaEl = ref<HTMLElement | null>(null)
const staminaOpen = ref(false)
const frameNow = useFrameNow()
const hud = computed(() => herbHud(game.save, Date.now()))
const dayRemainText = computed(() => formatHerbDuration(beijingDayRemainS(frameNow.value)))
const staminaView = computed(() => {
  const state = game.save.herbPvp
  const extra = Math.min(1.05, Math.max(0, (frameNow.value - game.save.lastTick) / 1000))
  const stamina = state?.stamina ?? 0
  const points = Math.min(HERB_PVP_STAMINA_MAX, Math.max(0, Math.floor(stamina)))
  return {
    text: `${points}/${HERB_PVP_STAMINA_MAX}`,
    fill: herbStaminaFill(stamina, state?.staminaAccS ?? 0, extra),
    bubble: herbStaminaBubbleText(stamina, state?.staminaAccS ?? 0, extra),
  }
})
const board = computed(() => herbLeaderboard(game.save))
const plots = computed(() => game.save.herbPvp.plots)
const cells = computed(() =>
  plots.value.map((plot) => ({
    plot,
    spot: herbPlotSpot(game.save, plot),
  })),
)
const pickPlot = computed(() => (pickIndex.value == null ? null : plots.value[pickIndex.value] ?? null))
const candidates = computed(() => orderHerbPick(restCombatCandidates(game.save), pickPlot.value?.weakness))
const aimSet = computed(() =>
  aiming.value && aimIndex.value != null ? new Set(herbProbeCells(aimIndex.value)) : new Set<number>(),
)
const clearBoard = createHerbClearBoard()
const playingFx = ref<HerbClearFx[]>([])
let fxTimer = 0
const fxByIndex = computed(() => {
  const map = new Map<number, HerbClearFx>()
  for (const fx of playingFx.value) map.set(fx.plotIndex, fx)
  return map
})

function fxOf(index: number): HerbClearFx | null {
  return fxByIndex.value.get(index) ?? null
}

function syncClearFx() {
  const now = Date.now()
  pumpHerbClearFx(clearBoard, now)
  const incoming = takeHerbClearEvents()
  if (incoming.length) offerHerbClearFx(clearBoard, incoming, now)
  playingFx.value = clearBoard.playing.slice()
  if (fxTimer) window.clearTimeout(fxTimer)
  const times = [...clearBoard.playing.map((fx) => fx.until), ...clearBoard.queued.map((fx) => fx.readyAt)]
  const next = times.filter((time) => time > now).sort((a, b) => a - b)[0]
  if (next == null) {
    fxTimer = 0
    return
  }
  fxTimer = window.setTimeout(syncClearFx, Math.max(16, next - now))
}

function toggleAim() {
  aiming.value = nextHerbProbeAim(aiming.value, hud.value.probes)
  if (!aiming.value) aimIndex.value = null
}

function onWindowPointerDown(ev: PointerEvent) {
  const target = ev.target
  if (!(target instanceof Node)) return
  if (staminaOpen.value && !staminaEl.value?.contains(target)) staminaOpen.value = false
  if (!aiming.value) return
  if (gridEl.value?.contains(target)) return
  if (probeEl.value?.contains(target)) return
  aiming.value = herbProbeAimOnOutside(aiming.value)
  aimIndex.value = null
}

function toggleStaminaBubble() {
  staminaOpen.value = !staminaOpen.value
}

onMounted(() => {
  discardHerbClearEvents()
  window.addEventListener('pointerdown', onWindowPointerDown, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onWindowPointerDown, true)
  if (fxTimer) window.clearTimeout(fxTimer)
})
watch(() => game.save.elapsedS, () => syncClearFx())

function previewAim(index: number) {
  if (!aiming.value) return
  aimIndex.value = index
}

function onPlot(index: number) {
  const plot = plots.value[index]
  if (!plot) return
  if (aiming.value) {
    const result = game.useHerbProbe(index)
    aiming.value = herbProbeAimAfterPlot(aiming.value, result.ok)
    if (!aiming.value) aimIndex.value = null
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

function plotAria(plot: HerbPlot, spot: ReturnType<typeof herbPlotSpot>): string {
  if (!spot) return herbPlotLabel(plot)
  return `${herbPlotLabel(plot)}，${spot.name}，剩余血量 ${spot.hp}`
}
</script>

<template>
  <div class="herb">
    <div ref="staminaEl" class="stamina" :class="{ open: staminaOpen }">
      <button
        type="button"
        class="meter"
        :aria-expanded="staminaOpen"
        :aria-label="`割草体力 ${staminaView.text}`"
        @click="toggleStaminaBubble"
      >
        <i class="fill" :style="{ width: `${(staminaView.fill * 100).toFixed(2)}%` }" />
        <span>{{ staminaView.text }}</span>
      </button>
      <p v-if="staminaOpen" class="bubble">{{ staminaView.bubble }}</p>
    </div>
    <p v-if="hud.lastRewardText" class="reward">上次日结 {{ hud.lastRewardText }}</p>
    <div ref="probeEl" class="probes">
      <button type="button" :class="{ on: aiming }" :disabled="hud.probes < 1" @click="toggleAim">
        侦测 {{ hud.probes }}
      </button>
    </div>
    <p class="hint">
      {{
        aiming
          ? '点一块地，揭开以它为中心的 3×3。再点侦测或点地图外可取消'
          : `点杂草，派满血苦工。${HERB_PVP_COUNTER_RULE}。撞上人只有打死才扣体力`
      }}
    </p>
    <div ref="gridEl" class="grid" role="grid" aria-label="割草地图" @pointerleave="aimIndex = null">
      <button
        v-for="cell in cells"
        :key="cell.plot.index"
        type="button"
        class="cell"
        :class="{
          revealed: cell.plot.revealed,
          cleared: cell.plot.cleared,
          mine: !!cell.plot.workerId,
          aim: aimSet.has(cell.plot.index),
          fx: !!fxOf(cell.plot.index),
          rival: fxOf(cell.plot.index)?.tone === 'rival',
          alert: !!fxOf(cell.plot.index)?.alert,
          spot: !!cell.spot,
        }"
        :aria-label="plotAria(cell.plot, cell.spot)"
        @pointerenter="previewAim(cell.plot.index)"
        @click="onPlot(cell.plot.index)"
      >
        <span class="label">{{ herbPlotShort(cell.plot) }}</span>
        <CombatAttrIcon v-if="herbPlotShowsWeakness(cell.plot) && !cell.spot" class="weak-mark" :attr="cell.plot.weakness" />
        <span v-if="cell.spot" class="foe">
          <PlayerAvatar :id="cell.spot.avatarId" />
          <em>{{ cell.spot.name }}</em>
          <b>{{ cell.spot.hp }}/{{ cell.spot.hpMax }}</b>
        </span>
        <i v-if="cell.plot.workerId" class="bar" :style="{ width: `${(progressOf(cell.plot) * 100).toFixed(2)}%` }" />
        <small v-if="cell.plot.workerId && !cell.spot">{{ workerName(cell.plot.workerId) }}</small>
        <span v-if="fxOf(cell.plot.index)" class="fx-layer" aria-hidden="true">
          <i class="leaf" />
          <i class="leaf" />
          <i class="leaf" />
          <i class="leaf" />
          <b class="fx-text">{{ fxOf(cell.plot.index)!.text }}</b>
        </span>
      </button>
    </div>
    <h3 class="board-title">割草排行</h3>
    <p class="day-remain">距日结 {{ dayRemainText }}</p>
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

.stamina {
  position: relative;
}

.stamina.open {
  z-index: 4;
}

.meter {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 28px;
  overflow: hidden;
  padding: 0;
}

.meter .fill {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  background: var(--moss);
  pointer-events: none;
}

.meter span {
  position: relative;
  z-index: 1;
  font-size: 13px;
  font-weight: 700;
}

.bubble {
  position: absolute;
  z-index: 1;
  top: calc(100% + 4px);
  right: 0;
  left: 0;
  margin: 0;
  padding: 6px 8px;
  border: 2px solid #c9842a;
  border-radius: 8px;
  background: #fff8ee;
  color: var(--ink);
  font-size: 12px;
  line-height: 1.4;
  text-align: center;
}

.meta,
.hint,
.reward,
.day-remain {
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
  min-height: 52px;
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

.cell.spot {
  border-color: #a33b32;
}

.foe {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0;
  padding: 1px 1px 3px;
  background: rgba(255, 236, 214, 0.94);
  pointer-events: none;
}

.foe :deep(.face) {
  width: 14px;
  height: 14px;
  border-width: 1px;
}

.foe :deep(svg) {
  width: 10px;
  height: 10px;
}

.foe em,
.foe b {
  max-width: 100%;
  overflow: hidden;
  font-style: normal;
  font-size: 8px;
  font-weight: 600;
  line-height: 1.05;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.foe b {
  color: #8d2a2a;
  font-weight: 700;
}

.cell.aim {
  background: #fff1b8;
  box-shadow: inset 0 0 0 2px #c9842a;
}

.cell.fx {
  z-index: 2;
  overflow: visible;
  animation: herb-flash 0.6s linear;
}

.cell.fx.rival {
  animation-name: herb-flash-rival;
}

.cell.fx.alert,
.cell.fx.rival.alert {
  animation: herb-flash 0.6s linear, herb-alert 0.6s linear;
}

.cell.fx.rival.alert {
  animation-name: herb-flash-rival, herb-alert;
}

.fx-layer {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
}

.leaf {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 6px;
  height: 8px;
  margin: -4px 0 0 -3px;
  background: #6a9a3a;
  border-radius: 0 70% 0 70%;
  animation: herb-leaf 0.6s ease-out forwards;
}

.cell.rival .leaf {
  background: #d15a4a;
}

.leaf:nth-child(1) {
  --dx: -14px;
  --dy: -16px;
  --rot: -40deg;
}

.leaf:nth-child(2) {
  --dx: 14px;
  --dy: -12px;
  --rot: 30deg;
}

.leaf:nth-child(3) {
  --dx: -10px;
  --dy: 8px;
  --rot: -20deg;
}

.leaf:nth-child(4) {
  --dx: 12px;
  --dy: 10px;
  --rot: 50deg;
}

.fx-text {
  position: absolute;
  top: 36%;
  left: 50%;
  color: #3d6b22;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
  animation: herb-float 0.6s ease-out forwards;
}

.cell.rival .fx-text {
  color: #9d2c2c;
}

@keyframes herb-leaf {
  to {
    opacity: 0;
    transform: translate(var(--dx), var(--dy)) rotate(var(--rot));
  }
}

@keyframes herb-float {
  to {
    opacity: 0;
    transform: translate(-50%, -16px);
  }
}

@keyframes herb-flash {
  0% {
    background: #fff7c2;
  }

  100% {
    background: #f3ffe8;
  }
}

@keyframes herb-flash-rival {
  0% {
    background: #ffd0c4;
  }

  100% {
    background: #fff1ee;
  }
}

@keyframes herb-alert {
  0%,
  100% {
    box-shadow: inset 0 0 0 2px transparent;
  }

  40% {
    box-shadow: inset 0 0 0 2px #e23b3b;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cell.fx,
  .cell.fx.rival,
  .cell.fx.alert,
  .cell.fx.rival.alert {
    animation: herb-flash 0.6s linear;
  }

  .cell.fx.rival,
  .cell.fx.rival.alert {
    animation-name: herb-flash-rival;
  }

  .cell.fx .leaf {
    display: none;
  }

  .cell.fx .fx-text {
    animation: none;
    opacity: 1;
  }
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
  z-index: 2;
  height: 4px;
  background: var(--moss);
}

.board-title {
  margin: 4px 0 0;
  font-size: 15px;
}

.day-remain {
  color: var(--ink);
  font-weight: 700;
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
