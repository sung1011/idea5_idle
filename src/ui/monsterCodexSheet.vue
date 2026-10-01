<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
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
import HelpMark from './helpMark.vue'
import { MONSTER_CODEX_HELP_ROWS, MONSTER_CODEX_HELP_TITLE } from './monsterCodexHelp'
import ModeHelpSheet from './modeHelpSheet.vue'

type CodexTab = 'list' | 'exchange'

const emit = defineEmits<{ close: [] }>()
const game = useGameStore()
const tab = ref<CodexTab>('list')
const helpOpen = ref(false)
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
  if (ev.key !== 'Escape') return
  if (helpOpen.value) {
    helpOpen.value = false
    return
  }
  emit('close')
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
        <HelpMark @click.stop="helpOpen = true" />
        <button type="button" class="close" @click="emit('close')">关闭</button>
      </header>
      <p class="lead">
        已点亮 {{ lit }} / {{ rows.length }}
        <span v-if="title"> · {{ title }}</span>
        <span v-if="campDeco"> · {{ campDeco }}</span>
      </p>
      <nav class="sub" role="tablist" aria-label="图鉴分页">
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'list'"
          :class="{ on: tab === 'list' }"
          @click="tab = 'list'"
        >图鉴</button>
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'exchange'"
          :class="{ on: tab === 'exchange' }"
          @click="tab = 'exchange'"
        >兑换</button>
      </nav>
      <ol v-if="tab === 'list'" class="list">
        <li v-for="row in rows" :key="row.id" :class="{ lit: row.lit, locked: !row.lit, submitted: row.submitted }">
          <b>{{ row.label }}</b>
          <small v-if="row.lit">{{ row.dropHint }}{{ row.submitted ? ' · 已交单' : ' · 已见' }}</small>
          <small v-else>{{ row.how }}</small>
        </li>
      </ol>
      <template v-else>
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
      </template>
    </section>
  </div>
  <Teleport to="body">
    <ModeHelpSheet
      v-if="helpOpen"
      :title="MONSTER_CODEX_HELP_TITLE"
      :rows="MONSTER_CODEX_HELP_ROWS"
      @close="helpOpen = false"
    />
  </Teleport>
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

.lead {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
}

.sub {
  display: flex;
  align-items: stretch;
  gap: 2px;
  padding: 3px;
  border: 2px solid var(--gold);
  border-radius: var(--radius-pill);
  background: var(--wood-face);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.sub button {
  flex: 1 1 0;
  min-height: 32px;
  padding: 4px 10px;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  box-shadow: none;
  color: var(--muted);
  font-family: var(--font-display);
  font-size: 14px;
  letter-spacing: 0.08em;
  opacity: 1;
  filter: none;
}

.sub button:hover:not(:disabled) {
  filter: none;
  background: rgba(255, 243, 196, 0.45);
}

.sub button:active:not(:disabled) {
  transform: none;
  box-shadow: none;
}

.sub button:focus-visible {
  outline: 2px solid var(--gold-deep);
  outline-offset: 1px;
}

.sub button.on,
.sub button.on:hover:not(:disabled),
.sub button.on:active:not(:disabled) {
  color: var(--ink);
  background: var(--tab-on);
  box-shadow: 0 2px 6px rgba(212, 160, 23, 0.32);
  opacity: 1;
  filter: none;
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
  background: var(--wood-lite);
  color: var(--ink);
  font-size: 12px;
}

.list li.locked {
  background: #d8c4a0;
  border-color: #8a7048;
  filter: grayscale(0.2);
}

.list b {
  font-size: 14px;
}

.list small {
  font-size: 11px;
  line-height: 1.3;
  color: var(--muted);
  font-weight: 700;
}

.list li.locked b,
.list li.locked small {
  color: #6a5840;
}
</style>
