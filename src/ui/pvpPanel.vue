<script setup lang="ts">
import { computed, ref } from 'vue'
import ModeHelpSheet from './modeHelpSheet.vue'
import { modeHelpOf, type ModeHelpId } from './modeHelp'
import { bootPvpView, PVP_VIEW_LABELS, PVP_VIEWS, pvpView, selectPvpView } from './pvpTabs'
import HerbPvpPanel from './herbPvpPanel.vue'
import TreasureMinePanel from './treasureMinePanel.vue'

bootPvpView()
const helpOpen = ref(false)

function helpId(): ModeHelpId {
  return pvpView.value === 'herb' ? 'herb' : 'treasure'
}

const help = computed(() => modeHelpOf(helpId()))
</script>

<template>
  <section class="panel">
    <div class="head">
      <h2 class="title">PVP</h2>
      <nav class="sub" role="tablist" aria-label="PVP玩法">
        <button
          v-for="id in PVP_VIEWS"
          :key="id"
          type="button"
          role="tab"
          :aria-selected="pvpView === id"
          :class="{ on: pvpView === id }"
          @click="selectPvpView(id)"
        >
          {{ PVP_VIEW_LABELS[id] }}
        </button>
      </nav>
      <button type="button" class="mode-help" aria-label="玩法说明" @click="helpOpen = true">？</button>
    </div>
    <TreasureMinePanel v-if="pvpView === 'treasure'" />
    <HerbPvpPanel v-else />
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

.head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 4px;
  background: var(--paper);
}

.title {
  margin: 0;
  font-size: 20px;
}

.sub {
  display: flex;
  flex: 1 1 auto;
  align-items: stretch;
  gap: 2px;
  min-width: 0;
  padding: 3px;
  border: 2px solid var(--gold);
  border-radius: var(--radius-pill);
  background: linear-gradient(180deg, #fffef8 0%, #fff3d4 100%);
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
}

.sub button.on {
  color: var(--ink);
  background: linear-gradient(#ffe27a, #f0b83a);
  box-shadow: 0 2px 6px rgba(212, 160, 23, 0.32);
}

.mode-help {
  flex: 0 0 32px;
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
