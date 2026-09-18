<script setup lang="ts">
import { computed, ref } from 'vue'
import { guideQuestView } from '../sim/guideQuest'
import { useGameStore } from './gameStore'

const game = useGameStore()
const collapsed = ref(false)
const view = computed(() => guideQuestView(game.save))

function toggleFold() {
  collapsed.value = !collapsed.value
}

function claim() {
  game.claimGuideQuest()
}
</script>

<template>
  <aside
    v-if="view"
    class="ck"
    :class="{ collapsed }"
    aria-label="新手主线"
  >
    <div class="row" @click="toggleFold">
      <div class="ico">{{ view.step }}</div>
      <div class="txt">
        <p class="name">{{ view.title }}</p>
        <p class="goal">{{ view.goal }}</p>
        <p class="prog" :class="{ ok: view.claimable }">{{ view.progressLabel }}</p>
      </div>
    </div>
    <div class="bar" :class="{ ok: view.claimable }">
      <i :style="{ width: `${view.fillPct}%` }" />
    </div>
    <div v-if="view.claimable" class="act">
      <button type="button" @click.stop="claim">领取 金币+20</button>
    </div>
  </aside>
</template>

<style scoped>
.ck {
  position: absolute;
  left: 8px;
  bottom: calc(var(--dock-height) + 64px);
  z-index: 6;
  width: min(210px, calc(100% - 90px));
  overflow: hidden;
  color: #fff8ee;
  background: rgba(40, 28, 14, 0.78);
  border: 1px solid rgba(232, 195, 90, 0.55);
  border-radius: 8px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(4px);
}

.row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px 6px;
  cursor: pointer;
}

.ico {
  display: grid;
  flex: none;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: linear-gradient(180deg, #f0c14a, #d4a017);
  color: #4a2c0a;
  font-size: 11px;
  font-weight: 900;
}

.txt {
  flex: 1;
  min-width: 0;
}

.name {
  margin: 0;
  opacity: 0.75;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.goal {
  margin: 2px 0 0;
  font-size: 13px;
  font-weight: 800;
  line-height: 1.25;
}

.prog {
  margin: 3px 0 0;
  color: #ffe27a;
  font-size: 11px;
  font-weight: 700;
}

.prog.ok {
  color: #b8f070;
}

.bar {
  height: 3px;
  margin: 0 10px 8px;
  overflow: hidden;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.15);
}

.bar i {
  display: block;
  height: 100%;
  background: #f0c14a;
}

.bar.ok i {
  background: #8fd94a;
}

.act {
  padding: 0 10px 8px;
}

.act button {
  width: 100%;
  min-height: 30px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: linear-gradient(180deg, #b8f070, #3e9a2a);
  color: #14380c;
  font-size: 12px;
  font-weight: 800;
  box-shadow: none;
}

.collapsed {
  width: auto;
}

.collapsed .txt,
.collapsed .bar,
.collapsed .act {
  display: none;
}

.collapsed .row {
  padding: 6px;
  gap: 0;
}
</style>
