<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  RANK_LIST_MAX_HEIGHT,
  RANK_ROW_GAP,
  RANK_ROW_MIN_HEIGHT,
  rankSelfNeedsPin,
} from './rankBoardPin'
import PlayerAvatar from './playerAvatar.vue'

export type RankBoardRow = {
  id: string
  name: string
  avatarId: string
  rank: number
  score: number
  self: boolean
}

const props = defineProps<{
  rows: RankBoardRow[]
  label: string
}>()

const listEl = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const viewHeight = ref(RANK_LIST_MAX_HEIGHT)
const selfRow = computed(() => props.rows.find((row) => row.self) ?? null)
const pinned = computed(() => {
  if (!selfRow.value) return false
  return rankSelfNeedsPin({
    selfIndex: props.rows.findIndex((row) => row.self),
    rowCount: props.rows.length,
    scrollTop: scrollTop.value,
    viewHeight: viewHeight.value,
    rowHeight: RANK_ROW_MIN_HEIGHT,
    rowGap: RANK_ROW_GAP,
  })
})

function syncBox(el: HTMLElement) {
  scrollTop.value = el.scrollTop
  viewHeight.value = el.clientHeight || RANK_LIST_MAX_HEIGHT
}

function onScroll(event: Event) {
  const el = event.currentTarget
  if (el instanceof HTMLElement) syncBox(el)
}

let observer: ResizeObserver | null = null
onMounted(() => {
  if (!listEl.value) return
  syncBox(listEl.value)
  if (typeof ResizeObserver === 'undefined') return
  observer = new ResizeObserver(() => {
    if (listEl.value) syncBox(listEl.value)
  })
  observer.observe(listEl.value)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div class="rank-board">
    <ol ref="listEl" class="rank-list" :aria-label="label" @scroll="onScroll">
      <li v-for="row in rows" :key="row.id" class="rank-row" :class="{ self: row.self }">
        <PlayerAvatar :id="row.avatarId" />
        <span class="who">{{ row.rank }}. {{ row.name }}</span>
        <b class="score">{{ row.score }}</b>
      </li>
    </ol>
    <div v-if="pinned && selfRow" class="rank-pin rank-row self" aria-label="我的名次">
      <PlayerAvatar :id="selfRow.avatarId" />
      <span class="who">{{ selfRow.rank }}. {{ selfRow.name }}</span>
      <b class="score">{{ selfRow.score }}</b>
    </div>
  </div>
</template>

<style scoped>
.rank-board {
  width: 100%;
  min-width: 0;
}

.rank-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 220px;
  margin: 0;
  padding: 0;
  overflow: auto;
  min-width: 0;
  list-style: none;
}

.rank-row {
  display: flex;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
  min-width: 0;
  min-height: 36px;
  padding: 2px 6px;
  border-left: 3px solid transparent;
  border-radius: 8px;
  background: rgba(246, 226, 188, 0.82);
  font-weight: 400;
}

.rank-row.self {
  background: #f6d59a;
  border-left-color: #e07a12;
}

.rank-pin {
  margin-top: 4px;
}

.who {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.score {
  flex: 0 0 auto;
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}
</style>
