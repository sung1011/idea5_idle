<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  TECH_TAB_IDS,
  TECH_TAB_LABELS,
  TECH_TREE,
  encounterSlotCount,
  isRowOpen,
  isTechComplete,
  isTechMaxed,
  techActivateLabel,
  techProgressText,
  techReadyLabel,
  techTab as techTabDef,
  techTier,
  type TechNodeDef,
  type TechTabId,
} from '../sim/tech'
import { isGuideQuestFlash, PATH_OUTPOST_TECH_ID } from '../sim/guideQuest'
import type { TechId } from '../sim/types'
import { useGameStore } from './gameStore'
import { selectTechTab, techTab } from './techTabs'

const game = useGameStore()
const guideFlashPathOutpost = computed(() => isGuideQuestFlash(game.save, 'pathOutpost'))
const selected = ref<TechNodeDef | null>(null)
const points = computed(() => game.save.techPoints)
const knightLevel = computed(() => game.save.knightLevel)
const slots = computed(() => encounterSlotCount(game.save))
const done = computed(() => isTechComplete(game.save))
const unlockedCount = computed(() => techTier(game.save))
const progressPct = computed(() => Math.round((unlockedCount.value / TECH_TREE.length) * 100))
const currentTab = computed(() => techTabDef(techTab.value))
const displayRows = computed(() => [...currentTab.value.rows].reverse())
const selectedLive = computed(() => {
  const node = selected.value
  if (!node) return null
  return {
    node,
    maxed: isTechMaxed(game.save, node.id),
    activateLabel: techActivateLabel(game.save, node.id),
  }
})

function selectTab(id: TechTabId) {
  selectTechTab(id)
  selected.value = null
}

function maxed(id: TechId) {
  return isTechMaxed(game.save, id)
}

function progress(id: TechId) {
  return techProgressText(game.save, id)
}

function nodeClass(node: TechNodeDef) {
  if (maxed(node.id)) return 'on'
  if (isRowOpen(game.save, node.tab, node.row)) return 'ready'
  return 'off'
}

function onNode(node: TechNodeDef) {
  if (maxed(node.id) || isRowOpen(game.save, node.tab, node.row)) {
    selected.value = node
    return
  }
  game.researchTech(node.id)
}

function activate() {
  const node = selected.value
  if (!node || maxed(node.id)) return
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
        :aria-selected="techTab === id"
        :class="{ on: techTab === id, 'guide-flash': guideFlashPathOutpost && id === 'affairs' }"
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
            :class="[nodeClass(node), { 'guide-flash': guideFlashPathOutpost && node.id === PATH_OUTPOST_TECH_ID }]"
            :title="node.name"
            @click="onNode(node)"
          >
            <span class="ico" aria-hidden="true">{{ node.icon }}</span>
            <strong>{{ node.name }}</strong>
            <i class="impl" :class="node.implemented ? 'yes' : 'no'">{{ techReadyLabel(node) }}</i>
            <i class="prog">{{ progress(node.id) }}</i>
            <i v-if="maxed(node.id)" class="mark" aria-hidden="true">✓</i>
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
          <p class="desc">{{ selectedLive.node.desc }}</p>
          <div class="actions">
            <button
              v-if="selectedLive.maxed"
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
              {{ selectedLive.activateLabel }}
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
.desc {
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
  align-items: stretch;
  gap: 2px;
  padding: 3px;
  border: 2px solid var(--gold);
  border-radius: var(--radius-pill);
  background: linear-gradient(180deg, #fffef8 0%, #fff3d4 100%);
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
  background: linear-gradient(#ffe27a, #f0b83a);
  box-shadow: 0 2px 6px rgba(212, 160, 23, 0.32);
  opacity: 1;
  filter: none;
}

.rows {
  margin: 16px 0 0;
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
  min-height: 80px;
  padding: 10px 6px 8px;
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

.node .impl {
  font-size: 10px;
  font-style: normal;
  font-weight: 700;
  letter-spacing: 0.06em;
  line-height: 1.2;
  padding: 1px 6px;
  border-radius: var(--radius-pill);
  white-space: nowrap;
}

.node .impl.yes {
  color: #245c10;
  background: rgba(47, 107, 18, 0.16);
}

.node .impl.no {
  color: #7a5a38;
  background: rgba(80, 48, 12, 0.1);
}

.node.on .impl.yes {
  color: #f3ffe4;
  background: rgba(255, 253, 248, 0.22);
}

.node.on .impl.no {
  color: #fff3d4;
  background: rgba(40, 24, 8, 0.18);
}

.node .prog {
  position: absolute;
  left: 6px;
  top: 4px;
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
  letter-spacing: 0;
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

.actions {
  display: flex;
}

.actions button {
  flex: 1 1 auto;
}
</style>
