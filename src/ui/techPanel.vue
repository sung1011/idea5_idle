<script setup lang="ts">
import { computed } from 'vue'
import {
  TECH_STAGES,
  TECH_TREE,
  encounterSlotCount,
  hasTech,
  isStageOpen,
  isTechComplete,
  researchBlockReason,
  stageMinorsReady,
  techTier,
  type TechNodeDef,
  type TechStageDef,
} from '../sim/tech'
import type { TechId } from '../sim/types'
import { useGameStore } from './gameStore'

const game = useGameStore()
const points = computed(() => game.save.techPoints)
const knightLevel = computed(() => game.save.knightLevel)
const slots = computed(() => encounterSlotCount(game.save))
const done = computed(() => isTechComplete(game.save))
const unlockedCount = computed(() => techTier(game.save))
const progressPct = computed(() => Math.round((unlockedCount.value / TECH_TREE.length) * 100))

function lit(id: TechId) {
  return hasTech(game.save, id)
}

function nodeClass(node: TechNodeDef) {
  if (lit(node.id)) return 'on'
  if (!researchBlockReason(game.save, node.id)) return 'ready'
  return 'off'
}

function majorHint(stage: TechStageDef) {
  if (lit(stage.major.id)) return '已点亮'
  if (!isStageOpen(game.save, stage.stage)) return '需上一阶段'
  if (!stageMinorsReady(game.save, stage.stage)) return '小点未齐'
  return `${stage.major.cost} 灵感`
}

function onNode(node: TechNodeDef) {
  if (lit(node.id)) return
  game.researchTech(node.id)
}
</script>

<template>
  <section class="panel tree">
    <p class="kicker">骑士工坊 · 科技</p>
    <p class="title">阶段科技树</p>
    <p class="hint">
      任意工坊完成一个周期 +1 灵感。骑士等级每升 1 级也 +1。阶段内小点可任意顺序点亮；大科技要本阶段小点全亮。偶遇格由大科技 1→6。工坊规章 / 工匠密录减轻同站两人冲突。
    </p>
    <div class="chips">
      <span class="chip">骑士 {{ knightLevel }} 级</span>
      <span class="chip">灵感 {{ points }}</span>
      <span class="chip">偶遇 {{ slots }} 格</span>
      <span class="chip">进度 {{ unlockedCount }}/{{ TECH_TREE.length }}</span>
    </div>
    <div class="bar xp" aria-label="科技进度">
      <i :style="{ width: `${progressPct}%` }" />
    </div>
    <p v-if="done" class="hint">科技树已满。</p>
    <ol class="stages">
      <li
        v-for="stage in TECH_STAGES"
        :key="stage.stage"
        class="stage"
        :class="{ locked: !isStageOpen(game.save, stage.stage), done: lit(stage.major.id) }"
      >
        <b class="num">{{ String(stage.stage).padStart(2, '0') }}</b>
        <div class="minors">
          <button
            v-for="minor in stage.minors"
            :key="minor.id"
            type="button"
            class="hex"
            :class="nodeClass(minor)"
            :title="`${minor.name} · ${minor.cost} 灵感`"
            @click="onNode(minor)"
          >
            <span>{{ minor.name.slice(0, 1) }}</span>
          </button>
        </div>
        <button
          type="button"
          class="major"
          :class="nodeClass(stage.major)"
          @click="onNode(stage.major)"
        >
          <strong>{{ stage.major.name }}</strong>
          <i>{{ majorHint(stage) }}</i>
        </button>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.tree,
.chips,
.stages {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tree {
  padding: 14px 16px;
  background: linear-gradient(180deg, #fffdf6 0%, #fff4dc 100%);
}

p,
.hint {
  margin: 0;
  line-height: 1.5;
}

.kicker,
.hint,
i {
  color: var(--muted);
  font-size: 13px;
  font-style: normal;
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

.stages {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}

.stage {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) minmax(112px, 34%);
  align-items: center;
  gap: 8px;
  padding: 8px 6px;
  border-bottom: 1px dashed var(--seam);
}

.stage.locked {
  opacity: 0.55;
}

.num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 2px solid var(--gold-deep);
  border-radius: 999px;
  background: linear-gradient(#ffe27a, #f0b83a);
  font-size: 12px;
  font-family: var(--font-mono);
}

.stage.done .num {
  background: linear-gradient(#8fd94a, var(--moss-deep));
  color: #fffdf8;
  border-color: var(--moss-deep);
}

.minors {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}

.hex {
  width: 36px;
  height: 40px;
  min-height: 40px;
  padding: 0;
  border: 2px solid var(--gold-deep);
  border-radius: 0;
  box-shadow: none;
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
  background: linear-gradient(#fff6dc, #f0d48a);
  font-size: 12px;
  font-weight: 700;
}

.hex.on {
  background: linear-gradient(#8fd94a, var(--moss-deep));
  color: #fffdf8;
  border-color: var(--moss-deep);
}

.hex.ready {
  background: linear-gradient(#fff3a8, #f0c14a);
}

.hex.off {
  background: #efe4c8;
  color: var(--muted);
}

.major {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-height: 48px;
  padding: 6px 8px;
  text-align: left;
}

.major.on {
  background: linear-gradient(#fffef4, #d8f0b0);
}

.major.ready {
  border-color: var(--ember);
}

.major.off {
  opacity: 0.78;
}

.major strong {
  font-family: var(--font-display);
  letter-spacing: 0.04em;
  font-size: 13px;
}

.major i {
  font-size: 11px;
}
</style>
