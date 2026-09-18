<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { guideQuestFlashId } from '../sim/guideQuest'
import { appTab, workshopTab } from './appNav'
import { useGameStore } from './gameStore'
import { holeFromClient, type SpotlightHole } from './guideQuestSpotlight'
import { techTab } from './techTabs'

const MASK_ID = 'guideQuestSpotMask'
const game = useGameStore()
const root = ref<HTMLElement | null>(null)
const holes = ref<SpotlightHole[]>([])
const shellSize = ref({ w: 0, h: 0 })
const flashId = computed(() => guideQuestFlashId(game.save))

function overflowClips(el: Element, shell: Element): DOMRect[] {
  const clips: DOMRect[] = []
  let node: Element | null = el.parentElement
  while (node && node !== shell) {
    const style = getComputedStyle(node)
    if (/(auto|scroll|hidden|clip)/.test(`${style.overflow}${style.overflowX}${style.overflowY}`)) {
      clips.push(node.getBoundingClientRect())
    }
    node = node.parentElement
  }
  return clips
}

function measure() {
  const shell = root.value?.parentElement
  if (!shell || !flashId.value) {
    holes.value = []
    return
  }
  const shellBox = shell.getBoundingClientRect()
  shellSize.value = { w: shellBox.width, h: shellBox.height }
  const next: SpotlightHole[] = []
  for (const el of shell.querySelectorAll('.guide-flash')) {
    if (!(el instanceof HTMLElement)) continue
    const style = getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue
    const hole = holeFromClient(el.getBoundingClientRect(), shellBox, overflowClips(el, shell))
    if (hole) next.push(hole)
  }
  holes.value = next
}

let ro: ResizeObserver | null = null
let mo: MutationObserver | null = null

onMounted(() => {
  const shell = root.value?.parentElement
  const page = shell?.querySelector('.page')
  if (shell && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => measure())
    ro.observe(shell)
  }
  if (page && typeof MutationObserver !== 'undefined') {
    mo = new MutationObserver(() => measure())
    mo.observe(page, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    })
  }
  window.addEventListener('resize', measure)
  window.addEventListener('scroll', measure, true)
  measure()
})

onUnmounted(() => {
  ro?.disconnect()
  mo?.disconnect()
  window.removeEventListener('resize', measure)
  window.removeEventListener('scroll', measure, true)
})

watch([flashId, appTab, workshopTab, techTab], async () => {
  await nextTick()
  measure()
})
</script>

<template>
  <div ref="root" class="spot" aria-hidden="true">
    <svg
      v-if="holes.length && shellSize.w && shellSize.h"
      class="dim"
      :viewBox="`0 0 ${shellSize.w} ${shellSize.h}`"
      preserveAspectRatio="none"
    >
      <defs>
        <mask :id="MASK_ID" maskUnits="userSpaceOnUse">
          <rect :width="shellSize.w" :height="shellSize.h" fill="#fff" />
          <rect
            v-for="(h, i) in holes"
            :key="`m${i}`"
            :x="h.x"
            :y="h.y"
            :width="h.w"
            :height="h.h"
            :rx="h.r"
            fill="#000"
          />
        </mask>
      </defs>
      <rect
        :width="shellSize.w"
        :height="shellSize.h"
        fill="rgba(15, 10, 21, 0.73)"
        :mask="`url(#${MASK_ID})`"
      />
    </svg>
    <i
      v-for="(h, i) in holes"
      :key="`r${i}`"
      class="ring"
      :style="{
        left: `${h.x}px`,
        top: `${h.y}px`,
        width: `${h.w}px`,
        height: `${h.h}px`,
        borderRadius: `${h.r}px`,
      }"
    />
  </div>
</template>

<style scoped>
.spot {
  position: absolute;
  inset: 0;
  z-index: var(--z-guide-spot);
  pointer-events: none;
}

.dim {
  display: block;
  width: 100%;
  height: 100%;
}

.ring {
  position: absolute;
  box-sizing: border-box;
  border: 3px solid #e5fbff;
  box-shadow:
    0 0 0 2px rgba(80, 39, 69, 0.55),
    0 0 16px rgba(223, 252, 255, 0.95),
    inset 0 0 15px rgba(213, 251, 255, 0.32);
}
</style>
