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
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  border: 2px solid var(--gold-deep);
  border-radius: 50%;
  overflow: hidden;
}

.face.frame-copper {
  border-color: #b87333;
  box-shadow: 0 0 0 1px #6b3a16, 0 0 6px rgba(184, 115, 51, 0.9);
}

.face.frame-silver {
  border-color: #e4e8ee;
  box-shadow: 0 0 0 1px #6e7886, 0 0 6px rgba(210, 216, 224, 0.95);
}

.face.frame-gold {
  border-color: #ffe27a;
  box-shadow: 0 0 0 1px #a97812, 0 0 8px rgba(232, 195, 90, 0.95);
}

svg {
  width: 23px;
  height: 23px;
  display: block;
}
</style>
