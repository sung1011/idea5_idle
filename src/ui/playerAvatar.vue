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
  border: none;
  border-radius: 50%;
  box-shadow: none;
}

.face::before {
  content: '';
  position: absolute;
  inset: -8px -7px;
  z-index: 2;
  pointer-events: none;
  background: var(--tex-avatar) center / contain no-repeat;
}

.face.frame-copper {
  box-shadow: 0 0 0 2px #b87333, 0 0 6px rgba(184, 115, 51, 0.9);
}

.face.frame-silver {
  box-shadow: 0 0 0 2px #e4e8ee, 0 0 6px rgba(210, 216, 224, 0.95);
}

.face.frame-gold {
  box-shadow: 0 0 0 2px #ffe27a, 0 0 8px rgba(232, 195, 90, 0.95);
}

svg {
  width: 23px;
  height: 23px;
  display: block;
}
</style>
