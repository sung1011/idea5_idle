<script setup lang="ts">
import { computed } from 'vue'
import {
  DISTANCE_LABEL,
  ENCOUNTER_KIND_LABEL,
  POWER_LABEL,
  QUALITY_LABEL,
  artisanBlockReason,
  barterBlockReason,
  bulkBuyBlockReason,
  buyMerchantBlockReason,
  canBarter,
  canBulkBuy,
  canBuyMerchant,
  canClaimLoot,
  canDepartEncounter,
  canExplore,
  canPawn,
  canSubmitArtisan,
  claimLootBlockReason,
  departBlockReason,
  exploreBlockReason,
  exploreCost,
  formatMarchClock,
  formatNeedMap,
  isEncounterDone,
  isLootReady,
  isMarching,
  isWorkshopBuffActive,
  marchRemainS,
  needLines,
  pawnBlockReason,
  pawnQuoteLines,
  pawnRewardGold,
  stampLabel,
  workshopBuffMul,
  workshopBuffRemainS,
} from '../sim/encounters'
import type { Encounter, EncounterKind, EnemyEncounter, PawnEncounter } from '../sim/types'
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
const buffOn = computed(() => isWorkshopBuffActive(game.save, now.value))
const buffLabel = computed(() => {
  if (!buffOn.value) return ''
  const pct = Math.round((workshopBuffMul(game.save, now.value) - 1) * 100)
  return `工匠加持：工坊产量 +${pct}% · 剩余 ${formatMarchClock(workshopBuffRemainS(game.save, now.value))}`
})

function enemyLines(enc: Encounter) {
  return enc.kind === 'enemy' ? needLines(game.save, enc.needs) : []
}

function wantLines(enc: Encounter) {
  if (enc.kind === 'passerby' || enc.kind === 'artisan' || enc.kind === 'bulkBuy') {
    return needLines(game.save, enc.wants)
  }
  return []
}

function pawnLines(enc: Encounter) {
  return enc.kind === 'pawn' ? pawnQuoteLines(game.save, enc.pawnWants) : []
}

function kindTitle(kind: EncounterKind) {
  return ENCOUNTER_KIND_LABEL[kind]
}

function spriteKind(kind: EncounterKind) {
  return kind
}

function cardClass(enc: Encounter) {
  return {
    [`q-${enc.quality}`]: true,
    done: isEncounterDone(enc, now.value),
  }
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

function artisanWhy(index: number) {
  return artisanBlockReason(game.save, index)
}

function bulkWhy(index: number) {
  return bulkBuyBlockReason(game.save, index)
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

function pawnGold(enc: PawnEncounter) {
  return pawnRewardGold(enc)
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
    <p v-else class="hint">工坊看板 5 格。当前金币 {{ game.save.gold }}</p>
    <p v-if="buffOn" class="buff">{{ buffLabel }}</p>

    <div class="board">
      <article v-for="(enc, i) in game.save.encounters" :key="enc.id" class="card" :class="cardClass(enc)">
        <i v-if="isEncounterDone(enc, now)" class="stamp" aria-hidden="true">{{ stampLabel(enc) }}</i>
        <b class="qmark">{{ QUALITY_LABEL[enc.quality] }}</b>

        <template v-if="enc.kind === 'enemy'">
          <header>
            <i class="sprite sprite-encounter" :class="spriteKind(enc.kind)" aria-hidden="true" />
            <div class="titles">
              <span class="kind">{{ kindTitle(enc.kind) }}</span>
              <span class="tags">
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
          <div class="row">
            <button
              v-if="enc.lootClaimed"
              type="button"
              disabled
            >
              已领
            </button>
            <button
              v-else-if="!enc.departed"
              type="button"
              :disabled="!canDepartEncounter(game.save, i)"
              @click="game.departEncounter(i)"
            >
              出发
            </button>
            <button v-else-if="marching(enc)" type="button" disabled>{{ marchLabel(enc) }}</button>
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

        <template v-else>
          <header>
            <i class="sprite sprite-encounter" :class="spriteKind(enc.kind)" aria-hidden="true" />
            <div class="titles">
              <span class="kind">{{ kindTitle(enc.kind) }}</span>
            </div>
          </header>
          <p class="label">{{ enc.label }}</p>

          <template v-if="enc.kind === 'blackMerchant'">
            <p>花金币买工坊货：{{ enc.buyGold }} 金 → {{ formatNeedMap(enc.buyOffers) }}</p>
            <p v-if="enc.completed" class="ready">这笔买卖已成交</p>
            <div class="row">
              <button
                type="button"
                :disabled="enc.completed || !canBuyMerchant(game.save, i)"
                @click="game.buyMerchant(i)"
              >
                {{ enc.completed ? '成交' : '金币购买' }}
              </button>
            </div>
            <p v-if="!enc.completed && buyWhy(i)" class="hint">{{ buyWhy(i) }}</p>
          </template>

          <template v-else-if="enc.kind === 'passerby'">
            <p>工坊换货：交出 {{ formatNeedMap(enc.wants) }}</p>
            <p>换得 {{ formatNeedMap(enc.offers) }}</p>
            <ul>
              <li v-for="line in wantLines(enc)" :key="line.itemId" :class="{ short: line.missing > 0 }">
                {{ line.label }} <strong>{{ line.have }}</strong> / {{ line.need }}
                <span v-if="line.missing > 0"> · 差 {{ line.missing }}</span>
              </li>
            </ul>
            <p v-if="enc.completed" class="ready">这笔买卖已成交</p>
            <div class="row">
              <button type="button" :disabled="enc.completed || !canBarter(game.save, i)" @click="game.barter(i)">
                {{ enc.completed ? '成交' : '以物易物' }}
              </button>
            </div>
            <p v-if="!enc.completed && barterWhy(i)" class="hint">{{ barterWhy(i) }}</p>
          </template>

          <template v-else-if="enc.kind === 'pawn'">
            <p>工坊典当：{{ formatNeedMap(enc.pawnWants) }} → {{ pawnGold(enc) }} 金</p>
            <ul>
              <li v-for="line in pawnLines(enc)" :key="line.itemId" :class="{ short: line.missing > 0 }">
                {{ line.label }} <strong>{{ line.have }}</strong> / {{ line.need }}
                <span> · 报价 {{ line.gold }} 金</span>
                <span v-if="line.missing > 0"> · 差 {{ line.missing }}</span>
              </li>
            </ul>
            <p v-if="enc.completed" class="ready">这笔买卖已成交</p>
            <div class="row">
              <button type="button" :disabled="enc.completed || !canPawn(game.save, i)" @click="game.pawn(i)">
                {{ enc.completed ? '成交' : '以物换钱' }}
              </button>
            </div>
            <p v-if="!enc.completed && pawnWhy(i)" class="hint">{{ pawnWhy(i) }}</p>
          </template>

          <template v-else-if="enc.kind === 'artisan'">
            <p>交成品：{{ formatNeedMap(enc.wants) }}</p>
            <p>工坊回礼：{{ enc.rewardGold }} 金 + 产量 +{{ Math.round((enc.buffMul - 1) * 100) }}% · {{ formatMarchClock(enc.buffDurationS) }}</p>
            <ul>
              <li v-for="line in wantLines(enc)" :key="line.itemId" :class="{ short: line.missing > 0 }">
                {{ line.label }} <strong>{{ line.have }}</strong> / {{ line.need }}
                <span v-if="line.missing > 0"> · 差 {{ line.missing }}</span>
              </li>
            </ul>
            <p v-if="enc.completed" class="ready">委托已完成</p>
            <div class="row">
              <button
                type="button"
                :disabled="enc.completed || !canSubmitArtisan(game.save, i)"
                @click="game.submitArtisan(i)"
              >
                {{ enc.completed ? '完成' : '交付成品' }}
              </button>
            </div>
            <p v-if="!enc.completed && artisanWhy(i)" class="hint">{{ artisanWhy(i) }}</p>
          </template>

          <template v-else-if="enc.kind === 'bulkBuy'">
            <p>高价收成品：交出 {{ formatNeedMap(enc.wants) }} → {{ enc.rewardGold }} 金</p>
            <ul>
              <li v-for="line in wantLines(enc)" :key="line.itemId" :class="{ short: line.missing > 0 }">
                {{ line.label }} <strong>{{ line.have }}</strong> / {{ line.need }}
                <span v-if="line.missing > 0"> · 差 {{ line.missing }}</span>
              </li>
            </ul>
            <p v-if="enc.completed" class="ready">这笔收购已成交</p>
            <div class="row">
              <button type="button" :disabled="enc.completed || !canBulkBuy(game.save, i)" @click="game.sellBulk(i)">
                {{ enc.completed ? '成交' : '高价出售' }}
              </button>
            </div>
            <p v-if="!enc.completed && bulkWhy(i)" class="hint">{{ bulkWhy(i) }}</p>
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
.label,
.buff {
  margin: 0;
  line-height: 1.5;
}

.label {
  font-family: var(--font-mono);
  color: var(--copper);
}

.buff {
  color: var(--moss-deep);
  font-weight: 700;
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
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  overflow: hidden;
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

.qmark {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 1;
  min-width: 22px;
  padding: 1px 7px;
  border: 2px solid currentColor;
  border-radius: 999px;
  background: var(--plate);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-align: center;
}

.card.q-gray {
  border-color: #9a8f7a;
}

.card.q-gray .qmark {
  color: #7a715f;
}

.card.q-green {
  border-color: #3e9a2a;
}

.card.q-green .qmark {
  color: #2f7a20;
  background: #e7f8d8;
}

.card.q-blue {
  border-color: #3a7ad9;
}

.card.q-blue .qmark {
  color: #1f56b0;
  background: #dcebff;
}

.card.q-purple {
  border-color: #8a4ecf;
}

.card.q-purple .qmark {
  color: #6b2fb0;
  background: #f0e2ff;
}

.card.q-orange {
  border-color: #e67a12;
}

.card.q-orange .qmark {
  color: #b85a08;
  background: #ffe7c8;
}

.card.done {
  background: linear-gradient(#efe6c8, #e4d3a4);
  box-shadow: 0 3px 0 #c4a24a, inset 0 0 0 2px #fff4d0;
}

.card.done.q-green {
  background: linear-gradient(#e8f3d4, #d7e6b4);
}

.card.done.q-blue {
  background: linear-gradient(#dce8f8, #c5d6ee);
}

.card.done.q-purple {
  background: linear-gradient(#eadcf6, #d8c4ea);
}

.card.done.q-orange {
  background: linear-gradient(#f8e4c4, #efd09a);
}

.stamp {
  position: absolute;
  top: 42%;
  right: 18px;
  z-index: 2;
  padding: 6px 14px;
  border: 3px solid #c0392b;
  border-radius: 8px;
  color: #c0392b;
  background: rgba(255, 248, 238, 0.72);
  font-family: var(--font-display);
  font-size: 22px;
  font-style: normal;
  font-weight: 700;
  letter-spacing: 0.28em;
  pointer-events: none;
  transform: rotate(-18deg);
  box-shadow: inset 0 0 0 2px rgba(192, 57, 43, 0.35);
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
