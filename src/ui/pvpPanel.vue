<script setup lang="ts">
import { computed, ref } from 'vue'
import ModeHelpSheet from './modeHelpSheet.vue'
import { modeHelpOf } from './modeHelp'
import TreasureArmoryPanel from './treasureArmoryPanel.vue'
import TreasureBannerPanel from './treasureBannerPanel.vue'
import TreasureMinePanel from './treasureMinePanel.vue'

const PVP_TABS = [
  { id: 'treasure', label: '夺宝' },
  { id: 'armory', label: '军械铺' },
  { id: 'banner', label: '战旗' },
] as const

type PvpTabId = (typeof PVP_TABS)[number]['id']

const tab = ref<PvpTabId>('treasure')
const helpOpen = ref(false)
const treasureHelp = modeHelpOf('treasure')
const armoryHelp = modeHelpOf('armory')
const bannerHelp = modeHelpOf('banner')
const help = computed(() => {
  if (tab.value === 'armory') return armoryHelp
  if (tab.value === 'banner') return bannerHelp
  return treasureHelp
})
</script>

<template>
  <section class="panel">
    <h2 class="title">PVP</h2>
    <div class="board-nav">
      <nav class="sub" role="tablist" aria-label="PVP分页">
        <button
          v-for="item in PVP_TABS"
          :key="item.id"
          type="button"
          role="tab"
          :aria-selected="tab === item.id"
          :class="{ on: tab === item.id }"
          @click="tab = item.id"
        >
          {{ item.label }}
        </button>
      </nav>
      <button type="button" class="mode-help" aria-label="玩法说明" @click="helpOpen = true">？</button>
    </div>
    <TreasureMinePanel v-if="tab === 'treasure'" />
    <TreasureArmoryPanel v-else-if="tab === 'armory'" />
    <TreasureBannerPanel v-else />
    <ModeHelpSheet v-if="helpOpen" :title="help.title" :rows="help.rows" @close="helpOpen = false" />
  </section>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 12px 10px;
}

.title {
  margin: 0;
  font-size: 20px;
}

.board-nav {
  display: flex;
  align-items: stretch;
  flex-wrap: nowrap;
  gap: 8px;
}

.board-nav .sub {
  flex: 1 1 0;
  min-width: 0;
}

.sub {
  display: flex;
  align-items: stretch;
  gap: 2px;
  padding: 3px;
  border: 2px solid var(--gold);
  border-radius: var(--radius-pill);
  background: linear-gradient(180deg, #fffef8 0%, #fff3d4 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.sub button {
  flex: 1 1 0;
  min-height: 32px;
  padding: 4px 10px;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  box-shadow: none;
  color: var(--muted);
  font-family: var(--font-display);
  font-size: 14px;
  letter-spacing: 0.08em;
  opacity: 1;
  filter: none;
}

.sub button.on,
.sub button.on:hover:not(:disabled) {
  color: var(--ink);
  background: linear-gradient(#ffe27a, #f0b83a);
  box-shadow: 0 2px 6px rgba(212, 160, 23, 0.32);
  opacity: 1;
  filter: none;
}

.mode-help {
  flex: 0 0 32px;
  align-self: center;
  width: 32px;
  min-width: 32px;
  height: 32px;
  min-height: 32px;
  padding: 0;
  border-radius: 50%;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0;
}
</style>
