<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { assignedWorkers, currentSpeed, stationBottleneckText, stationConsumeGroups, stationCycleS } from '../sim/query'
import { gatherStatusText, isGatherFrozen } from '../sim/gather'
import { formatRemainClock } from '../sim/march'
import { categoryPickOptions, selectedCategoryDef } from '../sim/stationProgress'
import { isEmptyHp, isWoundedHp, stationHpEfficiencyLabel, stationHpWorkMul } from '../sim/workshopHp'
import { findCategory, ITEM_DEF, STATION_DEF, xpToNextLevel } from '../sim/tables'
import type { CategoryId, StationId, Worker } from '../sim/types'
import ActButton from './actButton.vue'
import ConsumeJumpItem from './consumeJumpItem.vue'
import WorkerAvatar from './workerAvatar.vue'
import { formatConsumeToken } from './encounterDeal'
import { breakthroughChoices } from '../sim/beastCraft'
import { itemQty } from '../sim/bank'
import { useGameStore } from './gameStore'
import { guideAlchemyProgressFlash } from '../sim/guideQuest'
import { itemSourceFlashCategories, isItemSourceStationFlash } from './itemSource'
import { pushFloatTip } from './floatTips'
import { MANUAL_DUTY_REASON } from './workerDrag'
import HelpMark from './helpMark.vue'
import ModeHelpSheet from './modeHelpSheet.vue'
import { stationHelpCopy } from './stationHelp'
import StationTips from './stationTips.vue'
import UiSelect from './uiSelect.vue'
import type { UiSelectOption } from './uiSelect'
import { qualityOf, workerQualityNameStyle } from './workerQuality'
import { workerShortName } from './workerGroups'
import { stationProgressStyle } from './workshopTabs'
import { craftHaltText, craftProgressView, useFrameNow } from './visualProgress'

const props = defineProps<{
  stationId: StationId
}>()

const emit = defineEmits<{
  close: []
  openWorker: [worker: Worker]
}>()

const game = useGameStore()
const helpOpen = ref(false)
const sealAsk = ref(false)
const coreOpen = ref(false)
const beastCook = computed(() => props.stationId === 'cooking')
const beastAlchemy = computed(() => props.stationId === 'alchemy')
const coreStations = computed(() => breakthroughChoices(game.save))
const def = computed(() => STATION_DEF[props.stationId])
const station = computed(() => game.save.stations[props.stationId])
const cat = computed(() => selectedCategoryDef(game.save, props.stationId))
const crew = computed(() => assignedWorkers(game.save, props.stationId))
const duty = computed(() => crew.value[0] ?? null)
const cycleS = computed(() => stationCycleS(game.save, props.stationId))
const speed = computed(() => currentSpeed(game.save, props.stationId))
const speedFactor = computed(() => (cycleS.value > 0 ? speed.value * cycleS.value : 0))
const hpMul = computed(() => stationHpWorkMul(game.save, props.stationId))
const hpLabel = computed(() => {
  const worker = duty.value
  if (!worker) return '空岗'
  const body = isEmptyHp(worker) ? '空血' : isWoundedHp(worker) ? '残血' : '满血'
  return `${stationHpEfficiencyLabel(hpMul.value)} · ${body}`
})
const xpNeed = computed(() => xpToNextLevel(station.value.stationLevel))
const xpPct = computed(() => Math.min(100, Math.round((station.value.stationXp / Math.max(1, xpNeed.value)) * 100)))
const consumeGroups = computed(() => stationConsumeGroups(game.save, props.stationId))
const stallLine = computed(() => stationBottleneckText(game.save, props.stationId))
const gatherLine = computed(() => gatherStatusText(game.save, props.stationId))
const frozen = computed(() => isGatherFrozen(game.save, props.stationId))
const help = computed(() => stationHelpCopy(props.stationId, station.value.stationLevel))
const playLine = computed(() => help.value.rows.find((row) => row.label === '怎么玩')?.text ?? '')
const outputLine = computed(() => {
  const bits = cat.value.outputs.map((io) => `${ITEM_DEF[io.itemId].label} ×${io.qty}`)
  const tail = bits.length ? bits.join('～') : '无'
  return `${tail}（${cat.value.label}）`
})
const pickCaption = computed(() => {
  if (props.stationId === 'hunting') return '猎物'
  if (props.stationId === 'mining') return '矿点'
  if (props.stationId === 'cooking') return '菜谱'
  return '品类'
})
const pickOptions = computed(() => categoryPickOptions(game.save, props.stationId))
const sourceFlashCats = computed(() => itemSourceFlashCategories(props.stationId))
const sourceFlashStation = computed(() => isItemSourceStationFlash(props.stationId))
const alchemyProgressFlash = computed(() => guideAlchemyProgressFlash(game.save, props.stationId))
const showCategoryPick = computed(() => pickOptions.value.length > 1 || sourceFlashCats.value.length > 0)
const categorySelectOptions = computed<UiSelectOption[]>(() => {
  const rows: UiSelectOption[] = pickOptions.value.map((c) => ({
    value: c.id,
    label: c.unlocked ? c.label : `${c.label}（Lv${c.unlockLevel}）`,
    disabled: !c.unlocked,
  }))
  const have = new Set(rows.map((row) => row.value))
  for (const id of sourceFlashCats.value) {
    if (have.has(id)) continue
    const row = findCategory(props.stationId, id)
    if (!row) continue
    rows.push({ value: id, label: `${row.label}（Lv${row.unlockLevel}）`, disabled: true })
  }
  return rows
})
const frameNow = useFrameNow()
const tone = computed(() => stationProgressStyle(props.stationId))
const craft = computed(() =>
  craftProgressView({
    progress: station.value.progress,
    speed: speed.value,
    assigned: crew.value.length,
    paused: !!station.value.stallReason || frozen.value,
    closed: station.value.closed,
    lastTick: game.save.lastTick,
    now: frameNow.value,
  }),
)
const craftSide = computed(() => {
  if (!craft.value.halted) return `剩 ${formatRemainClock(Math.ceil(craft.value.remainS))}`
  if (craft.value.halt === 'paused') return stallLine.value || (frozen.value ? gatherLine.value : null) || '暂停'
  return craftHaltText(craft.value.halt) ?? '暂停'
})

function dutyText(worker: Worker) {
  return `${workerShortName(worker)} · ${qualityOf(worker).label} · Lv${worker.level}`
}

function consumeText(row: { itemId: (typeof consumeGroups.value)[number][number]['itemId']; need: number; have: number }) {
  return formatConsumeToken({ kind: 'item', itemId: row.itemId, qty: row.need }, row.have)
}

function onPick(value: string) {
  const opt = pickOptions.value.find((c) => c.id === value)
  if (!opt?.unlocked) return
  game.selectCategory(props.stationId, value as CategoryId)
}

function onWithdraw() {
  if (!duty.value) return
  pushFloatTip(MANUAL_DUTY_REASON)
}

function onSwap() {
  pushFloatTip(MANUAL_DUTY_REASON)
}

function onWorker() {
  const worker = duty.value
  if (!worker) {
    pushFloatTip('这一站还没有人')
    return
  }
  emit('openWorker', worker)
}

function onAskSeal() {
  sealAsk.value = true
}

function onCancelSeal() {
  sealAsk.value = false
}

function onConfirmSeal() {
  const result = game.toggleStationClosed(props.stationId)
  sealAsk.value = false
  if (!result.ok && result.reason) pushFloatTip(result.reason)
}

function onOpenStation() {
  const result = game.toggleStationClosed(props.stationId)
  if (!result.ok && result.reason) pushFloatTip(result.reason)
}

function onHelpKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape') {
    if (sealAsk.value) sealAsk.value = false
    else if (helpOpen.value) helpOpen.value = false
    else emit('close')
  }
}

onMounted(() => window.addEventListener('keydown', onHelpKey))
onUnmounted(() => window.removeEventListener('keydown', onHelpKey))
</script>

<template>
  <Teleport to="body">
    <div class="modal" role="presentation" @click.self="emit('close')">
      <section
        class="sheet"
        role="dialog"
        aria-modal="true"
        :aria-label="`${def.label}详情`"
        :data-station="stationId"
        :class="{ 'guide-flash': sourceFlashStation }"
      >
        <StationTips :station-id="stationId" />
        <header class="page-head">
          <h2 class="title">
            {{ def.label }}
            <span class="cat">{{ cat.label }}</span>
          </h2>
          <HelpMark :label="`查看${def.label}说明`" @click="helpOpen = true" />
          <button type="button" class="close" aria-label="关闭" @click="emit('close')">×</button>
        </header>
        <label v-if="showCategoryPick" class="pick">
          <span>{{ pickCaption }}</span>
          <UiSelect
            :model-value="station.selectedCategory"
            :options="categorySelectOptions"
            :aria-label="pickCaption"
            :flash-values="sourceFlashCats"
            @update:model-value="onPick"
          />
        </label>
        <dl class="fields">
          <div>
            <dt>在岗</dt>
            <dd>
              <ul v-if="crew.length" class="duty-list">
                <li v-for="worker in crew" :key="worker.id">
                  <WorkerAvatar
                    size="md"
                    :race="worker.race"
                    :quality="worker.qualityTier"
                    :worker-id="worker.id"
                  />
                  <span :style="workerQualityNameStyle(worker)">{{ dutyText(worker) }}</span>
                </li>
              </ul>
              <template v-else>空岗</template>
            </dd>
          </div>
          <div>
            <dt>效率 / 体力</dt>
            <dd :class="{ low: hpMul < 1 }">{{ hpLabel }}</dd>
          </div>
          <div class="progress" :class="{ 'guide-flash': alchemyProgressFlash }">
            <dt>制造进度</dt>
            <dd>
              <div class="craft" :class="{ halt: craft.halted }" :style="craft.halted ? undefined : tone">
                <i
                  class="craft-bar"
                  role="progressbar"
                  aria-label="制造进度"
                  :aria-valuenow="craft.percent"
                  aria-valuemin="0"
                  aria-valuemax="100"
                  :aria-valuetext="craftSide"
                >
                  <b :style="{ width: craft.fillPct.toFixed(2) + '%' }" />
                  <em>{{ craft.percent }}%</em>
                </i>
                <span class="craft-side">{{ craftSide }}</span>
              </div>
            </dd>
          </div>
          <div>
            <dt>周期 / 速度</dt>
            <dd>{{ cycleS }}s · ×{{ speedFactor.toFixed(2) }}</dd>
          </div>
          <div>
            <dt>站经验</dt>
            <dd>Lv{{ station.stationLevel }} · {{ xpPct }}%</dd>
          </div>
          <div>
            <dt>消耗</dt>
            <dd>
              <template v-if="consumeGroups.length">
                <template v-for="(group, gi) in consumeGroups" :key="gi">
                  <span v-if="gi"> / </span>
                  <template v-for="(row, i) in group" :key="row.itemId">
                    <span v-if="i">、</span>
                    <ConsumeJumpItem :item-id="row.itemId" :text="consumeText(row)" :short="row.short" />
                  </template>
                </template>
              </template>
              <template v-else>无（{{ stationId === 'mining' || stationId === 'hunting' || stationId === 'herbalism' ? '采集' : '无配方' }}）</template>
            </dd>
          </div>
          <div>
            <dt>产出</dt>
            <dd>{{ outputLine }}</dd>
          </div>
          <div>
            <dt>怎么玩</dt>
            <dd>{{ playLine }}</dd>
          </div>
        </dl>
        <p v-if="gatherLine || frozen" class="note">{{ gatherLine || '采集暂停' }}</p>
        <p v-if="station.craftNotice" class="note">{{ station.craftNotice }}</p>
        <p v-if="stallLine" class="note jam">{{ stallLine }}</p>
        <section v-if="beastCook || beastAlchemy" class="beast-craft" aria-label="兽材料理">
          <h3>兽材料理</h3>
          <template v-if="beastCook">
            <ActButton icon="crate" kind="primary" tone="produce" cost="兽骨 1 · 肉 10" @click="game.craftBoneSoup()">骨汤</ActButton>
            <ActButton icon="crate" kind="primary" tone="produce" cost="兽筋 1 · 香料 10" @click="game.craftHunterSkewer()">猎人肉串</ActButton>
            <ActButton icon="crate" kind="primary" tone="produce" cost="心脏 1 · 肉 20 · 香料 10" @click="game.craftBeastFeast()">酋长宴</ActButton>
          </template>
          <ActButton v-if="beastAlchemy" icon="crate" kind="primary" tone="produce" cost="困兽油脂 1 · 草 10" @click="game.craftBeastOil()">狂兽油</ActButton>
          <ActButton icon="crate" kind="primary" tone="produce" cost="困兽之核 ×1" :disabled="itemQty(game.save, 'beastCore') < 1" @click="coreOpen = true">困兽之核突破</ActButton>
        </section>
        <div class="actions">
          <button type="button" :disabled="!duty" @click="onWithdraw">撤出</button>
          <button type="button" @click="onSwap">换人</button>
          <button type="button" @click="onWorker">苦工详情</button>
        </div>
        <div class="seal">
          <ActButton v-if="station.closed" icon="check" kind="minor" @click="onOpenStation">开启</ActButton>
          <template v-else>
            <p v-if="sealAsk" class="seal-ask" role="alertdialog" :aria-label="`确认封闭${def.label}`">
              封闭后营地不再自动派到这一站，已在岗的人继续干。
              <button type="button" @click="onCancelSeal">取消</button>
              <button type="button" @click="onConfirmSeal">确定封闭</button>
            </p>
            <ActButton v-else icon="close" kind="danger" @click="onAskSeal">封闭</ActButton>
          </template>
        </div>
      </section>
    </div>
    <div v-if="coreOpen" class="modal core" role="presentation" @click.self="coreOpen = false">
      <section class="sheet" role="dialog" aria-label="选择突破站点">
        <header>
          <h2 class="title">困兽之核</h2>
          <button type="button" class="close" aria-label="关闭" @click="coreOpen = false">×</button>
        </header>
        <p class="note">选一座已经开放的站点，直接升 1 级。</p>
        <button
          v-for="id in coreStations"
          :key="id"
          type="button"
          class="craft"
          @click="coreOpen = false; game.breakthroughStation(id)"
        >
          {{ STATION_DEF[id].label }}
        </button>
      </section>
    </div>
    <ModeHelpSheet v-if="helpOpen" :title="help.title" :rows="help.rows" @close="helpOpen = false" />
  </Teleport>
</template>

<style scoped>
.modal {
  position: fixed;
  inset: 0;
  z-index: var(--z-sheet);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 16px 12px 0;
  background: rgba(8, 28, 14, 0.58);
}

.sheet {
  position: relative;
  width: min(480px, 100%);
  max-height: min(78vh, 640px);
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 16px calc(16px + var(--dock-height));
  border: 3px solid var(--gold-deep);
  border-radius: 16px 16px 12px 12px;
  background: var(--wood-face);
  box-shadow: 0 6px 0 var(--shadow);
}

header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title {
  flex: 1 1 auto;
  margin: 0;
  font-size: 18px;
}

.cat {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 99px;
  background: #efe2c4;
  font-size: 11px;
  font-weight: 800;
}

.beast-craft {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.beast-craft h3 {
  margin: 0;
  font-size: 14px;
}

.craft {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  min-height: 40px;
  padding: 8px 12px;
  border: none;
  border-radius: 12px;
  background: var(--copper);
  color: #fff;
  font-weight: 700;
}

.craft:disabled {
  opacity: 0.45;
}

.close {
  flex: 0 0 auto;
  min-width: 32px;
  min-height: 32px;
}

.pick {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 800;
}

.fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin: 0;
}

.fields > div {
  padding: 8px;
  border: 1px solid var(--line, #e6d3ae);
  border-radius: 10px;
  background: rgba(255, 252, 244, 0.8);
}

.fields > div.progress,
.fields > div:nth-child(n + 6) {
  grid-column: 1 / -1;
}

.fields > div.progress {
  min-width: 0;
}

.fields > div.progress dd {
  min-width: 0;
}

.duty-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.duty-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.duty-list span {
  min-width: 0;
}

.craft {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.craft-bar {
  position: relative;
  flex: 1 1 auto;
  min-width: 6em;
  height: 22px;
  border-radius: 99px;
  background: rgba(90, 58, 20, 0.18);
  overflow: hidden;
}

.craft-bar b {
  display: block;
  height: 100%;
  background: var(--bar-fill-green);
}

.craft.halt .craft-bar b {
  background: linear-gradient(90deg, #d4cdc0, #9a8f7c);
}

.craft-bar em {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-style: normal;
  font-size: 12px;
  font-weight: 800;
  color: #3a2410;
  pointer-events: none;
}

.craft-side {
  flex: 0 1 auto;
  max-width: 46%;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
}

.craft.halt .craft-side {
  color: #6b5c4a;
}

dt {
  color: var(--muted);
  font-size: 11px;
  font-weight: 800;
}

dd {
  margin: 2px 0 0;
  font-size: 13px;
  font-weight: 800;
  line-height: 1.4;
}

.low,
.jam {
  color: var(--danger);
}

.note {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
}

.actions {
  display: flex;
  gap: 8px;
}

.actions button {
  flex: 1 1 0;
}

.seal {
  display: flex;
  justify-content: flex-end;
  margin-top: auto;
}

.seal-ask {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  width: 100%;
  margin: 0;
  color: #b42318;
  font-size: 12px;
  font-weight: 800;
}

.seal-ask button {
  min-height: 28px;
}
</style>
