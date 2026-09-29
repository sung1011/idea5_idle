<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import {
  TREASURE_BANNER_MAX,
  bannerLevelOf,
  bannerNextRewards,
  bannerUpgradeCost,
  jadeShortTip,
  vaultQty,
} from '../sim/treasureMine'
import { useGameStore } from './gameStore'

const emit = defineEmits<{ close: [] }>()
const game = useGameStore()

function onKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape') emit('close')
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
})

function level(): number {
  return bannerLevelOf(game.save)
}

function jade(): number {
  return vaultQty(game.save, 'jade')
}

function cost(): number | null {
  return bannerUpgradeCost(level())
}

function full(): boolean {
  return level() >= TREASURE_BANNER_MAX
}

function short(): boolean {
  const need = cost()
  return need != null && jade() < need
}

function gap(): string {
  const need = cost()
  if (need == null) return ''
  return jadeShortTip(need, jade())
}

function rewards(): string[] {
  return bannerNextRewards(level())
}

function upgrade() {
  game.upgradeTreasureBanner()
}
</script>

<template>
  <div class="mask" @click.self="emit('close')">
    <section class="panel box" role="dialog" aria-modal="true" aria-label="战旗">
      <header>
        <h2 class="title">战旗</h2>
        <button type="button" class="close" @click="emit('close')">关闭</button>
      </header>
      <p class="jade">
        荣誉徽记
        <b>{{ jade() }}</b>
      </p>
      <article>
        <h3>战旗 Lv{{ level() }}</h3>
        <p v-if="full()" class="full">已满</p>
        <template v-else>
          <p class="next">下一级 Lv{{ level() + 1 }}</p>
          <ul>
            <li v-for="line in rewards()" :key="line">{{ line }}</li>
          </ul>
          <p class="fee">费用 {{ cost() }} 荣誉徽记</p>
          <button
            type="button"
            :class="{ 'is-short': short() }"
            :title="short() ? gap() : undefined"
            @click="upgrade"
          >升级 {{ cost() }} 荣誉徽记</button>
          <p v-if="short()" class="gap">{{ gap() }}</p>
        </template>
      </article>
    </section>
  </div>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: var(--z-sheet);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 72px 16px 24px;
  background: rgba(8, 28, 14, 0.58);
}

.box {
  width: min(440px, 100%);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 12px 10px;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

header .title {
  margin: 0;
  font-size: 20px;
}

.close {
  min-height: 32px;
  padding: 4px 10px;
}

.jade {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 0;
  font-size: 13px;
  font-weight: 700;
}

.jade b {
  font-family: var(--font-mono);
  font-size: 18px;
  color: var(--copper);
}

article {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 12px;
  border: 2px solid var(--gold-deep);
  border-radius: 12px;
  background: var(--slot);
}

h3,
p {
  margin: 0;
}

h3 {
  font-size: 18px;
}

.next,
.fee,
.full {
  font-size: 13px;
  font-weight: 700;
}

ul {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: var(--ink-soft, #6b4e2e);
}

article button {
  margin: 4px 0 0;
  padding: 4px 10px;
  font-size: 13px;
}

article button.is-short {
  cursor: default;
  color: var(--muted);
  background: var(--btn-on);
  box-shadow: none;
  opacity: 0.62;
  filter: grayscale(0.2);
}

.gap {
  font-size: 12px;
  color: var(--danger);
}
</style>
