<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
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
</script>

<template>
  <div class="mask" @click.self="emit('close')">
    <section class="panel box" role="dialog" aria-modal="true" aria-labelledby="gm-title">
      <header>
        <p id="gm-title">GM 调试</p>
        <button type="button" class="close" @click="emit('close')">关闭</button>
      </header>
      <p class="hint">仅调试用，不进正式玩法。</p>
      <div class="row">
        <button type="button" @click="game.gmReset()">初始化</button>
        <button type="button" @click="game.gmAddGold()">加金币 1w</button>
        <button type="button" @click="game.gmAddDiamonds()">加钻石 1w</button>
        <button type="button" @click="game.gmAddWorkers()">加工人×5</button>
        <button type="button" @click="game.gmMaxStations()">站点全满级</button>
        <button type="button" @click="game.gmFillBankBasics()">填满银行基础料</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 72px 16px 24px;
  background: rgba(92, 58, 26, 0.28);
}

.box {
  width: min(420px, 100%);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

header p,
.hint {
  margin: 0;
  line-height: 1.5;
}

.hint {
  color: var(--muted);
  font-size: 13px;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.close {
  min-height: 32px;
  padding: 4px 10px;
}
</style>
