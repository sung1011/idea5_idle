<script setup lang="ts">
import { computed } from 'vue'
import { isStationUnlocked } from '../sim/stationUnlock'
import { ITEM_DEF, itemProducerStation } from '../sim/tables'
import type { ItemId } from '../sim/types'
import { openItemWorkshop } from './appNav'
import { pushFloatTip } from './floatTips'
import { useGameStore } from './gameStore'
import { beginItemSourceFlash, itemSourceHint, itemSourceTip } from './itemSource'

const props = defineProps<{
  itemId: ItemId
  text: string
  short?: boolean
}>()

const game = useGameStore()
const canJump = computed(() => itemProducerStation(props.itemId) != null)
const ariaLabel = computed(() => `前往生产${ITEM_DEF[props.itemId].label}的工坊`)

function jump() {
  const hint = itemSourceHint(props.itemId)
  openItemWorkshop(props.itemId)
  if (!hint) return
  if (!isStationUnlocked(game.save, hint.stationId)) {
    pushFloatTip(itemSourceTip(props.itemId, hint))
    return
  }
  beginItemSourceFlash(props.itemId, game.save)
}
</script>

<template>
  <button
    v-if="canJump"
    type="button"
    class="item-jump"
    :class="{ short, 'short-flash': short }"
    :aria-label="ariaLabel"
    @click="jump"
  >
    {{ text }}
  </button>
  <span v-else :class="{ short, 'short-flash': short }">{{ text }}</span>
</template>

<style scoped>
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
