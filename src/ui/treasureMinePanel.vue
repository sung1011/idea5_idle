<script setup lang="ts">
import { computed, ref } from 'vue'
import ActChargeBar from './actChargeBar.vue'
import CombatAttrIcon from './combatAttrIcon.vue'
import HpBar from './hpBar.vue'
import ModeHelpSheet from './modeHelpSheet.vue'
import { raidSlotLabel, raidSlotPress, treasureRaidHud, type SlotSheet } from './treasureRaidHud'
import { useFrameNow, visualStationProgress } from './visualProgress'
import { isFullCombatHp, restCombatCandidates } from '../sim/combat'
import {
  TREASURE_CREW_CAP,
  TREASURE_KIND_LABEL,
  TREASURE_LABEL,
  TREASURE_REFRESH_COST,
  mineDigSpeedLabel,
  mineRemainS,
  mineWeaknessSlots,
  playerMineDigReadout,
} from '../sim/treasureMine'
import type { RuneItemId, TreasureMine, Worker } from '../sim/types'
import CombatPickSheet from './combatPickSheet.vue'
import { pushFloatTip } from './floatTips'
import { useGameStore } from './gameStore'
import { workerShortName } from './workerGroups'

const game = useGameStore()
const frameNow = useFrameNow()
const mines = computed(() => game.save.treasureMines.mines)
const digViews = computed(() => {
  const now = frameNow.value
  const views = new Map<string, { pct: number; label: string }>()
  for (const mine of mines.value) {
    const pace = playerMineDigReadout(game.save, mine)
    if (!pace) continue
    const fill = visualStationProgress({
      progress: pace.fill,
      speed: pace.intervalS > 0 ? 1 / pace.intervalS : 0,
      stalled: false,
      assigned: mine.crewIds.length,
      lastTick: game.save.lastTick,
      now,
    })
    views.set(mine.id, { pct: Math.min(100, fill * 100), label: mineDigSpeedLabel(pace.fastestS) })
  }
  return views
})
const vaultLine = computed(() => {
  const vault = game.save.treasureMines.vault
  const bits = (Object.keys(TREASURE_LABEL) as (keyof typeof TREASURE_LABEL)[]).map(
    (id) => `${TREASURE_LABEL[id]} ${vault[id] ?? 0}`,
  )
  return bits.join(' · ')
})
const idle = computed(() => restCombatCandidates(game.save))
const pickKind = ref<'mine' | 'raid' | null>(null)
const pickMineId = ref<string | null>(null)
const picked = ref<string[]>([])
const runes = ref<Partial<Record<string, RuneItemId>>>({})
const pickOpen = computed(() => pickMineId.value != null)
const activeMine = computed(() => mines.value.find((row) => row.id === pickMineId.value) ?? null)
const pickMax = computed(() => {
  if (pickKind.value === 'raid') return TREASURE_CREW_CAP
  if (!activeMine.value) return TREASURE_CREW_CAP
  return Math.max(0, TREASURE_CREW_CAP - activeMine.value.crewIds.length)
})
const pickSlotOffset = computed(() => (pickKind.value === 'mine' ? (activeMine.value?.crewIds.length ?? 0) : 0))
const slotSheet = ref<SlotSheet | null>(null)

function clock(mine: TreasureMine): string {
  const safe = mineRemainS(mine, game.save.elapsedS)
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function names(ids: string[]): string {
  if (!ids.length) return '空'
  return ids
    .map((id) => {
      const worker = game.save.workers.find((row) => row.id === id)
      return worker ? workerShortName(worker) : id
    })
    .join('、')
}

function openPick(kind: 'mine' | 'raid', mineId: string) {
  pickKind.value = kind
  pickMineId.value = mineId
  picked.value = []
  runes.value = {}
}

function closePick() {
  pickKind.value = null
  pickMineId.value = null
  picked.value = []
  runes.value = {}
}

function togglePick(worker: Worker) {
  if (!isFullCombatHp(worker)) return
  game.clearWorkerNew(worker.id)
  const id = worker.id
  if (picked.value.includes(id)) {
    picked.value = picked.value.filter((row) => row !== id)
    const next = { ...runes.value }
    delete next[id]
    runes.value = next
    return
  }
  if (picked.value.length >= pickMax.value) {
    pushFloatTip(`最多选 ${pickMax.value} 人`, 'err')
    return
  }
  picked.value = [...picked.value, id]
}

function raidElapsed(): number {
  const dt = Math.max(0, Math.min(1, (frameNow.value - game.save.lastTick) / 1000))
  return game.save.elapsedS + dt
}

function raidHuds(mine: TreasureMine) {
  const hud = treasureRaidHud(mine, game.save.workers, raidElapsed(), game.save.playerName)
  return hud ? [hud] : []
}

function onRaidSlot(mine: TreasureMine, side: 'attack' | 'defend', index: number) {
  const press = raidSlotPress(mine, game.save.workers, side, index, game.save)
  if (press.kind === 'tip') {
    pushFloatTip(press.text)
    return
  }
  slotSheet.value = press.sheet
}

function confirmPick() {
  const mineId = pickMineId.value
  if (!mineId) return
  if (pickKind.value === 'raid') {
    const result = game.startTreasureRaid(mineId, [...picked.value], runes.value)
    if (result.ok) closePick()
    return
  }
  const result = game.claimTreasureMine(mineId, [...picked.value])
  if (result.ok) closePick()
}
</script>

<template>
  <section class="mines" aria-label="夺宝矿洞">
    <div class="vault-row">
      <p class="vault">宝库 {{ vaultLine }}</p>
      <button type="button" @click="game.refreshTreasureMines()">刷新 {{ TREASURE_REFRESH_COST }} 钻</button>
    </div>
    <div class="board">
      <article v-for="mine in mines" :key="mine.id" class="card">
        <header>
          <div class="titles">
            <span class="kind">{{ TREASURE_KIND_LABEL[mine.kind] }}</span>
            <span class="tags">
              <i>{{ mine.owner === 'player' ? '我方开采' : mine.owner === 'empty' ? '无人矿' : '快照驻守' }}</i>
            </span>
          </div>
        </header>
        <p class="weak">
          弱点
          <CombatAttrIcon
            v-for="(slot, index) in mineWeaknessSlots(mine)"
            :key="`${mine.id}-w-${index}`"
            :attr="slot"
          />
        </p>
        <p class="label">储量 {{ mine.reserve }}/{{ mine.reserveMax }}</p>
        <p class="label">消失倒计时 {{ clock(mine) }}</p>
        <p v-if="mine.owner === 'player'" class="label">开采 {{ names(mine.crewIds) }}（{{ mine.crewIds.length }}/{{ TREASURE_CREW_CAP }}，无符文）</p>
        <p v-if="digViews.get(mine.id)" class="dig">
          <i
            class="dig-bar"
            role="progressbar"
            aria-label="开采进度"
            :aria-valuenow="Math.round(digViews.get(mine.id)!.pct)"
            aria-valuemin="0"
            aria-valuemax="100"
          ><b :style="{ width: digViews.get(mine.id)!.pct.toFixed(2) + '%' }" /></i>
          <span>{{ digViews.get(mine.id)!.label }}</span>
        </p>
        <template v-for="hud in raidHuds(mine)" :key="`${mine.id}-raid`">
          <div class="bars">
            <p class="bar-line">{{ hud.defend.name }}</p>
            <HpBar variant="enemy" :hp="hud.defend.hp" :hp-max="hud.defend.hpMax" />
            <div class="raid-slots" aria-label="守方槽位">
              <button
                v-for="(mark, index) in hud.defend.slots"
                :key="`${mine.id}-def-slot-${index}`"
                type="button"
                class="raid-slot"
                :class="mark"
                :aria-label="`槽位 ${index + 1} ${raidSlotLabel(mark)}`"
                @click="onRaidSlot(mine, 'defend', index)"
              >{{ index + 1 }}</button>
            </div>
            <ActChargeBar enemy :fill="hud.defend.fill" />
            <template v-if="hud.attack">
              <p class="bar-line">{{ hud.attack.name }}</p>
              <HpBar :hp="hud.attack.hp" :hp-max="hud.attack.hpMax" />
              <div class="raid-slots" aria-label="攻方槽位">
                <button
                  v-for="(mark, index) in hud.attack.slots"
                  :key="`${mine.id}-atk-slot-${index}`"
                  type="button"
                  class="raid-slot"
                  :class="mark"
                  :aria-label="`槽位 ${index + 1} ${raidSlotLabel(mark)}`"
                  @click="onRaidSlot(mine, 'attack', index)"
                >{{ index + 1 }}</button>
              </div>
              <ActChargeBar :fill="hud.attack.fill" />
            </template>
          </div>
        </template>
        <div class="row">
          <button v-if="mine.owner === 'shadow' && !mine.raid" type="button" @click="openPick('raid', mine.id)">抢夺</button>
          <button v-if="mine.owner === 'empty' && !mine.raid" type="button" @click="openPick('mine', mine.id)">开采</button>
          <button v-if="mine.owner === 'player' && !mine.raid" type="button" @click="game.abandonTreasureMine(mine.id)">撤出</button>
        </div>
      </article>
    </div>

    <CombatPickSheet
      :open="pickOpen"
      :max="pickMax"
      :candidates="idle"
      :picked="picked"
      :runes="runes"
      mode="start"
      :show-runes="pickKind === 'raid'"
      :show-assist="false"
      :slot-offset="pickSlotOffset"
      @close="closePick"
      @confirm="confirmPick"
      @toggle="togglePick"
      @update:runes="runes = $event"
    />
    <ModeHelpSheet v-if="slotSheet" :title="slotSheet.title" :rows="slotSheet.rows" @close="slotSheet = null" />
  </section>
</template>

<style scoped>
.mines {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.vault {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
}

.vault-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.vault-row button {
  flex: 0 0 auto;
  margin: 0;
  padding: 4px 8px;
  font-size: 12px;
}

.board {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  overflow: visible;
}

.card header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.titles {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.kind {
  font-family: var(--font-display);
  letter-spacing: 0.12em;
}

.dig {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
}

.dig-bar {
  flex: 1 1 auto;
  height: 7px;
  border-radius: 99px;
  background: rgba(90, 58, 20, 0.18);
  overflow: hidden;
}

.dig-bar b {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--workshop-progress-from, #d7a441), var(--workshop-progress-to, #f0c14a));
}

.dig span {
  flex: 0 0 auto;
  font-size: 10px;
  font-weight: 800;
  color: var(--ink-soft, #6b4e2e);
}

.tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  margin-left: auto;
}

.tags i {
  font-style: normal;
  padding: 1px 8px;
  border: 2px solid var(--gold-deep);
  border-radius: 999px;
  background: var(--slot);
  color: var(--ink);
  font-size: 12px;
  line-height: 1.25;
}

.weak {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 13px;
}

.label {
  margin: 0;
  font-family: var(--font-mono);
  color: var(--copper);
  line-height: 1.5;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.bars {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bar-line {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 13px;
}

.raid-slots {
  display: flex;
  gap: 4px;
  align-items: center;
}

.raid-slot {
  display: grid;
  place-items: center;
  box-sizing: border-box;
  width: 18px;
  height: 18px;
  min-width: 18px;
  min-height: 18px;
  padding: 0;
  border-radius: 3px;
  box-shadow: none;
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0;
}

.raid-slot:active:not(:disabled) {
  transform: none;
}

.raid-slot.filled {
  border: 2px solid var(--gold-deep);
  background: var(--gold);
  color: var(--ink);
}

.raid-slot.empty {
  border: 1px dashed var(--muted);
  background: transparent;
  color: var(--muted);
}

.raid-slot.dead {
  border: 2px solid #8a3228;
  background: #8a3228;
  color: #fff8ee;
  text-decoration: line-through;
}
</style>
