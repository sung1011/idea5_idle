<script setup lang="ts">
import { playerAvatarId, type PlayerAvatarId } from '../sim/createSave'
import { playerAvatarFace } from './playerAvatar'

const props = defineProps<{
  id?: string | null
}>()

function faceOf(id: string | null | undefined) {
  return playerAvatarFace(playerAvatarId(id) as PlayerAvatarId)
}
</script>

<template>
  <span class="face" :style="{ background: faceOf(props.id).tone }" aria-hidden="true">
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
  width: 28px;
  height: 28px;
  border: 2px solid var(--gold-deep);
  border-radius: 50%;
  overflow: hidden;
}

svg {
  width: 20px;
  height: 20px;
  display: block;
}
</style>
