<script setup lang="ts">
import { computed } from 'vue'
import { itemQty } from '../sim/bank'
import { ITEM_DEF, SELLABLE_GOODS, SUPPLY_ROWS } from '../sim/tables'
import type { ItemId } from '../sim/types'
import { useGameStore } from './gameStore'

const game = useGameStore()
const canSellGoods = computed(() => SELLABLE_GOODS.some((id) => itemQty(game.save, id) > 0))

function qty(id: ItemId): number {
  return itemQty(game.save, id)
}
</script>

<template>
  <section class="panel supplies">
    <header class="head">
      <p>物资</p>
      <button type="button" :disabled="!canSellGoods" @click="game.sellGoods()">卖货（兵器/熟食 → 金）</button>
    </header>
    <div v-for="(row, i) in SUPPLY_ROWS" :key="i" class="grid">
      <article v-for="id in row" :key="id" class="item">
        <span>{{ ITEM_DEF[id].label }}</span>
        <strong>{{ qty(id) }}</strong>
        <button type="button" :disabled="qty(id) === 0" @click="game.sell(id)">卖 1</button>
      </article>
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

.head,
.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.head {
  align-items: center;
  justify-content: space-between;
}

.panel p {
  margin: 0;
  line-height: 1.5;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
}

.item {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
  padding: 8px 10px;
}

.item strong {
  font-family: var(--font-mono);
}
</style>
