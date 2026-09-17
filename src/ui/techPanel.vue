<script setup lang="ts">
import { computed } from 'vue'
import {
  TECH_TREE,
  hasTech,
  isTechComplete,
  nextTech,
  techTier,
} from '../sim/tech'
import { useGameStore } from './gameStore'

const game = useGameStore()
const points = computed(() => game.save.techPoints)
const knightLevel = computed(() => game.save.knightLevel)
const next = computed(() => nextTech(game.save))
const done = computed(() => isTechComplete(game.save))
const unlockedCount = computed(() => techTier(game.save))
const progressPct = computed(() => Math.round((unlockedCount.value / TECH_TREE.length) * 100))

function nodeState(id: (typeof TECH_TREE)[number]['id']) {
  if (hasTech(game.save, id)) return 'done'
  if (next.value?.id === id) return 'next'
  return 'lock'
}
</script>

<template>
  <section class="panel tree">
    <p class="kicker">骑士工坊 · 科技</p>
    <p class="title">灵感与纹章</p>
    <p class="hint">
      任意工坊完成一个周期 +1 灵感。骑士等级每升 1 级也 +1 灵感。按序点亮，效果稍后开放。
    </p>
    <div class="chips">
      <span class="chip">骑士 {{ knightLevel }} 级</span>
      <span class="chip">灵感 {{ points }}</span>
      <span class="chip">进度 {{ unlockedCount }}/{{ TECH_TREE.length }}</span>
    </div>
    <div class="bar xp" aria-label="科技进度">
      <i :style="{ width: `${progressPct}%` }" />
    </div>
    <p v-if="next" class="hint">下一档 {{ next.name }} · 需要 {{ next.cost }} 灵感</p>
    <p v-else class="hint">科技树已满。</p>
    <div class="row">
      <button type="button" :disabled="done" @click="game.researchNextTech()">
        {{ done ? '科技树已满' : `研究「${next?.name ?? ''}」· ${next?.cost ?? 0} 灵感` }}
      </button>
    </div>
    <ol>
      <li v-for="(node, index) in TECH_TREE" :key="node.id" class="card" :class="nodeState(node.id)">
        <p class="name">
          <b class="mark">{{ String(index + 1).padStart(2, '0') }}</b>
          {{ node.name }}
          <i v-if="nodeState(node.id) === 'done'">已点亮</i>
          <i v-else-if="nodeState(node.id) === 'next'">可研究 · {{ node.cost }} 灵感</i>
          <i v-else>未解锁 · {{ node.cost }} 灵感</i>
        </p>
        <p class="desc">{{ node.desc }}</p>
        <p class="later">效果稍后开放</p>
        <div class="row">
          <button
            v-if="nodeState(node.id) === 'next'"
            type="button"
            @click="game.researchTech(node.id)"
          >
            研究
          </button>
          <span v-else-if="nodeState(node.id) === 'done'" class="seal">已入册</span>
        </div>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.tree,
ol,
.row,
.chips {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tree {
  padding: 14px 16px;
  background: linear-gradient(180deg, #fffdf6 0%, #fff4dc 100%);
}

p,
.hint,
.desc,
.later {
  margin: 0;
  line-height: 1.5;
}

.kicker,
.hint,
.desc,
.later,
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

.chips,
.row {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
}

ol {
  margin: 0;
  padding: 0;
  list-style: none;
}

.card {
  padding: 10px 12px;
}

.card.next {
  border-color: var(--ember);
}

.card.done {
  background: linear-gradient(#fffef4, #f6e7b8);
}

.card.lock {
  opacity: 0.72;
}

.name {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-family: var(--font-display);
  letter-spacing: 0.06em;
}

.mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border: 2px solid var(--gold-deep);
  border-radius: 999px;
  background: linear-gradient(#ffe27a, #f0b83a);
  font-size: 12px;
  font-family: var(--font-mono);
}

.card.done .mark {
  background: linear-gradient(#8fd94a, var(--moss-deep));
  color: #fffdf8;
  border-color: var(--moss-deep);
}

.later {
  font-size: 12px;
}

.seal {
  color: var(--moss-deep);
  font-weight: 700;
  letter-spacing: 0.08em;
}
</style>
