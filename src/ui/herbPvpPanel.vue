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
  discardHerbClashEvents,
  herbClashResultText,
  orderHerbPick,
  takeHerbClearEvents,
  takeHerbClashEvents,
} from '../sim/herbPvp'
import type { ClassId, HerbPlot, Worker } from '../sim/types'
import { isFullWorkshopHp } from '../sim/workshopHp'
import ClassIcon from './classIcon.vue'
import CombatAttrIcon from './combatAttrIcon.vue'
import CombatPickSheet from './combatPickSheet.vue'
import {
  createHerbClashBoard,
  herbClashBars,
  herbClashFloat,
  herbClashMotion,
  offerHerbClashes,
  pumpHerbClash,
  skipHerbClash,
  type HerbClashPlaying,
} from './herbClashFx'
import { createHerbClearBoard, herbClearCaption, offerHerbClearFx, pumpHerbClearFx, type HerbClearFx } from './herbClearFx'
import { herbClashFeedText, pushHerbFeed, type HerbFeedLine } from './herbFeed'
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
const clashBoard = createHerbClashBoard()
const clashPlaying = ref<HerbClashPlaying | null>(null)
let clashTimer = 0
const feed = ref<HerbFeedLine[]>([])
let feedSeq = 1
const fxByIndex = computed(() => {
  const map = new Map<number, HerbClearFx>()
  for (const fx of playingFx.value) map.set(fx.plotIndex, fx)
  return map
})

function fxOf(index: number): HerbClearFx | null {
  return fxByIndex.value.get(index) ?? null
}

function rememberFeed(lines: HerbFeedLine[]) {
  if (!lines.length) return
  feed.value = pushHerbFeed(feed.value, lines)
}

function syncClearFx() {
  const now = Date.now()
  pumpHerbClearFx(clearBoard, now)
  const incoming = takeHerbClearEvents()
  if (incoming.length) {
    offerHerbClearFx(clearBoard, incoming, now)
    rememberFeed(
      incoming.map((event) => ({
        id: feedSeq++,
        kind: event.tone,
        text: herbClearCaption(event),
      })),
    )
  }
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

function syncClash() {
  const now = Date.now()
  pumpHerbClash(clashBoard, now)
  const incoming = takeHerbClashEvents()
  if (incoming.length) {
    offerHerbClashes(clashBoard, incoming, now)
    rememberFeed(
      incoming.map((event) => ({
        id: feedSeq++,
        kind: 'clash',
        text: herbClashFeedText(event),
      })),
    )
  }
  clashPlaying.value = clashBoard.playing
  if (clashTimer) window.clearTimeout(clashTimer)
  const until = clashBoard.playing?.until ?? 0
  if (until <= now) {
    clashTimer = 0
    return
  }
  clashTimer = window.setTimeout(syncClash, Math.max(16, until - now))
}

function skipClash() {
  skipHerbClash(clashBoard, Date.now())
  syncClash()
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

const clashView = computed(() => {
  const playing = clashPlaying.value
  if (!playing) return null
  const event = playing.event
  const motion = herbClashMotion(event, playing.phase)
  const bars = herbClashBars(event, playing.phase)
  const float = herbClashFloat(event, playing.phase)
  return {
    col: (event.plotIndex % 8) + 1,
    row: Math.floor(event.plotIndex / 8) + 1,
    phase: playing.phase,
    result: playing.phase === 'result' ? herbClashResultText(event.result) : '',
    player: event.player,
    rival: event.rival,
    motion,
    bars,
    float,
  }
})

function workerClass(id: string): ClassId {
  return (id || 'laborer') as ClassId
}

onMounted(() => {
  discardHerbClearEvents()
  discardHerbClashEvents()
  window.addEventListener('pointerdown', onWindowPointerDown, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onWindowPointerDown, true)
  if (fxTimer) window.clearTimeout(fxTimer)
  if (clashTimer) window.clearTimeout(clashTimer)
})
watch(() => game.save, () => {
  syncClearFx()
  syncClash()
})

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
    <div class="map">
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
          <b class="fx-text">{{ herbClearCaption(fxOf(cell.plot.index)!) }}</b>
        </span>
      </button>
    </div>
      <div v-if="clashView" class="clash-layer">
      <div
        class="clash"
        :style="{ gridColumn: String(clashView.col), gridRow: String(clashView.row) }"
      >
        <button type="button" class="clash-card" aria-label="撞车对战，点击跳过" @click="skipClash">
          <span class="side">
            <span class="mug" :class="{ lunge: clashView.motion.lunge === 'player', hurt: clashView.motion.hurt === 'player' }">
              <ClassIcon :name="workerClass(clashView.player.classId)" />
            </span>
            <i
              class="hp"
              :key="`p-${clashView.phase}`"
              :style="{
                '--from': `${(clashView.bars.player.from * 100).toFixed(2)}%`,
                '--to': `${(clashView.bars.player.to * 100).toFixed(2)}%`,
              }"
            />
            <b v-if="clashView.float?.side === 'player'" class="dmg">-{{ clashView.float.amount }}</b>
          </span>
          <span class="side foe-side">
            <span class="mug" :class="{ lunge: clashView.motion.lunge === 'rival', hurt: clashView.motion.hurt === 'rival' }">
              <PlayerAvatar :id="clashView.rival.avatarId" />
            </span>
            <i
              class="hp foe-hp"
              :key="`r-${clashView.phase}`"
              :style="{
                '--from': `${(clashView.bars.rival.from * 100).toFixed(2)}%`,
                '--to': `${(clashView.bars.rival.to * 100).toFixed(2)}%`,
              }"
            />
            <b v-if="clashView.float?.side === 'rival'" class="dmg">-{{ clashView.float.amount }}</b>
          </span>
          <em v-if="clashView.result" class="result">{{ clashView.result }}</em>
        </button>
      </div>
      </div>
    </div>
    <section v-if="feed.length" class="herb-feed" aria-label="割草记录">
      <h3>最近</h3>
      <ul>
        <li v-for="line in feed" :key="line.id" :class="line.kind">{{ line.text }}</li>
      </ul>
    </section>
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

.map {
  position: relative;
}

.grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 3px;
}

.clash-layer {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 3px;
  pointer-events: none;
}

.clash {
  position: relative;
  z-index: 6;
  pointer-events: none;
}

.clash-card {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 50%;
  z-index: 7;
  display: grid;
  grid-template-columns: auto auto;
  gap: 4px 10px;
  width: max-content;
  padding: 6px 8px;
  transform: translateX(-50%);
  pointer-events: auto;
  border-width: 2px;
  border-radius: 10px;
  background: #fff8ee;
}

.side {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}

.mug {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 2px solid #c9842a;
  border-radius: 50%;
  background: #ffe7c2;
}

.mug :deep(.face) {
  width: 28px;
  height: 28px;
  border-width: 1px;
}

.mug :deep(.class-ico) {
  width: 20px;
  height: 20px;
}

.hp {
  position: relative;
  display: block;
  width: 46px;
  height: 6px;
  overflow: hidden;
  border-radius: 99px;
  background: #e7d3b4;
}

.hp::before {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: var(--to);
  background: #7ad64e;
  content: '';
  animation: herb-hp 0.45s linear;
}

.foe-hp::before {
  background: #e23b3b;
}

.dmg {
  position: absolute;
  top: -4px;
  color: #e23b3b;
  font-size: 12px;
  animation: herb-dmg 0.7s ease-out forwards;
}

.result {
  grid-column: 1 / -1;
  margin: 0;
  font-style: normal;
  font-size: 13px;
  font-weight: 800;
  text-align: center;
}

.lunge {
  animation: herb-lunge-right 0.7s ease-in-out;
}

.foe-side .lunge {
  animation-name: herb-lunge-left;
}

.hurt {
  animation: herb-hurt 0.7s linear;
}

@keyframes herb-hp {
  from {
    width: var(--from);
  }

  to {
    width: var(--to);
  }
}

@keyframes herb-dmg {
  to {
    opacity: 0;
    transform: translateY(-12px);
  }
}

@keyframes herb-lunge-right {
  0%,
  100% {
    transform: translateX(0);
  }

  40% {
    transform: translateX(16px);
  }
}

@keyframes herb-lunge-left {
  0%,
  100% {
    transform: translateX(0);
  }

  40% {
    transform: translateX(-16px);
  }
}

@keyframes herb-hurt {
  35%,
  55% {
    background: #ffd0c8;
    box-shadow: 0 0 0 3px #e23b3b;
  }
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
  animation: herb-flash 1.5s ease-out forwards;
}

.cell.fx.rival {
  animation-name: herb-flash-rival;
}

.cell.fx.alert,
.cell.fx.rival.alert {
  animation: herb-flash 1.5s ease-out forwards, herb-alert 1.5s linear;
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
  animation: herb-leaf 1.5s ease-out forwards;
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
  top: 50%;
  left: 50%;
  z-index: 3;
  color: #3d6b22;
  transform: translate(-50%, -50%);
  font-size: 15px;
  font-weight: 800;
  line-height: 1.1;
  white-space: nowrap;
  paint-order: stroke fill;
  -webkit-text-stroke: 3px #fff8e8;
  text-shadow:
    0 0 1px #fff8e8,
    1px 0 0 #fff8e8,
    -1px 0 0 #fff8e8,
    0 1px 0 #fff8e8,
    0 -1px 0 #fff8e8;
  animation: herb-float 2.5s ease-out forwards;
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
  0%,
  82% {
    opacity: 1;
    transform: translate(-50%, -50%);
  }

  100% {
    opacity: 0;
    transform: translate(-50%, -62%);
  }
}

@keyframes herb-flash {
  0% {
    background: #fff7c2;
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(255, 196, 40, 0.9);
  }

  28% {
    background: #ffe56a;
    transform: scale(1.22);
    box-shadow: 0 0 0 4px rgba(255, 186, 32, 0.9);
  }

  100% {
    background: #f3ffe8;
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(255, 196, 40, 0);
  }
}

@keyframes herb-flash-rival {
  0% {
    background: #ffd0c4;
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(226, 59, 59, 0.85);
  }

  28% {
    background: #ff8d78;
    transform: scale(1.22);
    box-shadow: 0 0 0 4px rgba(226, 59, 59, 0.8);
  }

  100% {
    background: #fff1ee;
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(226, 59, 59, 0);
  }
}

@keyframes herb-flash-still {
  0%,
  45% {
    background: #fff7c2;
  }

  100% {
    background: #f3ffe8;
  }
}

@keyframes herb-flash-still-rival {
  0%,
  45% {
    background: #ffd0c4;
  }

  100% {
    background: #fff1ee;
  }
}

@keyframes herb-fade {
  0%,
  82% {
    opacity: 1;
  }

  100% {
    opacity: 0;
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
  .cell.fx.alert {
    animation: herb-flash-still 1.5s linear;
    transform: none;
  }

  .cell.fx.rival,
  .cell.fx.rival.alert {
    animation: herb-flash-still-rival 1.5s linear;
    transform: none;
  }

  .cell.fx .leaf {
    display: none;
  }

  .cell.fx .fx-text {
    animation: herb-fade 2.5s linear forwards;
    transform: translate(-50%, -50%);
  }

  .lunge,
  .foe-side .lunge,
  .hurt {
    animation: herb-hurt 0.45s linear;
    transform: none;
  }

  .hp::before,
  .dmg {
    animation: none;
  }

  .hp::before {
    width: var(--to);
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

.herb-feed {
  max-height: 118px;
  margin: 8px 0 0;
  padding: 4px 8px 6px;
  overflow: auto;
  border-radius: 8px;
  background: rgba(255, 248, 230, 0.9);
}

.herb-feed h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
}

.herb-feed ul {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 2px 0 0;
  padding: 0;
  list-style: none;
}

.herb-feed li {
  overflow: hidden;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.herb-feed .self {
  color: #3d6b22;
}

.herb-feed .rival,
.herb-feed .clash {
  color: #9d2c2c;
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
