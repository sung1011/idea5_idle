<script setup lang="ts">
import { playerAvatarId, type PlayerAvatarId } from '../sim/createSave'
import type { BannerFrame } from '../sim/treasureMine'
import { playerAvatarFace } from './playerAvatar'

const props = defineProps<{
  id?: string | null
  frame?: BannerFrame | null
}>()

function faceOf(id: string | null | undefined) {
  return playerAvatarFace(playerAvatarId(id) as PlayerAvatarId)
}
</script>

<template>
  <span
    class="face"
    :class="props.frame && props.frame !== 'none' ? `frame-${props.frame}` : undefined"
    :style="{ background: faceOf(props.id).tone }"
    aria-hidden="true"
  >
    <svg viewBox="0 0 24 24">
      <path v-for="(d, index) in faceOf(props.id).paths" :key="`p-${index}`" :d="d" fill="#fff8ee" />
      <path v-for="(d, index) in faceOf(props.id).marks" :key="`m-${index}`" :d="d" :fill="faceOf(props.id).tone" />
    </svg>
  </span>
</template>

<style scoped>
.face {
  position: relative;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  border: 3px solid #f4ead2;
  border-radius: 50%;
  box-shadow:
    0 0 0 2px #4a3422,
    inset 0 0 0 2px rgba(255, 255, 255, 0.7);
}

.face::after {
  content: '';
  position: absolute;
  inset: -5px;
  border-radius: 50%;
  pointer-events: none;
  background:
    radial-gradient(circle at 50% 0, #f7f1e4 0 3px, #4a3422 3.2px 4.2px, transparent 4.6px),
    radial-gradient(circle at 50% 100%, #f7f1e4 0 3px, #4a3422 3.2px 4.2px, transparent 4.6px),
    radial-gradient(circle at 0 50%, #f7f1e4 0 3px, #4a3422 3.2px 4.2px, transparent 4.6px),
    radial-gradient(circle at 100% 50%, #f7f1e4 0 3px, #4a3422 3.2px 4.2px, transparent 4.6px);
}

.face.frame-copper {
  border-color: #b87333;
  box-shadow: 0 0 0 2px #4a3422, 0 0 6px rgba(184, 115, 51, 0.9);
}

.face.frame-silver {
  border-color: #e4e8ee;
  box-shadow: 0 0 0 2px #4a3422, 0 0 6px rgba(210, 216, 224, 0.95);
}

.face.frame-gold {
  border-color: #ffe27a;
  box-shadow: 0 0 0 2px #4a3422, 0 0 8px rgba(232, 195, 90, 0.95);
}

svg {
  width: 23px;
  height: 23px;
  display: block;
}
</style>
