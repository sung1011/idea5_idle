<script setup lang="ts">
import {
  TREASURE_ARMORY_RUNES,
  TREASURE_RUNE_COST,
  jewelShortTip,
  vaultQty,
  type TreasureArmoryRune,
} from '../sim/treasureMine'
import { RUNE_DEF } from '../sim/tables'
import { bankQty } from '../sim/bank'
import { useGameStore } from './gameStore'

const game = useGameStore()

function jewels(): number {
  return vaultQty(game.save, 'jewel')
}

function held(id: TreasureArmoryRune): number {
  return bankQty(game.save, id)
}

function short(id: TreasureArmoryRune): boolean {
  return TREASURE_ARMORY_RUNES.includes(id) && jewels() < TREASURE_RUNE_COST
}

function buy(id: TreasureArmoryRune) {
  game.buyTreasureRune(id)
}
</script>

<template>
  <section class="armory" aria-label="军械铺">
    <p class="jewels">
      珠宝
      <b>{{ jewels() }}</b>
    </p>
    <ul class="goods">
      <li v-for="id in TREASURE_ARMORY_RUNES" :key="id">
        <div class="copy">
          <strong>{{ RUNE_DEF[id].label }}</strong>
          <span>{{ RUNE_DEF[id].effect }}</span>
          <em>持有 {{ held(id) }}</em>
        </div>
        <button
          type="button"
          :class="{ 'is-short': short(id) }"
          :title="short(id) ? jewelShortTip(TREASURE_RUNE_COST, jewels()) : undefined"
          @click="buy(id)"
        >{{ TREASURE_RUNE_COST }} 珠宝</button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.armory {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.jewels {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 0;
  font-size: 13px;
  font-weight: 700;
}

.jewels b {
  font-family: var(--font-mono);
  font-size: 18px;
  color: var(--copper);
}

.goods {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.goods li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border: 2px solid var(--gold-deep);
  border-radius: 12px;
  background: var(--slot);
}

.copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.copy strong {
  font-size: 15px;
}

.copy span,
.copy em {
  font-style: normal;
  font-size: 12px;
  color: var(--ink-soft, #6b4e2e);
}

.goods button {
  flex: 0 0 auto;
  margin: 0;
  padding: 4px 10px;
  font-size: 13px;
}

.goods button.is-short {
  cursor: default;
  color: var(--muted);
  background: var(--btn-on);
  box-shadow: none;
  opacity: 0.62;
  filter: grayscale(0.2);
}
</style>
