<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import type { ModeHelpRow } from './modeHelp'

defineProps<{
  title: string
  rows: ModeHelpRow[]
}>()

const emit = defineEmits<{ close: [] }>()

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
    <section class="panel box" role="dialog" aria-modal="true" aria-labelledby="mode-help-title">
      <header>
        <h2 id="mode-help-title" class="title">{{ title }}</h2>
        <button type="button" class="close" @click="emit('close')">关闭</button>
      </header>
      <dl>
        <div v-for="row in rows" :key="row.label">
          <dt>{{ row.label }}</dt>
          <dd>{{ row.text }}</dd>
        </div>
      </dl>
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
  background: rgba(92, 58, 26, 0.28);
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

dl {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

dl > div {
  display: grid;
  grid-template-columns: 5.5em minmax(0, 1fr);
  gap: 8px 10px;
  padding: 8px 10px;
  border: 2px solid var(--gold);
  border-radius: 12px;
  background: var(--slot);
}

dt {
  color: var(--muted);
  font-size: 13px;
}

dd {
  margin: 0;
  font-family: var(--font-mono);
  font-weight: 700;
  line-height: 1.45;
}
</style>
