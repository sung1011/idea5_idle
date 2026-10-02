<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import {
  equippedRaceTitle,
  raceProgressView,
  type RaceProgressId,
} from '../sim/raceCodex'
import { raceCodexEntries } from '../sim/workerRaceUnlock'
import { pushFloatTip } from './floatTips'
import { useGameStore } from './gameStore'
import WorkerAvatar from './workerAvatar.vue'

const emit = defineEmits<{ close: [] }>()
const game = useGameStore()
const rows = computed(() => raceCodexEntries(game.save))
const progress = computed(() => raceProgressView(game.save))
const unlocked = computed(() => rows.value.filter((row) => row.unlocked).length)
const title = computed(() => equippedRaceTitle(game.save))

function claim(id: RaceProgressId) {
  const result = game.claimRaceProgress(id)
  if (result.ok && result.message) pushFloatTip(result.message, 'ok')
}

function onKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape') emit('close')
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div class="mask" @click.self="emit('close')">
    <section class="panel box" role="dialog" aria-modal="true" aria-labelledby="race-codex-title">
      <header>
        <h2 id="race-codex-title" class="title">苦工图鉴</h2>
        <button type="button" class="close" @click="emit('close')">关闭</button>
      </header>
      <p class="lead">
        已解锁 {{ unlocked }} / {{ rows.length }}
        <span v-if="title"> · {{ title }}</span>
      </p>
      <div class="progress">
        <button
          v-for="row in progress"
          :key="row.id"
          type="button"
          :disabled="!row.ready"
          :class="{ on: row.claimed }"
          @click="claim(row.id as RaceProgressId)"
        >
          <b>{{ row.need }}种</b>
          <span v-if="row.claimed">已领</span>
          <span v-else>钻 +{{ row.diamonds }}{{ row.title ? ` · ${row.title}` : '' }}</span>
        </button>
      </div>
      <ul class="grid">
        <li v-for="row in rows" :key="row.id" :class="{ locked: !row.unlocked }">
          <WorkerAvatar :race="row.id" size="md" :quality="row.unlocked ? 6 : 1" />
          <b>{{ row.label }}</b>
          <small v-if="row.unlocked">已解锁</small>
          <small v-else>{{ row.hint }}</small>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: calc(var(--z-sheet) + 5);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 72px 16px 24px;
  background: rgba(8, 28, 14, 0.58);
}

.box {
  width: min(440px, 100%);
  max-height: min(78vh, 680px);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 12px 10px;
  overflow: hidden;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

header .title {
  margin: 0;
  font-size: 20px;
}

.close {
  min-height: 32px;
  padding: 4px 10px;
}

.lead {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  font-weight: 700;
}

.progress {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.progress button {
  min-height: 32px;
  padding: 4px 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 700;
}

.progress button.on {
  opacity: 0.7;
}

.grid {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  overflow: auto;
}

li {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-height: 92px;
  padding: 8px 4px 6px;
  border: 2px solid var(--gold);
  border-radius: 12px;
  background: var(--slot);
  text-align: center;
}

li.locked {
  background: #d8c4a0;
  border-color: #8a7048;
  filter: grayscale(0.2);
}

li.locked :deep(.worker-avatar) {
  filter: grayscale(1);
  opacity: 0.55;
}

b {
  font-size: 12px;
  line-height: 1.3;
  color: var(--ink);
}

small {
  font-size: 11px;
  line-height: 1.3;
  color: var(--muted);
  font-weight: 700;
}

li.locked b,
li.locked small {
  color: #6a5840;
}
</style>
