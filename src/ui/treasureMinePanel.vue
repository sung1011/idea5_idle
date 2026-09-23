<script setup lang="ts">
import { computed, ref } from 'vue'
import ActChargeBar from './actChargeBar.vue'
import HpBar from './hpBar.vue'
import { treasureRaidHud } from './treasureRaidHud'
import { useFrameNow } from './visualProgress'
import { isFullCombatHp, restCombatCandidates } from '../sim/combat'
import {
  TREASURE_CREW_CAP,
  TREASURE_LABEL,
  mineRemainS,
} from '../sim/treasureMine'
import type { RuneItemId, TreasureMine, Worker } from '../sim/types'
import { COMBAT_ATTR_LABEL } from '../sim/combatAttrs'
import CombatPickSheet from './combatPickSheet.vue'
import { pushFloatTip } from './floatTips'
import { useGameStore } from './gameStore'
import { workerShortName } from './workerGroups'

const game = useGameStore()
const frameNow = useFrameNow()
const mines = computed(() => game.save.treasureMines.mines)
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
  const hud = treasureRaidHud(mine, game.save.workers, raidElapsed())
  return hud ? [hud] : []
}

function confirmPick() {
  const mineId = pickMineId.value
  if (!mineId) return
  if (pickKind.value === 'raid') {
    const result = game.startTreasureRaid(mineId, [...picked.value], runes.value)
    if (result.ok) closePick()
    return
  }
  for (const id of picked.value) {
    const result = game.addTreasureMiner(mineId, id)
    if (!result.ok) return
  }
  closePick()
}
</script>

<template>
  <section class="mines" aria-label="夺宝矿洞">
    <p class="lead">影子对手是快照守军，不是实时联机。开采不装符文；抢夺可装符文。</p>
    <p class="vault">宝库 {{ vaultLine }}</p>
    <div class="board">
      <article v-for="mine in mines" :key="mine.id" class="card">
        <header>
          <div class="titles">
            <span class="kind">矿洞</span>
            <span class="tags">
              <i>{{ mine.owner === 'player' ? '我方开采' : '影子驻守' }}</i>
              <i v-for="id in mine.weaknesses" :key="`${mine.id}-${id}`">{{ COMBAT_ATTR_LABEL[id] }}</i>
            </span>
          </div>
        </header>
        <p class="label">储量 {{ mine.reserve }}/{{ mine.reserveMax }}</p>
        <p class="label">剩余 {{ clock(mine) }}</p>
        <p v-if="mine.owner === 'shadow'" class="label">守军 {{ mine.shadows.map((row) => row.name).join('、') || '无' }}</p>
        <p v-else class="label">开采 {{ names(mine.crewIds) }}（{{ mine.crewIds.length }}/{{ TREASURE_CREW_CAP }}，无符文）</p>
        <template v-for="hud in raidHuds(mine)" :key="`${mine.id}-raid`">
          <div class="bars">
            <p class="bar-line">{{ hud.attack.name }}</p>
            <HpBar :hp="hud.attack.hp" :hp-max="hud.attack.hpMax" />
            <ActChargeBar :fill="hud.attack.fill" />
            <p class="bar-line">{{ hud.defend.name }}</p>
            <HpBar variant="enemy" :hp="hud.defend.hp" :hp-max="hud.defend.hpMax" />
            <ActChargeBar enemy :fill="hud.defend.fill" />
          </div>
          <p v-if="hud.waitingAttack.length" class="label">等待 {{ hud.waitingAttack.join('、') }}</p>
          <p v-if="hud.waitingDefend.length" class="label">守军等待 {{ hud.waitingDefend.join('、') }}</p>
          <p class="label">本洞不能再开，也不能增援</p>
        </template>
        <div class="row">
          <button v-if="mine.owner === 'shadow' && !mine.raid" type="button" @click="openPick('raid', mine.id)">抢夺</button>
          <button
            v-if="mine.owner === 'player' && !mine.raid && mine.crewIds.length < TREASURE_CREW_CAP"
            type="button"
            @click="openPick('mine', mine.id)"
          >
            补采
          </button>
          <button
            v-for="id in mine.crewIds"
            :key="id"
            type="button"
            @click="game.withdrawTreasureMiner(mine.id, id)"
          >
            撤出
          </button>
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
  </section>
</template>

<style scoped>
.mines {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.lead,
.vault {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
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
</style>
