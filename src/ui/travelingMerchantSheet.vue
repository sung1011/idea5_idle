<script setup lang="ts">
import { computed } from 'vue'
import { bankQty } from '../sim/bank'
import { ITEM_DEF } from '../sim/tables'
import type { ItemId } from '../sim/types'
import { travelingMerchantGaps, travelingMerchantLine } from '../sim/travelingMerchant'
import { MERCHANT_FACE } from './merchantFace'
import { useGameStore } from './gameStore'

const emit = defineEmits<{ close: [] }>()
const game = useGameStore()

const order = computed(() => game.save.travelingMerchant.order)
const line = computed(() => travelingMerchantLine(game.save))
const gaps = computed(() => travelingMerchantGaps(game.save))
const gapText = computed(() => gaps.value.map((gap) => `${ITEM_DEF[gap.itemId].label}×${gap.short}`).join('、'))
const canDeliver = computed(() => !!order.value && gaps.value.length === 0)
const buttonLabel = computed(() => (canDeliver.value ? '交付' : `还差 ${gapText.value}`))

function haveOf(itemId: ItemId): number {
  return bankQty(game.save, itemId)
}

function shortOf(itemId: ItemId, qty: number): number {
  return Math.max(0, qty - haveOf(itemId))
}

function onDeliver() {
  if (!canDeliver.value) return
  game.deliverTravelingMerchant()
  emit('close')
}
</script>

<template>
  <div v-if="order" class="mask" role="dialog" aria-modal="true" aria-label="限时商人">
    <button type="button" class="close" aria-label="关闭" @click="emit('close')">×</button>
    <header class="merchant">
      <span class="portrait" :style="{ background: MERCHANT_FACE.tone }" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path v-for="(d, index) in MERCHANT_FACE.paths" :key="`p-${index}`" :d="d" fill="#fff8ee" />
          <path v-for="(d, index) in MERCHANT_FACE.marks" :key="`m-${index}`" :d="d" :fill="MERCHANT_FACE.tone" />
        </svg>
      </span>
      <p class="speech">{{ line }}</p>
    </header>
    <article class="order">
      <h2>收购</h2>
      <ul>
        <li v-for="row in order.lines" :key="row.itemId">
          <b>{{ ITEM_DEF[row.itemId].label }} ×{{ row.qty }}</b>
          <small v-if="shortOf(row.itemId, row.qty) > 0">还差 {{ shortOf(row.itemId, row.qty) }}</small>
          <small v-else>已备齐</small>
        </li>
      </ul>
    </article>
    <footer>
      <p class="reward">钻石 ×{{ order.diamonds }}</p>
      <button type="button" class="deliver" :disabled="!canDeliver" @click="onDeliver">
        {{ buttonLabel }}
      </button>
    </footer>
  </div>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: calc(18px + env(safe-area-inset-top)) 16px calc(20px + env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at 50% 0, rgba(255, 236, 196, 0.35), transparent 42%),
    linear-gradient(180deg, #3a2414 0%, #24160c 40%, #1a1208 100%);
  color: #fff6e0;
}

.close {
  position: absolute;
  top: calc(10px + env(safe-area-inset-top));
  right: 12px;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: #8a3a2a;
  color: #fff8ee;
  font-size: 22px;
  font-weight: 800;
  line-height: 1;
}

.merchant {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 28px;
}

.portrait {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 92px;
  height: 92px;
  border: 4px solid #f4ead2;
  border-radius: 50%;
  box-shadow:
    0 0 0 3px #5c3a1e,
    inset 0 0 0 2px rgba(255, 248, 230, 0.55);
}

.portrait svg {
  width: 64px;
  height: 64px;
}

.speech {
  margin: 0;
  padding: 12px 14px;
  border-radius: 14px 14px 14px 4px;
  background: #f6efe2;
  color: #3a2414;
  font-size: 15px;
  font-weight: 800;
  line-height: 1.45;
}

.order {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 14px;
  border: 3px solid #5c3a1e;
  border-radius: 16px;
  background: #f3e2c0;
  color: #3a2414;
}

.order h2 {
  margin: 0;
  font-size: 16px;
}

.order ul {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.order li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(255, 248, 230, 0.72);
}

.order small {
  color: #8a3a2a;
  font-weight: 800;
}

footer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: auto;
}

.reward {
  margin: 0;
  text-align: center;
  font-size: 18px;
  font-weight: 900;
}

.deliver {
  min-height: 48px;
  border: none;
  border-radius: 12px;
  background: #1f7a4a;
  color: #fff8ee;
  font-size: 16px;
  font-weight: 900;
}

.deliver:disabled {
  background: #8a837a;
  color: #fff6e0;
}
</style>
