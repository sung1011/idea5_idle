<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import {
  MONSTER_EXCHANGES,
  MONSTER_SHARD_LABEL,
  equippedCampDeco,
  equippedMonsterTitle,
  monsterCodexRows,
  monsterProgressView,
  monsterShardQty,
  type MonsterCosmeticId,
  type MonsterProgressId,
} from '../sim/monsterCodex'
import { pushFloatTip } from './floatTips'
import { useGameStore } from './gameStore'

const emit = defineEmits<{ close: [] }>()
const game = useGameStore()
const rows = computed(() => monsterCodexRows(game.save))
const progress = computed(() => monsterProgressView(game.save))
const lit = computed(() => rows.value.filter((row) => row.lit).length)
const title = computed(() => equippedMonsterTitle(game.save))
const campDeco = computed(() => equippedCampDeco(game.save))
const shards = computed(() =>
  (['fang', 'cloth', 'look'] as const).map((id) => ({
    id,
    label: MONSTER_SHARD_LABEL[id],
    qty: monsterShardQty(game.save, id),
  })),
)

function onKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape') emit('close')
}

function claim(id: MonsterProgressId) {
  const result = game.claimMonsterProgress(id)
  if (result.ok && result.message) pushFloatTip(result.message, 'ok')
}

function exchange(id: MonsterCosmeticId) {
  const result = game.exchangeMonsterShard(id)
  if (result.ok && result.message) pushFloatTip(result.message, 'ok')
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="mask" @click.self="emit('close')">
    <section class="panel box" role="dialog" aria-modal="true" aria-labelledby="monster-codex-title">
      <header>
        <h2 id="monster-codex-title" class="title">怪物图鉴</h2>
        <button type="button" class="close" @click="emit('close')">关闭</button>
      </header>
      <p class="lead">
        已点亮 {{ lit }} / {{ rows.length }}
        <span v-if="title"> · {{ title }}</span>
        <span v-if="campDeco"> · {{ campDeco }}</span>
      </p>
      <p class="hint">订单金钻仍只看章节×品质。交单另掷专属碎片，不乘金钻。</p>
      <div class="shards" aria-label="碎片">
        <span v-for="shard in shards" :key="shard.id">{{ shard.label }} ×{{ shard.qty }}</span>
      </div>
      <div class="progress">
        <button
          v-for="row in progress"
          :key="row.id"
          type="button"
          :disabled="!row.ready"
          :class="{ on: row.claimed }"
          @click="claim(row.id as MonsterProgressId)"
        >
          <b>{{ row.need }}种</b>
          <span v-if="row.claimed">已领</span>
          <span v-else>钻 +{{ row.diamonds }}{{ row.title ? ` · ${row.title}` : '' }}</span>
        </button>
      </div>
      <div class="exchanges" aria-label="碎片兑换">
        <button
          v-for="row in MONSTER_EXCHANGES"
          :key="row.id"
          type="button"
          @click="exchange(row.id)"
        >
          {{ MONSTER_SHARD_LABEL[row.shard] }}×{{ row.cost }} → {{ row.label }}
        </button>
      </div>
      <ol class="list">
        <li v-for="row in rows" :key="row.id" :class="{ lit: row.lit, submitted: row.submitted }">
          <b>{{ row.lit ? row.label : '???' }}</b>
          <span v-if="row.lit">{{ row.dropHint }}{{ row.submitted ? ' · 已交单' : ' · 已见' }}</span>
          <span v-else>{{ row.how }}</span>
        </li>
      </ol>
    </section>
  </div>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: var(--z-sheet);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 72px 16px 24px;
  background: rgba(8, 28, 14, 0.58);
}

.box {
  width: min(440px, 100%);
  max-height: calc(100vh - 96px);
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 12px 10px;
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

.lead,
.hint {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
}

.shards,
.progress,
.exchanges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.shards span,
.progress button,
.exchanges button {
  min-height: 32px;
  padding: 4px 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 700;
}

.progress button.on {
  opacity: 0.7;
}

.list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 6px;
}

.list li {
  display: grid;
  gap: 2px;
  padding: 8px 10px;
  border: 2px solid var(--gold);
  border-radius: 12px;
  background: var(--slot);
  color: var(--muted);
  font-size: 12px;
  opacity: 0.55;
  filter: grayscale(0.7);
}

.list li.lit {
  opacity: 1;
  filter: none;
  color: var(--ink);
  background: var(--wood-lite);
}

.list b {
  font-size: 14px;
}
</style>
