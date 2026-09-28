<script setup lang="ts">
import { ref } from 'vue'
import ModeHelpSheet from './modeHelpSheet.vue'
import { modeHelpOf } from './modeHelp'
import { settlePvpTab } from './pvpTabs'
import TreasureMinePanel from './treasureMinePanel.vue'

settlePvpTab()
const helpOpen = ref(false)
const help = modeHelpOf('treasure')
</script>

<template>
  <section class="panel">
    <div class="head">
      <h2 class="title">PVP</h2>
      <button type="button" class="mode-help" aria-label="玩法说明" @click="helpOpen = true">？</button>
    </div>
    <TreasureMinePanel />
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.title {
  margin: 0;
  font-size: 20px;
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
