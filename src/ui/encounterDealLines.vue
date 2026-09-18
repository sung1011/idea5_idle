<script setup lang="ts">
import { computed } from 'vue'
import { itemQty } from '../sim/bank'
import { itemProducerStation } from '../sim/tables'
import type { Encounter } from '../sim/types'
import { openItemWorkshop } from './appNav'
import {
  encounterDeal,
  formatConsumeToken,
  formatDealToken,
  isConsumeShort,
  type DealToken,
} from './encounterDeal'
import { useGameStore } from './gameStore'

const props = defineProps<{
  encounter: Encounter
}>()

const game = useGameStore()
const deal = computed(() => encounterDeal(props.encounter))

function tokenHave(token: DealToken) {
  return token.kind === 'item' ? itemQty(game.save, token.itemId) : 0
}

function consumeText(token: DealToken) {
  return formatConsumeToken(token, tokenHave(token))
}

function consumeShort(token: DealToken) {
  return isConsumeShort(token, tokenHave(token))
}

function canJump(token: DealToken) {
  return token.kind === 'item' && itemProducerStation(token.itemId) != null
}

function jump(token: DealToken) {
  if (token.kind !== 'item') return
  openItemWorkshop(token.itemId)
}
</script>

<template>
  <p v-if="deal.consume.length" class="deal">
    <span class="k">消耗：</span>
    <template v-for="(token, i) in deal.consume" :key="`c-${token.kind}-${i}`">
      <span v-if="i" class="sep">、</span>
      <button
        v-if="canJump(token)"
        type="button"
        class="item-jump"
        :class="{ short: consumeShort(token) }"
        :aria-label="`前往生产${formatDealToken(token)}的工坊`"
        @click="jump(token)"
      >
        {{ consumeText(token) }}
      </button>
      <span v-else :class="{ short: consumeShort(token) }">{{ consumeText(token) }}</span>
    </template>
  </p>
  <p v-if="deal.gain.length" class="deal">
    <span class="k">获得：</span>
    <template v-for="(token, i) in deal.gain" :key="`g-${token.kind}-${i}`">
      <span v-if="i" class="sep">、</span>
      <button
        v-if="canJump(token)"
        type="button"
        class="item-jump"
        :aria-label="`前往生产${formatDealToken(token)}的工坊`"
        @click="jump(token)"
      >
        {{ formatDealToken(token) }}
      </button>
      <span v-else>{{ formatDealToken(token) }}</span>
    </template>
  </p>
</template>

<style scoped>
.deal {
  margin: 0;
  line-height: 1.55;
  font-family: var(--font-mono);
}

.k {
  color: var(--copper);
}

.item-jump {
  display: inline;
  padding: 0;
  min-height: 0;
  min-width: 0;
  border: none;
  border-radius: 0;
  background: none;
  box-shadow: none;
  color: var(--moss-deep);
  font: inherit;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.item-jump:hover:not(:disabled) {
  filter: none;
  color: var(--moss);
}

.item-jump:active:not(:disabled) {
  transform: none;
  box-shadow: none;
}

.short {
  color: var(--muted);
}

.item-jump.short {
  color: var(--muted);
}

.item-jump.short:hover:not(:disabled) {
  color: var(--copper);
}
</style>
