<script setup lang="ts">
import { computed, ref } from 'vue'
import { restCombatCandidates } from '../sim/combat'
import { isRuneSlotUnlocked, listRunePickOptions, runeLabel } from '../sim/runes'
import type { RuneItemId } from '../sim/types'
import {
  TREASURE_CREW_CAP,
  TREASURE_LABEL,
  mineRemainS,
} from '../sim/treasureMine'
import type { TreasureMine } from '../sim/types'
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
const runesOpen = computed(() => isRuneSlotUnlocked(game.save))
const runeOptions = computed(() => listRunePickOptions(game.save))
const raidMineId = ref<string | null>(null)
const picked = ref<string[]>([])
const runes = ref<Partial<Record<string, RuneItemId>>>({})

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

function openRaid(mineId: string) {
  raidMineId.value = mineId
  picked.value = []
  runes.value = {}
}

function toggle(id: string) {
  if (picked.value.includes(id)) {
    picked.value = picked.value.filter((row) => row !== id)
    delete runes.value[id]
    return
  }
  if (picked.value.length >= TREASURE_CREW_CAP) return
  picked.value = [...picked.value, id]
}

function confirmRaid() {
  const mineId = raidMineId.value
  if (!mineId) return
  const result = game.startTreasureRaid(mineId, [...picked.value], runes.value)
  if (result.ok) raidMineId.value = null
}

function onRune(id: string, ev: Event) {
  const value = (ev.target as HTMLSelectElement).value
  if (!value) {
    delete runes.value[id]
    return
  }
  runes.value = { ...runes.value, [id]: value as RuneItemId }
}

function addMiner(mineId: string) {
  const worker = idle.value[0]
  if (!worker) return
  game.addTreasureMiner(mineId, worker.id)
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
      <p v-if="mine.raid">抢夺中 {{ names(mine.raid.queue) }} 对 {{ mine.shadows[0]?.name ?? '守军' }}</p>
      <div class="row">
        <button v-if="mine.owner === 'shadow' && !mine.raid" type="button" @click="openRaid(mine.id)">抢夺</button>
        <button
          v-if="mine.owner === 'player' && !mine.raid && mine.crewIds.length < TREASURE_CREW_CAP"
          type="button"
          @click="addMiner(mine.id)"
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

    <div v-if="raidMineId" class="modal" role="dialog" aria-label="抢夺编队" @click.self="raidMineId = null">
      <div class="sheet">
        <h3>抢夺编队</h3>
        <p>最多 3 人。可装符文，确认后消耗。</p>
        <button
          v-for="worker in idle"
          :key="worker.id"
          type="button"
          :class="{ on: picked.includes(worker.id) }"
          @click="toggle(worker.id)"
        >
          {{ workerShortName(worker) }}
        </button>
        <p v-if="!idle.length">没有休息中的工人</p>
        <label v-for="id in picked" :key="`rune-${id}`" class="rune">
          <span>{{ names([id]) }}</span>
          <select
            :disabled="!runesOpen"
            :value="runes[id] ?? ''"
            @change="onRune(id, $event)"
          >
            <option value="">{{ runesOpen ? '不带符文' : '铭刻未开' }}</option>
            <option v-for="row in runeOptions" :key="row.id" :value="row.id">{{ runeLabel(row.id) }} ×{{ row.qty }}</option>
          </select>
        </label>
        <div class="row">
          <button type="button" @click="confirmRaid">开战</button>
          <button type="button" @click="raidMineId = null">取消</button>
        </div>
      </div>
    </div>
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

.modal {
  position: fixed;
  inset: 0;
  z-index: var(--z-sheet);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 12px;
  background: rgba(40, 24, 8, 0.45);
}

.sheet {
  width: min(420px, 100%);
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 3px solid var(--gold-deep);
  border-radius: 12px;
  background: #fff8ee;
}

.sheet h3 {
  margin: 0;
}

button.on {
  background: linear-gradient(#ffe27a, #e2a31a);
}

.rune {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 800;
}
</style>
