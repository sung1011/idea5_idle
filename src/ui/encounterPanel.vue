<script setup lang="ts">
import { computed } from 'vue'
import {
  DISTANCE_LABEL,
  MERCHANT_KIND_LABEL,
  POWER_LABEL,
  QUALITY_LABEL,
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
  encounterStampLabel,
  exploreBlockReason,
  exploreCost,
  formatMarchClock,
  formatNeedMap,
  isEncounterSettled,
  isLootReady,
  isMarching,
  isMerchantKind,
  marchRemainS,
  needLines,
  pawnBlockReason,
  pawnGoldForEncounter,
  pawnQuoteLines,
} from '../sim/encounters'
import type { Encounter, EnemyEncounter, MerchantKind, PawnshopEncounter } from '../sim/types'
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
  return enc.kind === 'pawnshop' ? pawnQuoteLines(game.save, enc.pawnWants, enc.quality) : []
}

function pawnGold(enc: PawnshopEncounter) {
  return pawnGoldForEncounter(enc)
}

function cardClass(enc: Encounter) {
  return ['card', `q-${enc.quality}`, { done: isEncounterSettled(enc) }]
}

function stampText(enc: Encounter) {
  return encounterStampLabel(enc)
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
    <div class="row">
      <button type="button" :disabled="!readyToExplore" @click="game.explore()">
        探索（{{ cost }} 金）
      </button>
    </div>
    <p v-if="!readyToExplore && exploreWhy" class="short">{{ exploreWhy }}</p>
    <p v-else class="hint">当前金币 {{ game.save.gold }}</p>

    <div class="board">
      <article v-for="(enc, i) in game.save.encounters" :key="enc.id" :class="cardClass(enc)">
        <i v-if="stampText(enc)" class="stamp">{{ stampText(enc) }}</i>
        <template v-if="enc.kind === 'enemy'">
          <header>
            <i class="sprite sprite-encounter enemy" aria-hidden="true" />
            <div class="titles">
              <span class="kind">敌人</span>
              <span class="tags">
                <i class="q-badge" :class="'q-' + enc.quality">{{ QUALITY_LABEL[enc.quality] }}</i>
                <i>{{ DISTANCE_LABEL[enc.distance] }}</i>
                <i>{{ POWER_LABEL[enc.power] }}</i>
              </span>
            </div>
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
          <div v-if="!enc.departed && !enc.lootClaimed" class="row">
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
            <i class="sprite sprite-encounter" :class="enc.kind" aria-hidden="true" />
            <div class="titles">
              <span class="kind">{{ merchantTitle(enc.kind) }}</span>
              <span class="tags">
                <i class="q-badge" :class="'q-' + enc.quality">{{ QUALITY_LABEL[enc.quality] }}</i>
              </span>
            </div>
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
            <p>典当 {{ formatNeedMap(enc.pawnWants) }} → {{ pawnGold(enc) }} 金</p>
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

    <p v-if="departedTotal > 0" class="hint">已出发 {{ departedTotal }} 次</p>
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

@media (min-width: 900px) {
  .board {
    grid-template-columns: 1fr 1fr 1fr;
  }
}

.card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  overflow: hidden;
}

.card.q-gray {
  border-color: #8d8d8d;
  box-shadow: 0 3px 0 #6a6a6a, inset 0 0 0 2px #f3f0ea;
}

.card.q-green {
  border-color: #3e9a2a;
  box-shadow: 0 3px 0 #2d7a1c, inset 0 0 0 2px #e8f8dc;
}

.card.q-blue {
  border-color: #3a7bd5;
  box-shadow: 0 3px 0 #2658a0, inset 0 0 0 2px #e0ecff;
}

.card.q-purple {
  border-color: #8a4adf;
  box-shadow: 0 3px 0 #5c2e9a, inset 0 0 0 2px #f0e4ff;
}

.card.q-orange {
  border-color: #e07a14;
  box-shadow: 0 3px 0 #b45c0c, inset 0 0 0 2px #ffe8cc;
}

.card.done {
  background: #e7efd4;
  box-shadow: 0 3px 0 #7a8a4a, inset 0 0 0 2px #f4f7e6;
}

.card.done .row button {
  pointer-events: none;
}

.tags i.q-badge,
.q-badge {
  min-width: 28px;
  padding: 1px 8px;
  border: 2px solid currentColor;
  border-radius: 999px;
  font-size: 12px;
  font-style: normal;
  letter-spacing: 0.12em;
  text-align: center;
  background: var(--slot);
}

.q-badge.q-gray {
  color: #6a6a6a;
}

.q-badge.q-green {
  color: #2d7a1c;
}

.q-badge.q-blue {
  color: #2658a0;
}

.q-badge.q-purple {
  color: #5c2e9a;
}

.q-badge.q-orange {
  color: #b45c0c;
}

.stamp {
  position: absolute;
  top: 46%;
  left: 50%;
  z-index: 2;
  transform: translate(-50%, -50%) rotate(-18deg);
  padding: 4px 14px;
  border: 3px solid #9a2f24;
  border-radius: 8px;
  color: #9a2f24;
  background: rgba(255, 244, 230, 0.72);
  font-family: var(--font-display);
  font-size: 28px;
  font-style: normal;
  letter-spacing: 0.28em;
  pointer-events: none;
}

.card header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.titles {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
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
