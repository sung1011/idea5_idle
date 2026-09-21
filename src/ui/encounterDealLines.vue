<script setup lang="ts">
import { computed } from 'vue'
import { needHaveQty } from '../sim/costs'
import type { Encounter } from '../sim/types'
import ConsumeJumpItem from './consumeJumpItem.vue'
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
const now = computed(() => {
  void game.save.elapsedS
  return Date.now()
})
const deal = computed(() => encounterDeal(props.encounter, game.save, now.value))

function tokenHave(token: DealToken) {
  return token.kind === 'item' ? needHaveQty(game.save, token.itemId) : 0
}

function consumeText(token: DealToken) {
  return formatConsumeToken(token, tokenHave(token))
}

function consumeShort(token: DealToken) {
  return isConsumeShort(token, tokenHave(token))
}
</script>

<template>
  <p v-if="deal.consume.length" class="deal">
    <span class="k">消耗：</span>
    <template v-for="(token, i) in deal.consume" :key="`c-${token.kind}-${i}`">
      <span v-if="i" class="sep">、</span>
      <ConsumeJumpItem
        v-if="token.kind === 'item'"
        :item-id="token.itemId"
        :text="consumeText(token)"
        :short="consumeShort(token)"
      />
      <span v-else>{{ consumeText(token) }}</span>
    </template>
  </p>
  <p v-if="deal.gain.length" class="deal">
    <span class="k">获得：</span>
    <template v-for="(token, i) in deal.gain" :key="`g-${token.kind}-${i}`">
      <span v-if="i" class="sep">、</span>
      <ConsumeJumpItem
        v-if="token.kind === 'item'"
        :item-id="token.itemId"
        :text="formatDealToken(token)"
      />
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
</style>
