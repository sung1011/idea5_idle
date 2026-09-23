<script setup lang="ts">
import TreasureMinePanel from './treasureMinePanel.vue'
</script>

<template>
  <section class="panel">
    <h2 class="title">PVP</h2>
    <TreasureMinePanel />
  </section>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.title {
  margin: 0;
  font-size: 20px;
}
</style>
