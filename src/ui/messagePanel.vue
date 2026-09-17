<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { listedMessages } from '../sim/messages'
import { useGameStore } from './gameStore'

const emit = defineEmits<{ close: [] }>()
const game = useGameStore()
const inbox = computed(() => listedMessages(game.save))

function close() {
  game.markAllRead()
  emit('close')
}

function onKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape') close()
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div class="mask" @click.self="close">
    <section class="panel box" role="dialog" aria-modal="true" aria-labelledby="mail-title">
      <header>
        <h2 id="mail-title" class="title">消息</h2>
        <div class="row">
          <button type="button" :disabled="!inbox.length" @click="game.markAllRead()">全部已读</button>
          <button type="button" class="close" @click="close">关闭</button>
        </div>
      </header>
      <p v-if="!inbox.length" class="hint">还没有消息。</p>
      <ul v-else>
        <li v-for="msg in inbox" :key="msg.id" :class="{ unread: !msg.read }">
          <p class="title">{{ msg.title }}</p>
          <pre>{{ msg.body }}</pre>
        </li>
      </ul>
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
  width: min(440px, 100%);
  max-height: min(70dvh, 560px);
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 12px 10px;
}

header .title {
  margin: 0;
  font-size: 20px;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

header .title,
.hint,
li .title {
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

ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

li {
  padding: 10px 12px;
  border: 2px solid var(--gold);
  border-radius: 12px;
  background: var(--slot);
}

li.unread {
  border-color: var(--gold-deep);
  box-shadow: inset 0 0 0 2px #fff3c4;
}

li .title {
  font-family: var(--font-body);
  font-weight: 700;
  letter-spacing: 0;
}

pre {
  margin: 6px 0 0;
  white-space: pre-wrap;
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--copper);
}
</style>
