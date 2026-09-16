<script setup lang="ts">
import { computed } from 'vue'
import {
  canDepart,
  canSubmitOrder,
  currentOrder,
  departBlockReason,
  orderLines,
  submitBlockReason,
} from '../sim/orders'
import { useGameStore } from './gameStore'

const game = useGameStore()
const order = computed(() => currentOrder(game.save))
const lines = computed(() => orderLines(game.save))
const submitWhy = computed(() => submitBlockReason(game.save))
const departWhy = computed(() => departBlockReason(game.save))
const readyToSubmit = computed(() => canSubmitOrder(game.save))
const readyToDepart = computed(() => canDepart(game.save))
</script>

<template>
  <section class="panel order">
    <p>出发订单</p>
    <p class="label">{{ order.label }} · 补给金 {{ order.departGold }}</p>
    <ul>
      <li v-for="line in lines" :key="line.itemId" :class="{ short: line.missing > 0 }">
        {{ line.label }} <strong>{{ line.have }}</strong> / {{ line.need }}
        <span v-if="line.missing > 0"> · 差 {{ line.missing }}</span>
      </li>
    </ul>
    <p v-if="game.save.orderSubmitted" class="ready">订单已提交，可以出发</p>
    <p v-else-if="submitWhy" class="short">{{ submitWhy }}</p>
    <div class="row">
      <button type="button" :disabled="!readyToSubmit" @click="game.submitOrder()">提交订单</button>
      <button type="button" :disabled="!readyToDepart" @click="game.depart()">出发</button>
    </div>
    <p v-if="!readyToDepart && !game.save.orderSubmitted" class="hint">{{ departWhy }}</p>
    <p v-if="game.save.departCount > 0" class="hint">
      已出发 {{ game.save.departCount }} 次（战斗稍后）
    </p>
    <p class="hint">武器、熟食等交给订单才能出发。真战斗后做。</p>
  </section>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
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
