<script setup lang="ts">
import { computed, ref } from 'vue'
import { travelingMerchantActive, travelingMerchantRemainS } from '../sim/travelingMerchant'
import { MERCHANT_FACE } from './merchantFace'
import TravelingMerchantSheet from './travelingMerchantSheet.vue'
import { useGameStore } from './gameStore'

const game = useGameStore()
const open = ref(false)

const active = computed(() => travelingMerchantActive(game.save))
const unseen = computed(() => active.value && game.save.travelingMerchant.unseen)
const remain = computed(() => travelingMerchantRemainS(game.save))
const clock = computed(() => formatActivityClock(remain.value))

function formatActivityClock(remainS: number): string {
  const safe = Math.max(0, Math.floor(remainS))
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  if (h > 0) return `${h}:${mm}:${ss}`
  return `${mm}:${ss}`
}

function onOpen() {
  if (!active.value) return
  game.markTravelingMerchantSeen()
  open.value = true
}
</script>

<template>
  <div class="activity-bar" aria-label="工坊活动">
    <button v-if="active" type="button" class="act" aria-label="限时商人" @click="onOpen">
      <span class="face" :style="{ background: MERCHANT_FACE.tone }">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path v-for="(d, index) in MERCHANT_FACE.paths" :key="`p-${index}`" :d="d" fill="#fff8ee" />
          <path v-for="(d, index) in MERCHANT_FACE.marks" :key="`m-${index}`" :d="d" :fill="MERCHANT_FACE.tone" />
        </svg>
        <i v-if="unseen" class="dot" />
      </span>
      <span class="clock">{{ clock }}</span>
    </button>
  </div>
  <TravelingMerchantSheet v-if="open && active" @close="open = false" />
</template>

<style scoped>
.activity-bar {
  display: flex;
  align-items: center;
  flex: 0 0 52px;
  height: 52px;
  min-height: 52px;
  max-height: 52px;
  padding: 0 4px;
  overflow: hidden;
}

.act {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  width: 48px;
  height: 48px;
  padding: 0;
  border: none;
  background: transparent;
  box-shadow: none;
}

.face {
  position: relative;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 2px solid #f4ead2;
  border-radius: 50%;
  box-shadow:
    0 0 0 2px #4a3422,
    inset 0 0 0 1px rgba(255, 255, 255, 0.65);
}

.face svg {
  width: 22px;
  height: 22px;
  display: block;
}

.dot {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--danger);
  box-shadow: 0 0 0 2px #f6efe2;
}

.clock {
  color: #fff6e0;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
  text-shadow: 0 1px 0 #1a1208;
}
</style>
