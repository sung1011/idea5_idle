<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { APP_VERSION } from '../generated/appVersion'
import { formatClock, gameDay, timeOfDayS } from '../sim/tables'
import { checkForAppUpdate, refreshToNewVersion, updateChecking, updateReady } from './appUpdateState'
import { formatBeijingDateTime } from './appVersion'
import { useGameStore } from './gameStore'
import { loadPrefs, savePrefs, type Prefs } from './prefs'
import { loadWorkshopBanter, saveWorkshopBanter } from './workshopBanter'

const PAGES = [
  { id: 'stats', label: '统计' },
  { id: 'general', label: '常规' },
  { id: 'version', label: '版本' },
  { id: 'gm', label: 'GM' },
] as const

type PageId = (typeof PAGES)[number]['id']

const emit = defineEmits<{ close: [] }>()
const game = useGameStore()
const page = ref<PageId>('stats')
const prefs = ref<Prefs>(loadPrefs())
const banterOn = ref(loadWorkshopBanter())

const day = computed(() => gameDay(game.save.elapsedS))
const clock = computed(() => formatClock(game.save.elapsedS))
const today = computed(() => formatClock(timeOfDayS(game.save.elapsedS)))
const recruited = computed(() => Math.max(0, Math.floor(game.save.nextWorkerId) - 1))
const releasedAt = computed(() => formatBeijingDateTime(APP_VERSION.releasedAt) || '—')
const notes = computed(() =>
  APP_VERSION.notes.map((note) => ({
    at: formatBeijingDateTime(note.at) || '—',
    title: note.title,
  })),
)

function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  prefs.value = savePrefs({ ...prefs.value, [key]: value })
}

function setBanter(on: boolean) {
  banterOn.value = saveWorkshopBanter(on)
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
          <i v-if="p.id === 'version' && updateReady" class="dot" />
        </button>
      </nav>

      <div v-if="page === 'stats'" class="body">
        <ul class="stats">
          <li>游戏日 {{ day }}</li>
          <li>今日 {{ today }}</li>
          <li>已运行 {{ clock }}</li>
          <li>探索 {{ game.save.exploreCount }} 次</li>
          <li>出发 {{ game.save.departCount }} 次</li>
          <li>抽苦工 {{ recruited }}</li>
          <li>酋长等级 {{ game.save.knightLevel }}</li>
          <li>当前苦工 {{ game.save.workers.length }}</li>
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
        <label class="toggle">
          <input type="checkbox" :checked="banterOn" @change="setBanter(($event.target as HTMLInputElement).checked)" />
          工坊闲话
        </label>
        <p class="hint">开关先记在本地，音频资源占位。工坊闲话默认开，关掉后在岗不再冒短句。</p>
      </div>

      <div v-else-if="page === 'version'" class="body">
        <p class="ver">当前版本 {{ APP_VERSION.version }}</p>
        <p class="hint">发布时间 {{ releasedAt }}（北京时间）</p>
        <button v-if="updateReady" type="button" class="refresh" @click="refreshToNewVersion()">有新版本，点击刷新</button>
        <button type="button" :disabled="updateChecking" @click="checkForAppUpdate(true)">
          {{ updateChecking ? '检查中' : '检查更新' }}
        </button>
        <p class="hint">打开游戏、每 30 分钟、回到前台时会自动检查。不会自动刷新，存档不受影响。</p>
        <ol v-if="notes.length" class="notes">
          <li v-for="note in notes" :key="`${note.at}-${note.title}`">
            <time>{{ note.at }}</time>
            <span>{{ note.title }}</span>
          </li>
        </ol>
        <p v-else class="hint">暂时没有更新记录。</p>
      </div>

      <div v-else-if="page === 'gm'" class="body">
        <p class="hint">仅调试用。初始化会重开存档。跳过引导不发未领金币。</p>
        <div class="row">
          <button type="button" @click="game.gmReset()">初始化</button>
          <button type="button" @click="game.gmSkipGuide()">跳过引导</button>
          <button type="button" @click="game.gmAddGold()">加金币 1w</button>
          <button type="button" @click="game.gmAddDiamonds()">加钻石 1w</button>
          <button type="button" @click="game.gmAddWorkers()">加苦工×5</button>
          <button type="button" @click="game.gmAddMaxQualityWorker()">满品质苦工</button>
          <button type="button" @click="game.gmMaxStations()">站点全满级</button>
          <button type="button" @click="game.gmFillBankBasics()">加基础物资</button>
          <button type="button" @click="game.gmAddTechPoints()">加灵感 1万</button>
          <button type="button" @click="game.gmResetTech()">重置科技</button>
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
  position: relative;
  flex: 1 1 72px;
  min-height: 40px;
}

.dot {
  position: absolute;
  top: 6px;
  right: 8px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--danger);
  box-shadow: 0 0 0 2px var(--plate);
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

.ver {
  margin: 0;
  font-family: var(--font-mono);
  color: var(--copper);
}

.refresh {
  background: linear-gradient(#ffe27a, #f0b83a);
}

.notes {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.notes li {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.notes time {
  color: var(--muted);
  font-size: 12px;
}
</style>
