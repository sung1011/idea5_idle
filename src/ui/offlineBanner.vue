<script setup lang="ts">
import { useGameStore } from './gameStore'

const game = useGameStore()
</script>

<template>
  <section v-if="game.offlineSummary" class="panel offline">
    <p>离线摘要</p>
    <ul>
      <li v-for="(line, i) in game.offlineSummary.lines" :key="i">{{ line }}</li>
    </ul>
    <div class="row">
      <button type="button" @click="game.dismissOffline()">知道了</button>
    </div>
  </section>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border: 1px solid var(--ember);
  background: var(--plate);
}

.panel p,
li {
  margin: 0;
  line-height: 1.5;
}

ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: var(--font-mono);
  color: var(--copper);
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

button {
  padding: 6px 10px;
  border: 1px solid var(--seam);
  background: #18140f;
}
</style>
