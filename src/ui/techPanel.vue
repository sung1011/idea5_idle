<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  TECH_TAB_IDS,
  TECH_TAB_LABELS,
  TECH_TREE,
  encounterSlotCount,
  hasTech,
  isRowOpen,
  isTechComplete,
  techReadyLabel,
  techTab,
  techTier,
  type TechNodeDef,
  type TechTabId,
} from '../sim/tech'
import type { TechId } from '../sim/types'
import { useGameStore } from './gameStore'
import { loadTechTab, saveTechTab } from './techTabs'

const game = useGameStore()
const tab = ref<TechTabId>(loadTechTab())
const selected = ref<TechNodeDef | null>(null)
const points = computed(() => game.save.techPoints)
const knightLevel = computed(() => game.save.knightLevel)
const slots = computed(() => encounterSlotCount(game.save))
const done = computed(() => isTechComplete(game.save))
const unlockedCount = computed(() => techTier(game.save))
const progressPct = computed(() => Math.round((unlockedCount.value / TECH_TREE.length) * 100))
const currentTab = computed(() => techTab(tab.value))
const displayRows = computed(() => [...currentTab.value.rows].reverse())
const selectedLive = computed(() => {
  const node = selected.value
  if (!node) return null
  return {
    node,
    lit: hasTech(game.save, node.id),
    readyLine: techReadyLabel(node),
  }
})

function selectTab(id: TechTabId) {
  tab.value = saveTechTab(id)
  selected.value = null
}

function lit(id: TechId) {
  return hasTech(game.save, id)
}

function nodeClass(node: TechNodeDef) {
  if (lit(node.id)) return 'on'
  if (isRowOpen(game.save, node.tab, node.row)) return 'ready'
  return 'off'
}

function onNode(node: TechNodeDef) {
  if (lit(node.id) || isRowOpen(game.save, node.tab, node.row)) {
    selected.value = node
    return
  }
  game.researchTech(node.id)
}

function activate() {
  const node = selected.value
  if (!node || lit(node.id)) return
  game.researchTech(node.id)
}

function closeSheet() {
  selected.value = null
}
</script>

<template>
  <section class="panel tree">
    <p class="kicker">骑士工坊 · 科技</p>
    <p class="title">科技树</p>
    <p class="hint">
      三页签各自成串。任意工坊完成一个周期 +1 灵感，骑士升级也 +1。买任意 1 个开上一层，同行可稍后补买。工坊规章 / 工匠密录减轻同站冲突；事务订单格科技把主线 1→6。
    </p>
    <div class="chips">
      <span class="chip">骑士 {{ knightLevel }} 级</span>
      <span class="chip">灵感 {{ points }}</span>
      <span class="chip">主线 {{ slots }} 格</span>
      <span class="chip">进度 {{ unlockedCount }}/{{ TECH_TREE.length }}</span>
    </div>
    <div class="bar xp" aria-label="科技进度">
      <i :style="{ width: `${progressPct}%` }" />
    </div>
    <nav class="sub" role="tablist" aria-label="科技分页">
      <button
        v-for="id in TECH_TAB_IDS"
        :key="id"
        type="button"
        role="tab"
        :aria-selected="tab === id"
        :class="{ on: tab === id }"
        @click="selectTab(id)"
      >
        {{ TECH_TAB_LABELS[id] }}
      </button>
    </nav>
    <p v-if="done" class="hint">科技树已满。</p>
    <ol class="rows">
      <li v-for="row in displayRows" :key="`${row.tab}-${row.row}`" class="row">
        <div class="opts" :class="`n${row.options.length}`">
          <button
            v-for="node in row.options"
            :key="node.id"
            type="button"
            class="node"
            :class="nodeClass(node)"
            :title="node.name"
            @click="onNode(node)"
          >
            <span class="ico" aria-hidden="true">{{ node.icon }}</span>
            <strong>{{ node.name }}</strong>
            <i v-if="lit(node.id)" class="mark" aria-hidden="true">✓</i>
          </button>
        </div>
      </li>
    </ol>

    <Teleport to="body">
      <div v-if="selectedLive" class="modal" role="dialog" aria-modal="true" :aria-label="selectedLive.node.name" @click.self="closeSheet">
        <div class="sheet">
          <header>
            <p class="sheet-ico" aria-hidden="true">{{ selectedLive.node.icon }}</p>
            <h2 class="title">{{ selectedLive.node.name }}</h2>
            <button type="button" class="close" @click="closeSheet">关闭</button>
          </header>
          <p class="ready">{{ selectedLive.readyLine }}</p>
          <p class="desc">{{ selectedLive.node.desc }}</p>
          <div class="actions">
            <button
              v-if="selectedLive.lit"
              type="button"
              disabled
            >
              已激活
            </button>
            <button
              v-else
              type="button"
              @click="activate"
            >
              激活 · {{ selectedLive.node.cost }} 灵感
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.tree,
.chips,
.rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tree {
  padding: 12px 12px 10px;
}

p,
.hint {
  margin: 0;
  line-height: 1.5;
}

.kicker,
.hint,
.desc,
.ready {
  color: var(--muted);
  font-size: 13px;
}

.kicker {
  letter-spacing: 0.12em;
  font-size: 12px;
}

.title {
  font-family: var(--font-display);
  font-size: 22px;
  letter-spacing: 0.12em;
}

.chips {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
}

.sub {
  display: flex;
  gap: 8px;
}

.sub button {
  flex: 1 1 0;
  min-height: 40px;
}

.sub button.on {
  color: var(--ink);
  background: linear-gradient(#ffe27a, #f0b83a);
  box-shadow: 0 3px 0 var(--shadow);
  opacity: 1;
  filter: none;
}

.rows {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  gap: 12px;
}

.opts {
  display: grid;
  gap: 8px;
}

.opts.n2 {
  grid-template-columns: 1fr 1fr;
}

.opts.n3 {
  grid-template-columns: 1fr 1fr 1fr;
}

.node {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 72px;
  padding: 8px 6px;
}

.node strong {
  font-family: var(--font-display);
  font-size: 13px;
  letter-spacing: 0.04em;
  font-weight: 400;
}

.node .ico {
  font-size: 22px;
  line-height: 1;
}

.node .mark {
  position: absolute;
  top: 4px;
  right: 6px;
  font-size: 14px;
  font-style: normal;
  font-weight: 700;
}

.node.on {
  color: #fffdf8;
  background: linear-gradient(#8fd94a, var(--moss-deep));
  border-color: var(--moss-deep);
}

.node.ready {
  background: linear-gradient(#fff3a8, #f0c14a);
}

.node.off {
  color: var(--muted);
  background: #efe4c8;
  box-shadow: none;
  filter: grayscale(0.35);
}

.modal {
  position: fixed;
  inset: 0;
  z-index: var(--z-sheet);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 16px 12px 0;
  background: rgba(40, 24, 8, 0.45);
}

.sheet {
  width: min(480px, 100%);
  position: relative;
  z-index: calc(var(--z-sheet) + 1);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 16px calc(16px + var(--dock-height));
  border: 3px solid var(--gold-deep);
  border-radius: 16px 16px 12px 12px;
  background: var(--plate);
  box-shadow: 0 6px 0 var(--shadow);
}

.sheet header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.sheet .title {
  margin: 0;
  font-size: 20px;
}

.sheet-ico {
  margin: 0;
  font-size: 28px;
  line-height: 1;
}

.close {
  min-height: 32px;
  padding: 4px 10px;
}

.ready {
  color: var(--ink);
  font-weight: 700;
}

.actions {
  display: flex;
}

.actions button {
  flex: 1 1 auto;
}
</style>
