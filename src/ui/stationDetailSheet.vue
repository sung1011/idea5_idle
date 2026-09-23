<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { assignedWorkers, currentSpeed, stationBottleneckText, stationConsumeGroups, stationCycleS } from '../sim/query'
import { gatherStatusText, isGatherFrozen } from '../sim/gather'
import { categoryPickOptions, selectedCategoryDef } from '../sim/stationProgress'
import { isWorkerInCombat } from '../sim/combat'
import { isStationUnlocked, stationLockedTip } from '../sim/stationUnlock'
import { isEmptyHp, isWoundedHp, stationHpEfficiencyLabel, stationHpWorkMul } from '../sim/workshopHp'
import { findCategory, ITEM_DEF, STATION_DEF, xpToNextLevel } from '../sim/tables'
import type { CategoryId, StationId, Worker } from '../sim/types'
import ConsumeJumpItem from './consumeJumpItem.vue'
import StationMiniBar from './stationMiniBar.vue'
import { formatConsumeToken } from './encounterDeal'
import { useGameStore } from './gameStore'
import { itemSourceFlashCategories, isItemSourceStationFlash } from './itemSource'
import { pushFloatTip } from './floatTips'
import { stationHelpCopy } from './stationHelp'
import StationTips from './stationTips.vue'
import UiSelect from './uiSelect.vue'
import type { UiSelectOption } from './uiSelect'
import { qualityOf, workerQualityNameStyle } from './workerQuality'
import { workerShortName } from './workerGroups'

const props = defineProps<{
  stationId: StationId
}>()

const emit = defineEmits<{
  close: []
  openWorker: [worker: Worker]
}>()

const game = useGameStore()
const helpOpen = ref(false)
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
const help = computed(() => stationHelpCopy(props.stationId))
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
const dutyLine = computed(() => {
  const worker = duty.value
  if (!worker) return '空岗'
  const quality = qualityOf(worker).label
  return `${workerShortName(worker)} · ${quality} · Lv${worker.level}`
})

function consumeText(row: { itemId: (typeof consumeGroups.value)[number][number]['itemId']; need: number; have: number }) {
  return formatConsumeToken({ kind: 'item', itemId: row.itemId, qty: row.need }, row.have)
}

function onPick(value: string) {
  const opt = pickOptions.value.find((c) => c.id === value)
  if (!opt?.unlocked) return
  game.selectCategory(props.stationId, value as CategoryId)
}

function onWithdraw() {
  game.withdraw(props.stationId)
}

function onSwap() {
  if (!isStationUnlocked(game.save, props.stationId)) {
    pushFloatTip(stationLockedTip(props.stationId))
    return
  }
  const current = duty.value
  const idle = game.save.workers.find(
    (worker) => worker.assignment == null && worker.id !== current?.id && !isWorkerInCombat(game.save, worker.id),
  )
  if (!idle) {
    pushFloatTip(current ? '没有可换的休息工人' : '没有空闲工人')
    return
  }
  if (current) game.withdraw(props.stationId)
  game.assign(idle.id, props.stationId)
}

function onWorker() {
  const worker = duty.value
  if (!worker) {
    pushFloatTip('这一站还没有人')
    return
  }
  emit('openWorker', worker)
}

function onHelpKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape') {
    if (helpOpen.value) helpOpen.value = false
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
        <header>
          <h2 class="title">
            {{ def.label }}
            <span class="cat">{{ cat.label }}</span>
          </h2>
          <button type="button" class="help" :aria-pressed="helpOpen" :aria-label="`查看${def.label}说明`" @click="helpOpen = !helpOpen">？</button>
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
            <dd :style="duty ? workerQualityNameStyle(duty) : undefined">{{ dutyLine }}</dd>
          </div>
          <div>
            <dt>效率 / 体力</dt>
            <dd :class="{ low: hpMul < 1 }">{{ hpLabel }}</dd>
          </div>
          <div class="progress">
            <dt>制造进度</dt>
            <dd><StationMiniBar :station-id="stationId" layout="sheet" /></dd>
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
        <div class="actions">
          <button type="button" :disabled="!duty" @click="onWithdraw">撤出</button>
          <button type="button" @click="onSwap">换人</button>
          <button type="button" @click="onWorker">工人详情</button>
        </div>
        <section v-if="helpOpen" class="help-box" :aria-label="`${def.label}说明`">
          <h3>{{ help.title }}</h3>
          <dl>
            <div v-for="row in help.rows" :key="row.label">
              <dt>{{ row.label }}</dt>
              <dd>{{ row.text }}</dd>
            </div>
          </dl>
        </section>
      </section>
    </div>
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
  background: rgba(40, 24, 8, 0.45);
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
  background: linear-gradient(180deg, #fffef8, #fff3d8);
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

.help,
.close {
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

.help-box {
  padding: 8px;
  border-radius: 10px;
  background: rgba(255, 248, 230, 0.9);
}

.help-box h3 {
  margin: 0 0 6px;
  font-size: 14px;
}

.help-box dl {
  margin: 0;
}

.help-box dt {
  margin-top: 6px;
}
</style>
