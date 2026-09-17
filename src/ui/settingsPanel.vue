<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { formatClock, gameDay, timeOfDayS } from '../sim/tables'
import { useGameStore } from './gameStore'
import { loadPrefs, savePrefs, type Prefs } from './prefs'

const PAGES = [
  { id: 'stats', label: '统计' },
  { id: 'general', label: '常规' },
  { id: 'gm', label: 'GM' },
] as const

type PageId = (typeof PAGES)[number]['id']

const emit = defineEmits<{ close: [] }>()
const game = useGameStore()
const page = ref<PageId>('stats')
const prefs = ref<Prefs>(loadPrefs())

const day = computed(() => gameDay(game.save.elapsedS))
const clock = computed(() => formatClock(game.save.elapsedS))
const today = computed(() => formatClock(timeOfDayS(game.save.elapsedS)))
const recruited = computed(() => Math.max(0, Math.floor(game.save.nextWorkerId) - 1))

function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  prefs.value = savePrefs({ ...prefs.value, [key]: value })
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
    <section class="panel box" role="dialog" aria-modal="true" aria-labelledby="set-title">
      <header>
        <h2 id="set-title" class="title">设置</h2>
        <button type="button" class="close" @click="emit('close')">关闭</button>
      </header>

      <nav class="sub" role="tablist" aria-label="设置分页">
        <button
          v-for="p in PAGES"
          :key="p.id"
          type="button"
          role="tab"
          :aria-selected="page === p.id"
          :class="{ on: page === p.id }"
          @click="page = p.id"
        >
          {{ p.label }}
        </button>
      </nav>

      <div v-if="page === 'stats'" class="body">
        <ul class="stats">
          <li>游戏日 {{ day }}</li>
          <li>今日 {{ today }}</li>
          <li>已运行 {{ clock }}</li>
          <li>探索 {{ game.save.exploreCount }} 次</li>
          <li>出发 {{ game.save.departCount }} 次</li>
          <li>抽工人 {{ recruited }}</li>
          <li>骑士等级 {{ game.save.knightLevel }}</li>
          <li>当前工人 {{ game.save.workers.length }}</li>
          <li>离线 {{ game.save.offlineCount }} 次</li>
        </ul>
      </div>

      <div v-else-if="page === 'general'" class="body">
        <label class="toggle">
          <input type="checkbox" :checked="prefs.music" @change="setPref('music', ($event.target as HTMLInputElement).checked)" />
          音乐
        </label>
        <label class="toggle">
          <input type="checkbox" :checked="prefs.sfx" @change="setPref('sfx', ($event.target as HTMLInputElement).checked)" />
          音效
        </label>
        <p class="hint">开关先记在本地，音频资源占位。</p>
      </div>

      <div v-else class="body">
        <p class="hint">仅调试用。初始化会重开存档。</p>
        <div class="row">
          <button type="button" @click="game.gmReset()">初始化</button>
          <button type="button" @click="game.gmAddGold()">加金币 1w</button>
          <button type="button" @click="game.gmAddDiamonds()">加钻石 1w</button>
          <button type="button" @click="game.gmAddWorkers()">加工人×5</button>
          <button type="button" @click="game.gmAddMaxQualityWorker()">满品质工人</button>
          <button type="button" @click="game.gmMaxStations()">站点全满级</button>
          <button type="button" @click="game.gmFillBankBasics()">加基础物资</button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 72px 16px 24px;
  background: rgba(92, 58, 26, 0.28);
}

.box {
  width: min(440px, 100%);
  max-height: min(76dvh, 620px);
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 12px 10px;
}

.title {
  margin: 0;
  font-size: 20px;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

header .title,
.hint {
  margin: 0;
  line-height: 1.5;
}

.hint {
  color: var(--muted);
  font-size: 13px;
}

.close {
  min-height: 32px;
  padding: 4px 10px;
}

.sub {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.sub button {
  flex: 1 1 72px;
  min-height: 40px;
}

.sub button.on {
  color: var(--ink);
  background: linear-gradient(#ffe27a, #f0b83a);
  box-shadow: 0 3px 0 var(--shadow);
  opacity: 1;
  filter: none;
}

.body,
.stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stats {
  margin: 0;
  padding: 0;
  list-style: none;
  font-family: var(--font-mono);
  color: var(--copper);
}

.toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
