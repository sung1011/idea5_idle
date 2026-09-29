<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { isWorkerInCombat, workerLiveStats } from '../sim/combat'
import { isStationUnlocked, stationLockedTip } from '../sim/stationUnlock'
import { CLASS_LABEL } from '../sim/tables'
import type { StationId, Worker } from '../sim/types'
import { workerXpProgress } from '../sim/workerLevel'
import { workerRaceLabel } from '../sim/workerRace'
import CombatAttrRow from './combatAttrRow.vue'
import { formatAtkSpeed } from './formatAtkSpeed'
import { pushFloatTip } from './floatTips'
import { useGameStore } from './gameStore'
import HpBar from './hpBar.vue'
import { openWorkshopStation } from './appNav'
import { canGoToAssignedWorkshop, workerAssignChoices, workerDutyLabel, workerShortName } from './workerGroups'
import { MANUAL_DUTY_REASON } from './workerDrag'
import { qualityOf } from './workerQuality'

const props = defineProps<{ workerId: string }>()
const emit = defineEmits<{ close: [] }>()

const game = useGameStore()
const picking = ref(false)

const worker = computed(() => game.save.workers.find((row) => row.id === props.workerId) ?? null)
const choices = computed(() => (worker.value ? workerAssignChoices(game.save, worker.value) : []))

watch(worker, (row) => {
  if (!row) emit('close')
})

function jobLabel(row: Worker) {
  return row.classId ? CLASS_LABEL[row.classId] : '未标'
}

function meta(row: Worker) {
  return `${qualityOf(row).label} · ${jobLabel(row)} · Lv${row.level} · ${workerDutyLabel(game.save, row)}`
}

function combatTail(row: Worker) {
  const stats = workerLiveStats(row, game.save)
  const xp = workerXpProgress(row)
  return `Lv${row.level} · ATK ${stats.atk} · 攻速 ${formatAtkSpeed(stats.spd)} · XP ${xp.xp}/${xp.need}`
}

function close() {
  picking.value = false
  emit('close')
}

function openPick() {
  picking.value = true
}

function onPickStation(stationId: StationId | null) {
  const row = worker.value
  if (!row) return
  if (stationId == null || row.assignment == null) {
    pushFloatTip(MANUAL_DUTY_REASON)
    return
  }
  if (!isStationUnlocked(game.save, stationId)) {
    pushFloatTip(stationLockedTip(stationId))
    return
  }
  const result = game.assign(row.id, stationId)
  if (result.ok) picking.value = false
}

function goWorkshop() {
  const row = worker.value
  if (!row?.assignment) return
  openWorkshopStation(row.assignment)
  picking.value = false
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="worker && !picking"
      class="modal"
      role="dialog"
      aria-modal="true"
      :aria-label="workerShortName(worker)"
      @click.self="close"
    >
      <div class="sheet">
        <header>
          <h2 class="title">
            {{ workerShortName(worker) }}
            <i v-if="workerRaceLabel(worker.race)" class="race-tag">{{ workerRaceLabel(worker.race) }}</i>
          </h2>
          <button type="button" class="close" @click="close">关闭</button>
        </header>
        <p class="meta">{{ meta(worker) }}</p>
        <HpBar class="hp-slot" :hp="worker.hp" :hp-max="worker.hpMax" />
        <p class="hint">{{ combatTail(worker) }}<template v-if="isWorkerInCombat(game.save, worker.id)"> · 战斗中</template></p>
        <p class="attrs">
          <CombatAttrRow :attrs="worker.combatAttrs" />
        </p>
        <div class="sheet-actions">
          <button type="button" class="go" @click="openPick">派驻</button>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div
      v-if="worker && picking"
      class="modal"
      role="dialog"
      aria-modal="true"
      :aria-label="`派驻 · ${workerShortName(worker)}`"
      @click.self="picking = false"
    >
      <div class="sheet">
        <header>
          <h2 class="title">派驻 · {{ workerShortName(worker) }}</h2>
        </header>
        <div class="pick-list">
          <div v-for="choice in choices" :key="choice.stationId ?? 'rest'" class="pick-cell">
            <button
              type="button"
              :class="{ on: choice.current, locked: choice.locked }"
              :disabled="choice.disabled && !choice.locked"
              :aria-pressed="choice.current"
              @click="onPickStation(choice.stationId)"
            >
              <span class="crew" aria-hidden="true">
                <i v-for="(dot, i) in choice.dots" :key="i" :class="{ empty: dot.empty }" :style="{ background: dot.color }" />
              </span>
              <span>{{ choice.label }}</span>
            </button>
          </div>
        </div>
        <div class="sheet-actions">
          <button type="button" class="go" :disabled="!canGoToAssignedWorkshop(worker)" @click="goWorkshop">前往</button>
          <button type="button" class="close" @click="picking = false">关闭</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal {
  position: fixed;
  inset: 0;
  z-index: calc(var(--z-sheet) + 3);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 16px 12px 0;
  background: rgba(8, 28, 14, 0.58);
}

.sheet {
  width: min(480px, 100%);
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: min(78vh, 640px);
  overflow: auto;
  padding: 16px 16px calc(16px + var(--dock-height));
  border: 3px solid var(--gold-deep);
  border-radius: 16px 16px 12px 12px;
  background: var(--wood-face);
  box-shadow: 0 6px 0 var(--shadow);
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 18px;
}

.sheet-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
}

.go,
.close {
  min-height: 32px;
  padding: 4px 10px;
}

.meta,
.hint {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}

.meta {
  font-weight: 700;
}

.hp-slot {
  width: 100%;
}

.attrs {
  display: flex;
  align-items: center;
  margin: 0;
}

.pick-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.pick-cell {
  min-width: 0;
}

.pick-list button {
  font: inherit;
  font-weight: 800;
  width: 100%;
  min-height: 48px;
  border: 3px solid var(--gold-deep);
  border-radius: 12px;
  background: var(--wood-face);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.pick-list button.on {
  background: var(--tab-on);
}

.pick-list button:disabled:not(.on) {
  opacity: 0.55;
}

.pick-list button.locked {
  filter: grayscale(0.8);
  opacity: 0.5;
}

.crew {
  display: flex;
  gap: 4px;
  min-height: 8px;
  align-items: center;
}

.crew i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1.5px solid #8a6410;
  display: block;
}

.crew i.empty {
  opacity: 0.55;
}

.race-tag {
  font-style: normal;
  font-size: 12px;
  font-weight: 800;
  color: #7a4a22;
}
</style>
