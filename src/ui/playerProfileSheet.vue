<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { playerAvatarId, playerDisplayName, type PlayerAvatarId } from '../sim/createSave'
import PlayerAvatar from './playerAvatar.vue'
import { playerAvatarList } from './playerAvatar'

const props = defineProps<{
  name: string
  avatarId: string
}>()

const emit = defineEmits<{
  close: []
  confirm: [payload: { name: string; avatarId: PlayerAvatarId }]
}>()

const draftName = ref(props.name)
const draftAvatar = ref<PlayerAvatarId>(playerAvatarId(props.avatarId))
const faces = playerAvatarList()

function onKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape') emit('close')
}

function confirm() {
  emit('confirm', {
    name: playerDisplayName(draftName.value),
    avatarId: draftAvatar.value,
  })
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
    <section class="panel box" role="dialog" aria-modal="true" aria-labelledby="player-profile-title">
      <header>
        <h2 id="player-profile-title" class="title">玩家</h2>
        <button type="button" class="close" @click="emit('close')">关闭</button>
      </header>
      <label class="name">
        <span>名字</span>
        <input v-model="draftName" maxlength="16" autocomplete="off" aria-label="玩家名字" />
      </label>
      <div class="avatars" role="listbox" aria-label="头像">
        <button
          v-for="face in faces"
          :key="face.id"
          type="button"
          role="option"
          :aria-selected="draftAvatar === face.id"
          :class="{ on: draftAvatar === face.id }"
          :aria-label="face.label"
          @click="draftAvatar = face.id"
        >
          <PlayerAvatar :id="face.id" />
          <span>{{ face.label }}</span>
        </button>
      </div>
      <button type="button" class="confirm" @click="confirm">确认</button>
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

.name {
  display: grid;
  grid-template-columns: 5.5em minmax(0, 1fr);
  gap: 8px 10px;
  align-items: center;
  padding: 8px 10px;
  border: 2px solid var(--gold);
  border-radius: 12px;
  background: var(--slot);
  color: var(--muted);
  font-size: 13px;
}

.name input {
  width: 100%;
  min-height: 32px;
  padding: 4px 8px;
  border: 2px solid var(--gold-deep);
  border-radius: 8px;
  background: #fffdf8;
  color: var(--ink);
  font-family: var(--font-mono);
  font-weight: 700;
}

.avatars {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.avatars button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-height: 0;
  padding: 6px 4px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 700;
}

.avatars button.on {
  background: linear-gradient(#ffe27a, #f0b83a);
}

.confirm {
  min-height: 40px;
}
</style>
