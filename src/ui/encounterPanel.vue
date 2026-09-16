<script setup lang="ts">
import { computed } from 'vue'
import {
  DISTANCE_LABEL,
  MERCHANT_KIND_LABEL,
  POWER_LABEL,
  barterBlockReason,
  buyMerchantBlockReason,
  canBarter,
  canBuyMerchant,
  canClaimLoot,
  canDepartEncounter,
  canExplore,
  canPawn,
  claimLootBlockReason,
  departBlockReason,
  exploreBlockReason,
  exploreCost,
  formatMarchClock,
  formatNeedMap,
  isLootReady,
  isMarching,
  isMerchantKind,
  marchRemainS,
  needLines,
  pawnBlockReason,
  pawnGoldForMap,
  pawnQuoteLines,
} from '../sim/encounters'
import type { Encounter, EnemyEncounter, MerchantKind } from '../sim/types'
import { useGameStore } from './gameStore'

const game = useGameStore()
const cost = computed(() => exploreCost(game.save))
const exploreWhy = computed(() => exploreBlockReason(game.save))
const readyToExplore = computed(() => canExplore(game.save))
const departedTotal = computed(() => game.save.departCount)
const now = computed(() => {
  void game.save.elapsedS
  return Date.now()
})

function enemyLines(enc: Encounter) {
  return enc.kind === 'enemy' ? needLines(game.save, enc.needs) : []
}

function wantLines(enc: Encounter) {
  return enc.kind === 'passerby' ? needLines(game.save, enc.wants) : []
}

function pawnLines(enc: Encounter) {
  return enc.kind === 'pawnshop' ? pawnQuoteLines(game.save, enc.pawnWants) : []
}

function merchantTitle(kind: MerchantKind) {
  return MERCHANT_KIND_LABEL[kind]
}

function departWhy(index: number) {
  return departBlockReason(game.save, index)
}

function lootWhy(index: number) {
  return claimLootBlockReason(game.save, index, now.value)
}

function barterWhy(index: number) {
  return barterBlockReason(game.save, index)
}

function buyWhy(index: number) {
  return buyMerchantBlockReason(game.save, index)
}

function pawnWhy(index: number) {
  return pawnBlockReason(game.save, index)
}

function marching(enc: EnemyEncounter) {
  return isMarching(enc, now.value)
}

function lootReady(enc: EnemyEncounter) {
  return isLootReady(enc, now.value)
}

function marchLabel(enc: EnemyEncounter) {
  return `行军中 ${formatMarchClock(marchRemainS(enc, now.value))}`
}
</script>

<template>
  <section class="panel encounter">
    <p>偶遇</p>
    <p class="hint">
      板上固定 5 格。探索花金币重抽可刷新格；行军中或可领奖的敌人会留在原位。敌人货够则一键出发进入行军，到期只领金币。黑心商人只买、路人只换货、当铺只典当。
    </p>
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
          <p class="label">{{ enc.label }} · 战利品 {{ enc.lootGold }} 金</p>
          <ul>
            <li v-for="line in enemyLines(enc)" :key="line.itemId" :class="{ short: line.missing > 0 }">
              {{ line.label }} <strong>{{ line.have }}</strong> / {{ line.need }}
              <span v-if="line.missing > 0"> · 差 {{ line.missing }}</span>
            </li>
          </ul>
          <p v-if="enc.lootClaimed" class="ready">战利品已领取</p>
          <p v-else-if="lootReady(enc)" class="ready">行军结束，可以领取战利品</p>
          <p v-else-if="marching(enc)" class="ready">{{ marchLabel(enc) }}</p>
          <p v-else-if="departWhy(i)" class="short">{{ departWhy(i) }}</p>
          <div v-if="!enc.departed" class="row">
            <button type="button" :disabled="!canDepartEncounter(game.save, i)" @click="game.departEncounter(i)">
              出发
            </button>
          </div>
          <div v-else-if="!enc.lootClaimed" class="row">
            <button v-if="marching(enc)" type="button" disabled>{{ marchLabel(enc) }}</button>
            <button
              v-else
              type="button"
              :disabled="!canClaimLoot(game.save, i, now)"
              @click="game.claimLoot(i)"
            >
              战利品
            </button>
          </div>
          <p v-if="enc.departed && !enc.lootClaimed && lootWhy(i) && !lootReady(enc)" class="hint">
            {{ lootWhy(i) }}
          </p>
        </template>

        <template v-else-if="isMerchantKind(enc.kind)">
          <header>
            <span class="kind">{{ merchantTitle(enc.kind) }}</span>
          </header>
          <p class="label">{{ enc.label }}</p>

          <template v-if="enc.kind === 'shady'">
            <p>金币购买 {{ enc.buyGold }} 金 → {{ formatNeedMap(enc.buyOffers) }}</p>
            <p v-if="enc.completed" class="ready">这笔买卖已完成</p>
            <div v-else class="row">
              <button type="button" :disabled="!canBuyMerchant(game.save, i)" @click="game.buyMerchant(i)">
                金币购买
              </button>
            </div>
            <p v-if="!enc.completed && buyWhy(i)" class="hint">{{ buyWhy(i) }}</p>
          </template>

          <template v-else-if="enc.kind === 'passerby'">
            <p>交出 {{ formatNeedMap(enc.wants) }}</p>
            <p>换得 {{ formatNeedMap(enc.offers) }}</p>
            <ul>
              <li v-for="line in wantLines(enc)" :key="line.itemId" :class="{ short: line.missing > 0 }">
                {{ line.label }} <strong>{{ line.have }}</strong> / {{ line.need }}
                <span v-if="line.missing > 0"> · 差 {{ line.missing }}</span>
              </li>
            </ul>
            <p v-if="enc.completed" class="ready">这笔买卖已完成</p>
            <div v-else class="row">
              <button type="button" :disabled="!canBarter(game.save, i)" @click="game.barter(i)">以物易物</button>
            </div>
            <p v-if="!enc.completed && barterWhy(i)" class="hint">{{ barterWhy(i) }}</p>
          </template>

          <template v-else>
            <p>典当 {{ formatNeedMap(enc.pawnWants) }} → {{ pawnGoldForMap(enc.pawnWants) }} 金</p>
            <ul>
              <li v-for="line in pawnLines(enc)" :key="line.itemId" :class="{ short: line.missing > 0 }">
                {{ line.label }} <strong>{{ line.have }}</strong> / {{ line.need }}
                <span> · 报价 {{ line.gold }} 金</span>
                <span v-if="line.missing > 0"> · 差 {{ line.missing }}</span>
              </li>
            </ul>
            <p v-if="enc.completed" class="ready">这笔买卖已完成</p>
            <div v-else class="row">
              <button type="button" :disabled="!canPawn(game.save, i)" @click="game.pawn(i)">以物换钱</button>
            </div>
            <p v-if="!enc.completed && pawnWhy(i)" class="hint">{{ pawnWhy(i) }}</p>
          </template>
        </template>
      </article>
    </div>

    <p v-if="departedTotal > 0" class="hint">已出发 {{ departedTotal }} 次（行军门闩，不做战斗）</p>
    <p class="hint">第一期敌人收基础铜器 / 熟食 / 矿与干粮。真战斗后做。</p>
  </section>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
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
  border: 2px solid var(--gold-deep);
  border-radius: 999px;
  background: var(--slot);
  color: var(--ink);
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
