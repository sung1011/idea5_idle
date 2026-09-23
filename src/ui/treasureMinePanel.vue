<script setup lang="ts">
import { computed, ref } from 'vue'
import { isFullCombatHp, restCombatCandidates } from '../sim/combat'
import {
  TREASURE_CREW_CAP,
  TREASURE_LABEL,
  mineRemainS,
} from '../sim/treasureMine'
import type { RuneItemId, TreasureMine, Worker } from '../sim/types'
import CombatPickSheet from './combatPickSheet.vue'
import { pushFloatTip } from './floatTips'
import { useGameStore } from './gameStore'
import { workerShortName } from './workerGroups'

const game = useGameStore()
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
const pickMax = computed(() => {
  if (pickKind.value === 'raid') return TREASURE_CREW_CAP
  const mine = mines.value.find((row) => row.id === pickMineId.value)
  if (!mine) return TREASURE_CREW_CAP
  return Math.max(0, TREASURE_CREW_CAP - mine.crewIds.length)
})

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
    <article v-for="mine in mines" :key="mine.id" class="card">
      <header>
        <b>{{ mine.owner === 'player' ? '我方开采' : '影子驻守' }}</b>
        <span>储量 {{ mine.reserve }}/{{ mine.reserveMax }}</span>
        <span>剩余 {{ clock(mine) }}</span>
      </header>
      <p v-if="mine.owner === 'shadow'">守军 {{ mine.shadows.map((row) => row.name).join('、') || '无' }}</p>
      <p v-else>开采 {{ names(mine.crewIds) }}（{{ mine.crewIds.length }}/{{ TREASURE_CREW_CAP }}，无符文）</p>
      <p v-if="mine.raid">
        抢夺中 {{ names(mine.raid.queue) }} 对 {{ mine.shadows[0]?.name ?? '守军' }}。本洞不能再开，也不能增援
      </p>
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

    <CombatPickSheet
      :open="pickOpen"
      :max="pickMax"
      :candidates="idle"
      :picked="picked"
      :runes="runes"
      mode="start"
      :show-runes="pickKind === 'raid'"
      :show-assist="false"
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
.vault,
.card p {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border: 2px solid var(--gold);
  border-radius: 10px;
  background: linear-gradient(180deg, #fffef8, #fff3d8);
}

.card header {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
