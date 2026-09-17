<script setup lang="ts">
import { computed } from 'vue'
import { bankQty } from '../sim/bank'
import {
  BLUEPRINT_TECH_POINTS,
  TECH_TREE,
  hasTech,
  isTechComplete,
  nextTech,
} from '../sim/tech'
import { useGameStore } from './gameStore'

const game = useGameStore()
const points = computed(() => game.save.techPoints)
const next = computed(() => nextTech(game.save))
const done = computed(() => isTechComplete(game.save))
const blueprints = computed(() => bankQty(game.save, 'blueprint'))
const unlockedCount = computed(() => game.save.unlockedTechIds.length)

function nodeState(id: (typeof TECH_TREE)[number]['id']) {
  if (hasTech(game.save, id)) return 'done'
  if (next.value?.id === id) return 'next'
  return 'lock'
}
</script>

<template>
  <section class="panel tree">
    <p>科技</p>
    <p class="hint">
      制造站（锻造 / 烹饪 / 炼金）每完成 1 次周期 +1 科技点。也可消耗 1 张图纸兑换 {{ BLUEPRINT_TECH_POINTS }} 点。必须按序解锁。
    </p>
    <div class="chips">
      <span class="chip">科技点 {{ points }}</span>
      <span class="chip">已解锁 {{ unlockedCount }}/{{ TECH_TREE.length }}</span>
      <span class="chip">图纸 {{ blueprints }}</span>
    </div>
    <p v-if="next" class="hint">下一档 {{ next.name }} · 需要 {{ next.cost }} 点</p>
    <p v-else class="hint">线性科技已全部研究。</p>
    <div class="row">
      <button type="button" :disabled="done" @click="game.researchNextTech()">
        {{ done ? '已全部解锁' : `研究下一档（${next?.cost ?? 0} 点）` }}
      </button>
      <button type="button" :disabled="blueprints < 1" @click="game.exchangeBlueprint()">
        图纸兑换（1 张 → {{ BLUEPRINT_TECH_POINTS }} 点）
      </button>
    </div>
    <ol>
      <li v-for="(node, index) in TECH_TREE" :key="node.id" class="card" :class="nodeState(node.id)">
        <p class="name">
          <b class="mark">{{ index + 1 }}</b>
          {{ node.name }}
          <i v-if="nodeState(node.id) === 'done'">已解锁</i>
          <i v-else-if="nodeState(node.id) === 'next'">下一档 · {{ node.cost }} 点</i>
          <i v-else>未解锁 · {{ node.cost }} 点</i>
        </p>
        <p class="desc">{{ node.desc }}</p>
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

p,
.hint,
.desc {
  margin: 0;
  line-height: 1.5;
}

.hint,
.desc,
i {
  color: var(--muted);
  font-size: 13px;
  font-style: normal;
}

.chips,
.row {
  flex-direction: row;
  flex-wrap: wrap;
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

.card.lock {
  opacity: 0.72;
}

.name {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-weight: 700;
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
}

.card.done .mark {
  background: linear-gradient(#8fd94a, var(--moss-deep));
  color: #fffdf8;
  border-color: var(--moss-deep);
}
</style>
