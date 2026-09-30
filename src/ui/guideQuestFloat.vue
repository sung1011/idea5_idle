<script setup lang="ts">
import { computed, ref } from 'vue'
import { guideQuestOpenTaskId, guideQuestView } from '../sim/guideQuest'
import { mainlineTaskById } from '../sim/mainlineQuest'
import { useGameStore } from './gameStore'
import { pushFloatTip } from './floatTips'
import { guideQuestCode } from './guideQuestCode'
import { guideCampSheetOpen, openGuideQuestTask } from './guideQuestNav'
import { questFloatBottomCss } from './guideQuestFloatPos'

const props = defineProps<{
  workshop?: boolean
}>()

const game = useGameStore()
const collapsed = ref(false)
const view = computed(() => guideQuestView(game.save, guideCampSheetOpen.value))
const code = computed(() => (view.value ? guideQuestCode(view.value.step, view.value.taskId) : ''))
const bottom = computed(() => questFloatBottomCss(props.workshop ? 'workshop' : 'dock'))

function jump() {
  const current = view.value
  if (!current) return
  if (current.waiting) {
    pushFloatTip(current.goal.replace(/^下一个目标：/, ''), 'err')
    return
  }
  openGuideQuestTask(guideQuestOpenTaskId(game.save) ?? current.taskId)
  const moduleId = mainlineTaskById(current.taskId)?.module
  if (moduleId) game.markModuleSeen(moduleId)
}

function onBadge() {
  if (collapsed.value) {
    collapsed.value = false
    jump()
    return
  }
  collapsed.value = true
}

function claim() {
  game.claimGuideQuest()
}
</script>

<template>
  <aside
    v-if="view"
    class="ck"
    :class="{ collapsed }"
    :style="{ bottom }"
    aria-label="新手主线"
  >
    <div class="row">
      <div class="ico" role="button" :aria-label="collapsed ? '打开对应模块' : '折叠任务'" @click.stop="onBadge">{{ view.phaseStep }}</div>
      <div class="txt" role="button" aria-label="打开对应模块" @click.stop="jump">
        <p class="name"><span class="label">{{ view.title }}</span><span class="code">{{ code }}</span></p>
        <p class="goal">{{ view.goal }}</p>
        <p v-if="view.unlockNote" class="note">{{ view.unlockNote }}</p>
        <p class="prog" :class="{ ok: view.claimable }">{{ view.progressLabel }}</p>
      </div>
    </div>
    <div class="bar" :class="{ ok: view.claimable }">
      <i :style="{ width: `${view.fillPct}%` }" />
    </div>
    <div v-if="view.claimable" class="act">
      <button type="button" @click.stop="claim">领取 {{ view.rewardLabel }}</button>
    </div>
  </aside>
</template>

<style scoped>
.ck {
  position: absolute;
  left: 8px;
  z-index: 6;
  width: min(210px, calc(100% - 90px));
  overflow: hidden;
  color: #fff6e0;
  background: rgba(18, 48, 24, 0.88);
  border: 2px solid #e2ae62;
  border-radius: 8px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(4px);
}

.row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px 6px;
  cursor: pointer;
}

.ico {
  display: grid;
  flex: none;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--accent-face);
  color: #4a2c0a;
  font-size: 11px;
  font-weight: 900;
}

.txt {
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.name {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.label {
  opacity: 0.75;
}

.code {
  color: #b7c0b4;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0;
}

.goal {
  margin: 2px 0 0;
  font-size: 13px;
  font-weight: 800;
  line-height: 1.25;
}

.note {
  margin: 2px 0 0;
  color: #ffd27a;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.25;
}

.prog {
  margin: 3px 0 0;
  color: #d8ff9a;
  font-size: 11px;
  font-weight: 700;
}

.prog.ok {
  color: #b8f070;
}

.bar {
  height: 3px;
  margin: 0 10px 8px;
  overflow: hidden;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.15);
}

.bar i {
  display: block;
  height: 100%;
  background: #3cb82e;
}

.bar.ok i {
  background: #8fd94a;
}

.act {
  padding: 0 10px 8px;
}

.act button {
  width: 100%;
  min-height: 30px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: linear-gradient(180deg, #b8f070, #3e9a2a);
  color: #14380c;
  font-size: 12px;
  font-weight: 800;
  box-shadow: none;
}

.collapsed {
  width: auto;
}

.collapsed .txt,
.collapsed .bar,
.collapsed .act {
  display: none;
}

.collapsed .row {
  padding: 6px;
  gap: 0;
}
</style>
