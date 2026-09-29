<script setup lang="ts">
import { computed } from 'vue'
import { workerQualityFrameStyle } from './workerQuality'
import {
  workerAvatarBorderPx,
  workerAvatarPx,
  workerAvatarRace,
  workerRaceAvatarUrl,
  type WorkerAvatarSize,
} from './workerAvatar'

const props = withDefaults(
  defineProps<{
    race?: unknown
    workerId?: string | null
    quality?: unknown
    size?: WorkerAvatarSize
    showNew?: boolean
  }>(),
  {
    size: 'sm',
    showNew: false,
    workerId: null,
  },
)

const px = computed(() => workerAvatarPx(props.size))
const borderPx = computed(() => workerAvatarBorderPx(props.size))
const frame = computed(() => workerQualityFrameStyle(props.quality))
const src = computed(() => workerRaceAvatarUrl(workerAvatarRace(props.race, props.workerId)))
</script>

<template>
  <span class="worker-avatar" :class="props.size" :style="{ width: `${px}px`, height: `${px}px` }" aria-hidden="true">
    <span
      class="clip"
      :style="{
        background: frame.background,
        borderColor: frame.borderColor,
        borderWidth: `${borderPx}px`,
      }"
    >
      <img v-if="src" :src="src" alt="" draggable="false" />
    </span>
    <i v-if="props.showNew" class="worker-new" aria-label="新苦工">NEW</i>
  </span>
</template>

<style scoped>
.worker-avatar {
  position: relative;
  display: inline-block;
  flex: 0 0 auto;
  vertical-align: middle;
}

.clip {
  display: block;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-style: solid;
  border-radius: 50%;
  box-sizing: border-box;
}

img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
  user-select: none;
}

.worker-new {
  position: absolute;
  top: -5px;
  right: -7px;
  z-index: 2;
  padding: 0 3px;
  border: 1px solid #7a1808;
  border-radius: 3px;
  background: linear-gradient(#ff6a3d, #d62828);
  color: #fff8e8;
  font-size: 7px;
  font-style: normal;
  font-weight: 900;
  letter-spacing: 0.02em;
  line-height: 1.25;
  box-shadow: 0 1px 0 #7a1808;
  pointer-events: none;
}
</style>
