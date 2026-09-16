<script setup lang="ts">
import { computed } from 'vue'
import {
  DISTANCE_LABEL,
  POWER_LABEL,
  barterBlockReason,
  buyMerchantBlockReason,
  canBarter,
  canBuyMerchant,
  canDepartEncounter,
  canExplore,
  canSubmitSupply,
  departBlockReason,
  exploreBlockReason,
  exploreCost,
  formatNeedMap,
  needLines,
  submitSupplyBlockReason,
} from '../sim/encounters'
import type { Encounter } from '../sim/types'
import { useGameStore } from './gameStore'

const game = useGameStore()
const cost = computed(() => exploreCost(game.save))
const exploreWhy = computed(() => exploreBlockReason(game.save))
const readyToExplore = computed(() => canExplore(game.save))
const departedTotal = computed(() => game.save.departCount)

function enemyLines(enc: Encounter) {
  return enc.kind === 'enemy' ? needLines(game.save, enc.needs) : []
}

function wantLines(enc: Encounter) {
  return enc.kind === 'merchant' ? needLines(game.save, enc.wants) : []
}

function submitWhy(index: number) {
  return submitSupplyBlockReason(game.save, index)
}

function departWhy(index: number) {
  return departBlockReason(game.save, index)
}

function barterWhy(index: number) {
  return barterBlockReason(game.save, index)
}

function buyWhy(index: number) {
  return buyMerchantBlockReason(game.save, index)
}
</script>

<template>
  <section class="panel encounter">
    <p>偶遇</p>
    <p class="hint">板上固定 5 格。探索花费金币重抽整板；敌人交补给后出发（战斗稍后），商人可换货或买货。</p>
    <div class="row">
      <button type="button" :disabled="!readyToExplore" @click="game.explore()">
        探索（{{ cost }} 金）
      </button>
    </div>
    <p v-if="!readyToExplore && exploreWhy" class="short">{{ exploreWhy }}</p>
    <p v-else class="hint">当前金币 {{ game.save.gold }}</p>

    <div class="board">
      <article v-for="(enc, i) in game.save.encounters" :key="enc.id" class="card">
        <template v-if="enc.kind === 'enemy'">
          <header>
            <span class="kind">敌人</span>
            <span class="tags">
              <i>{{ DISTANCE_LABEL[enc.distance] }}</i>
              <i>{{ POWER_LABEL[enc.power] }}</i>
            </span>
          </header>
          <p class="label">{{ enc.label }} · 补给金 {{ enc.departGold }}</p>
          <ul>
            <li v-for="line in enemyLines(enc)" :key="line.itemId" :class="{ short: line.missing > 0 }">
              {{ line.label }} <strong>{{ line.have }}</strong> / {{ line.need }}
              <span v-if="line.missing > 0"> · 差 {{ line.missing }}</span>
            </li>
          </ul>
          <p v-if="enc.departed" class="ready">已出发（战斗稍后）</p>
          <p v-else-if="enc.submitted" class="ready">补给已提交，可以出发</p>
          <p v-else-if="submitWhy(i)" class="short">{{ submitWhy(i) }}</p>
          <div v-if="!enc.departed" class="row">
            <button type="button" :disabled="!canSubmitSupply(game.save, i)" @click="game.submitSupply(i)">
              提交补给
            </button>
            <button type="button" :disabled="!canDepartEncounter(game.save, i)" @click="game.departEncounter(i)">
              出发
            </button>
          </div>
          <p v-if="!enc.departed && !enc.submitted && departWhy(i)" class="hint">{{ departWhy(i) }}</p>
        </template>

        <template v-else>
          <header>
            <span class="kind">商人</span>
          </header>
          <p class="label">{{ enc.label }}</p>
          <p>收购 {{ formatNeedMap(enc.wants) }}</p>
          <p>换得 {{ formatNeedMap(enc.offers) }}</p>
          <p>金币购买 {{ enc.buyGold }} 金 → {{ formatNeedMap(enc.buyOffers) }}</p>
          <ul>
            <li v-for="line in wantLines(enc)" :key="line.itemId" :class="{ short: line.missing > 0 }">
              {{ line.label }} <strong>{{ line.have }}</strong> / {{ line.need }}
              <span v-if="line.missing > 0"> · 差 {{ line.missing }}</span>
            </li>
          </ul>
          <p v-if="enc.completed" class="ready">这笔买卖已完成</p>
          <div v-else class="row">
            <button type="button" :disabled="!canBarter(game.save, i)" @click="game.barter(i)">以物易物</button>
            <button type="button" :disabled="!canBuyMerchant(game.save, i)" @click="game.buyMerchant(i)">
              金币购买
            </button>
          </div>
          <p v-if="!enc.completed && barterWhy(i)" class="hint">{{ barterWhy(i) }}</p>
          <p v-if="!enc.completed && buyWhy(i)" class="hint">{{ buyWhy(i) }}</p>
        </template>
      </article>
    </div>

    <p v-if="departedTotal > 0" class="hint">已出发 {{ departedTotal }} 次（战斗稍后）</p>
    <p class="hint">第一期敌人收基础铜器 / 熟食 / 矿与干粮。真战斗后做。</p>
  </section>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid var(--seam);
  background: var(--plate);
}

.panel p,
.hint,
.label {
  margin: 0;
  line-height: 1.5;
}

.label {
  font-family: var(--font-mono);
  color: var(--copper);
}

.board {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

@media (min-width: 560px) {
  .board {
    grid-template-columns: 1fr 1fr;
  }
}

.card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--seam);
  background: #18140f;
}

.card header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.kind {
  letter-spacing: 0.12em;
}

.tags {
  display: flex;
  gap: 6px;
}

.tags i {
  font-style: normal;
  padding: 1px 8px;
  border: 1px solid var(--copper);
  color: var(--ember);
  font-size: 12px;
}

ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: var(--font-mono);
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

button {
  padding: 6px 10px;
  border: 1px solid var(--seam);
  background: #18140f;
}

.hint {
  color: var(--muted);
  font-size: 14px;
}

.short {
  color: var(--danger);
}

.ready {
  color: var(--moss);
}
</style>
