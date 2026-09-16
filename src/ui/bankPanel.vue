<script setup lang="ts">
import { bankCap, bankFillPct, bankFillTone, bankQty } from '../sim/bank'
import { BANK_ROWS, ITEM_DEF } from '../sim/tables'
import type { ItemId } from '../sim/types'
import { useGameStore } from './gameStore'

const game = useGameStore()

function qty(id: ItemId): number {
  return bankQty(game.save, id)
}

function cap(id: ItemId): number {
  return bankCap(id)
}

function pct(id: ItemId): number {
  return bankFillPct(game.save, id)
}

function tone(id: ItemId): 'ok' | 'warn' | 'full' {
  return bankFillTone(game.save, id)
}
</script>

<template>
  <section class="panel bank">
    <p>银行</p>
    <div v-for="(row, i) in BANK_ROWS" :key="i" class="grid">
      <article v-for="id in row" :key="id" class="item" :class="tone(id)">
        <header>
          <span>{{ ITEM_DEF[id].label }}</span>
          <strong>{{ qty(id) }}/{{ cap(id) }}</strong>
        </header>
        <div class="bar" :aria-valuenow="pct(id)" :aria-valuemax="100">
          <i :style="{ width: pct(id) + '%' }" />
        </div>
        <p v-if="tone(id) === 'full'" class="mark">满仓</p>
        <p v-else-if="tone(id) === 'warn'" class="mark">快满</p>
        <button type="button" @click="game.sell(id)">卖 1</button>
      </article>
    </div>
    <div class="row">
      <button type="button" @click="game.sellGoods()">卖货（兵器/熟食 → 金）</button>
    </div>
  </section>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
}

.panel p {
  margin: 0;
  line-height: 1.5;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
}

.item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
}

header {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: baseline;
  font-family: var(--font-mono);
}

.mark {
  color: var(--danger);
  font-size: 12px;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
