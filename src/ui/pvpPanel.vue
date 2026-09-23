<script setup lang="ts">
import TreasureMinePanel from './treasureMinePanel.vue'

const PVP_TABS = ['夺宝'] as const
</script>

<template>
  <section class="panel">
    <h2 class="title">PVP</h2>
    <div class="board-nav">
      <nav class="sub" role="tablist" aria-label="PVP分页">
        <button
          v-for="label in PVP_TABS"
          :key="label"
          type="button"
          role="tab"
          aria-selected="true"
          class="on"
        >
          {{ label }}
        </button>
      </nav>
    </div>
    <TreasureMinePanel />
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
</style>
