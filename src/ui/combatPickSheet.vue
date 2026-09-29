<script setup lang="ts">
import { computed, ref } from 'vue'
import { isFullCombatHp } from '../sim/combat'
import { isAssistWorker } from '../sim/combatAssist'
import {
  availableRuneQty,
  isRuneSlotUnlocked,
  listRunePickOptions,
  runeSlotLockedTip,
  runeSlotTapKind,
} from '../sim/runes'
import { isRuneItemId, RUNE_DEF } from '../sim/tables'
import type { RuneItemId, Worker } from '../sim/types'
import ActButton from './actButton.vue'
import ActIcon from './actIcon.vue'
import type { ActIconId } from './actIcons'
import CombatAttrRow from './combatAttrRow.vue'
import { enemyPickCopy, type EnemyPickMode } from './enemyCardAction'
import { pushFloatTip } from './floatTips'
import { useGameStore } from './gameStore'
import { pickSlotNumber } from './pickSlot'
import { pickWorkerName } from './pickWorkerName'
import { qualityOf, workerQualityBadgeStyle, workerQualityNameStyle } from './workerQuality'
import WorkerAvatar from './workerAvatar.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    max: number
    candidates: Worker[]
    picked: string[]
    runes: Partial<Record<string, RuneItemId>>
    mode?: EnemyPickMode
    showRunes?: boolean
    showAssist?: boolean
    supplyBlocked?: boolean
    guideFlashConfirm?: boolean
    guideFlashRecommend?: boolean
    guideFlashRune?: boolean
    slotOffset?: number
    titleText?: string
    confirmText?: string
    confirmIcon?: ActIconId
    confirmTone?: 'combat' | 'gain' | 'produce'
    noteText?: string
    recommendLabel?: (worker: Worker) => string | null
    canPick?: (worker: Worker) => boolean
  }>(),
  {
    mode: 'start',
    showRunes: true,
    showAssist: true,
    supplyBlocked: false,
    guideFlashConfirm: false,
    guideFlashRecommend: false,
    guideFlashRune: false,
    slotOffset: 0,
    titleText: '',
    confirmText: '',
    noteText: '',
  },
)

const emit = defineEmits<{
  close: []
  confirm: []
  toggle: [worker: Worker]
  invite: []
  'supply-warn': []
  'update:runes': [value: Partial<Record<string, RuneItemId>>]
}>()

const game = useGameStore()
const runePickWorkerId = ref<string | null>(null)
const copy = computed(() => enemyPickCopy(props.mode, props.max))
const sheetTitle = computed(() => props.titleText || copy.value.title)
const sheetConfirm = computed(() => props.confirmText || copy.value.confirm)
const runeSlotUnlocked = computed(() => isRuneSlotUnlocked(game.save))
const runeOptions = computed(() => listRunePickOptions(game.save))
const hint = computed(() => {
  const assist = props.showAssist ? '点邀请才加入 1 名临时助战。' : ''
  return `列出休息苦工；未达出战条件的灰显。出战不算派驻工坊。${assist}${copy.value.hintTail}`
})

function recommend(worker: Worker): string | null {
  return props.recommendLabel?.(worker) ?? null
}

function canPickWorker(worker: Worker): boolean {
  return props.canPick ? props.canPick(worker) : isFullCombatHp(worker)
}

function slotNumber(workerId: string): number | null {
  return pickSlotNumber(props.picked, workerId, props.slotOffset)
}

function equippedRune(workerId: string): RuneItemId | null {
  const id = props.runes[workerId]
  return isRuneItemId(id) ? id : null
}

function runeSlotLabel(workerId: string): string {
  const id = equippedRune(workerId)
  return id ? RUNE_DEF[id].label : '符文'
}

function openRunePick(workerId: string, ev?: Event) {
  ev?.stopPropagation()
  if (!props.showRunes) return
  if (!isRuneSlotUnlocked(game.save)) {
    pushFloatTip(runeSlotLockedTip())
    return
  }
  game.clearWorkerNew(workerId)
  runePickWorkerId.value = workerId
  game.markGuideRuneOpened()
}

function onRuneSlotTap(worker: Worker, ev?: Event) {
  ev?.stopPropagation()
  if (!props.showRunes) return
  const kind = runeSlotTapKind(game.save, isFullCombatHp(worker))
  if (kind === 'locked') {
    pushFloatTip(runeSlotLockedTip())
    return
  }
  if (kind === 'open') openRunePick(worker.id, ev)
}

function closeRunePick() {
  runePickWorkerId.value = null
}

function pickRune(runeId: RuneItemId | null) {
  const workerId = runePickWorkerId.value
  if (!workerId) return
  if (!runeId) {
    const next = { ...props.runes }
    delete next[workerId]
    emit('update:runes', next)
    closeRunePick()
    return
  }
  if (availableRuneQty(game.save, props.runes, runeId, workerId) < 1) {
    pushFloatTip(`${RUNE_DEF[runeId].label}见底`, 'err')
    return
  }
  emit('update:runes', { ...props.runes, [workerId]: runeId })
  closeRunePick()
}

function closeAll() {
  closeRunePick()
  emit('close')
}
</script>

<template>
  <div v-if="open" class="modal" role="dialog" :aria-label="sheetTitle" @click.self="closeAll">
    <div class="sheet">
      <div class="sheet-head">
        <p>{{ sheetTitle }}（最多 {{ max }} 人）</p>
        <ActButton v-if="showAssist" icon="invite" kind="minor" @click="emit('invite')">邀请</ActButton>
      </div>
      <p class="hint">{{ hint }}</p>
      <p v-if="noteText" class="hint">{{ noteText }}</p>
      <ul class="pick-list">
        <li v-for="w in candidates" :key="w.id" class="pick-row">
          <button
            type="button"
            class="pick-worker"
            :class="{
              on: picked.includes(w.id),
              assist: isAssistWorker(w),
              dim: !canPickWorker(w),
              'guide-flash':
                guideFlashRecommend && (recommend(w) === '推荐' || recommend(w) === '强烈推荐'),
            }"
            :disabled="!canPickWorker(w)"
            @click="emit('toggle', w)"
          >
            <WorkerAvatar size="sm" :race="w.race" :quality="w.qualityTier" :worker-id="w.id" />
            <span class="pick-name">
              <b v-if="slotNumber(w.id)" class="pick-slot" :aria-label="`槽位 ${slotNumber(w.id)}`">{{ slotNumber(w.id) }}</b>
              <b class="qmark" :style="workerQualityBadgeStyle(w)">{{ qualityOf(w).label }}</b>
              <i v-if="isAssistWorker(w)" class="pick-assist">助战</i>
              <i v-else-if="w.isNew" class="pick-new">NEW</i>
              <CombatAttrRow class="pick-attrs" :attrs="w.combatAttrs" />
              <b class="pick-worker-name" :style="workerQualityNameStyle(w)">{{ pickWorkerName(w) }}</b>
              <span class="pick-meta">· Lv{{ w.level }}</span>
              <i
                v-if="recommend(w) && (canPickWorker(w) || recommend(w) === '克制')"
                class="pick-rec"
                :class="{ hot: recommend(w) === '强烈推荐' }"
              >{{ recommend(w) }}</i>
            </span>
          </button>
          <span v-if="showRunes" class="act-hit rune-slot-hit" @click="onRuneSlotTap(w, $event)">
            <button
              type="button"
              class="rune-slot"
              :class="{
                on: runeSlotUnlocked && !!equippedRune(w.id),
                locked: !runeSlotUnlocked,
                'guide-flash': guideFlashRune && runeSlotUnlocked,
              }"
              :disabled="!runeSlotUnlocked || !canPickWorker(w)"
              :aria-label="`${pickWorkerName(w)} 符文槽`"
              @click.stop="onRuneSlotTap(w, $event)"
            >
              {{ runeSlotLabel(w.id) }}
            </button>
          </span>
        </li>
        <li v-if="!candidates.length" class="hint">没有休息中的苦工</li>
      </ul>
      <div class="row">
        <span class="act-hit" @click="supplyBlocked && emit('supply-warn')">
          <button
            type="button"
            :class="[confirmTone ? ['act', 'primary', confirmTone] : '', { 'guide-flash': guideFlashConfirm }]"
            :disabled="!picked.length || supplyBlocked"
            @click.stop="emit('confirm')"
          >
            <ActIcon v-if="confirmIcon" :name="confirmIcon" />
            <span>{{ sheetConfirm }}</span>
          </button>
        </span>
      </div>
    </div>
  </div>

  <div v-if="open && showRunes && runePickWorkerId" class="modal" role="dialog" aria-label="选择符文" @click.self="closeRunePick">
    <div class="sheet rune-sheet">
      <p>选择符文（一人一槽，确认后消耗）</p>
      <p class="hint">列出全部种类与库存；短文案是本场效果。未选则空手出战。</p>
      <ul class="rune-list">
        <li>
          <button type="button" class="rune-item" :class="{ on: !equippedRune(runePickWorkerId) }" @click="pickRune(null)">
            <b>空槽</b>
            <span>不带符文</span>
          </button>
        </li>
        <li v-for="row in runeOptions" :key="row.id">
          <button
            type="button"
            class="rune-item"
            :class="{ on: equippedRune(runePickWorkerId) === row.id }"
            :disabled="availableRuneQty(game.save, runes, row.id, runePickWorkerId) < 1 && equippedRune(runePickWorkerId) !== row.id"
            @click="pickRune(row.id)"
          >
            <b>{{ row.label }} ×{{ availableRuneQty(game.save, runes, row.id, runePickWorkerId) }}</b>
            <span>{{ row.effect }}</span>
          </button>
        </li>
      </ul>
      <div class="row">
        <ActButton icon="close" kind="minor" @click="closeRunePick">关闭</ActButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(8, 28, 14, 0.58);
}

.sheet {
  width: min(520px, 100%);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border: 3px solid var(--gold-deep);
  border-radius: 16px;
  background: var(--plate);
  box-shadow: 0 6px 0 var(--shadow);
}

.sheet p,
.hint {
  margin: 0;
  line-height: 1.5;
}

.hint {
  color: var(--muted);
  font-size: 14px;
}

.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.act-hit {
  display: inline-flex;
}

.row > .act-hit:has(.act.primary) {
  display: flex;
  flex: 1 1 100%;
  width: 100%;
}

.act-hit > :disabled {
  pointer-events: none;
}

.pick-list {
  max-height: 50vh;
  overflow: auto;
  margin: 0;
  padding: 0;
  list-style: none;
}

.pick-row {
  display: flex;
  align-items: stretch;
  gap: 6px;
}

.pick-list .pick-worker {
  flex: 1 1 auto;
  min-width: 0;
  width: auto;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  text-align: left;
}

.rune-slot-hit {
  flex: 0 0 56px;
}

.rune-slot {
  flex: 0 0 56px;
  width: 100%;
  min-width: 56px;
  min-height: 44px;
  padding: 4px 6px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.rune-slot.on {
  background: var(--tab-on);
}

.rune-slot.locked,
.rune-slot:disabled {
  opacity: 0.45;
  filter: grayscale(0.35);
}

.rune-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 46vh;
  overflow: auto;
}

.rune-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  text-align: left;
}

.rune-item span {
  color: var(--muted);
  font-size: 12px;
}

.rune-item.on {
  background: var(--tab-on);
}

.pick-slot {
  flex: none;
  min-width: 22px;
  padding: 1px 6px;
  border: 2px solid var(--gold-deep);
  border-radius: 999px;
  background: #f0c46a;
  color: #4a2c0a;
  font-style: normal;
  font-size: 12px;
  font-weight: 900;
  text-align: center;
}

.pick-name {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  color: var(--copper);
}

.pick-attrs {
  flex: none;
}

.pick-worker-name {
  font-weight: 700;
}

.pick-assist {
  font-style: normal;
  padding: 1px 7px;
  border: 2px solid #1f7a4a;
  border-radius: 999px;
  background: #d8f3e4;
  color: #14603a;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.pick-new {
  font-style: normal;
  padding: 1px 6px;
  border: 1px solid #7a1808;
  border-radius: 4px;
  background: linear-gradient(#ff6a3d, #d62828);
  color: #fff8e8;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.04em;
}

.pick-worker.assist {
  box-shadow: inset 0 0 0 2px #1f7a4a;
}

.pick-rec {
  font-style: normal;
  padding: 1px 7px;
  border: 2px solid var(--gold-deep);
  border-radius: 999px;
  background: #f0c46a;
  color: #6b4218;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.pick-rec.hot {
  background: #f0c14a;
  color: #4a2c0a;
}

.pick-list .qmark {
  position: static;
  min-width: 22px;
  padding: 1px 7px;
  border: 2px solid currentColor;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-align: center;
}

.pick-worker.dim,
.pick-worker:disabled {
  opacity: 0.5;
  filter: grayscale(0.15);
}

.pick-worker.on,
.pick-worker.on:disabled {
  color: var(--ink);
  background: var(--accent-face);
  border-color: var(--gold-deep);
  box-shadow:
    0 3px 0 var(--gold-deep),
    inset 0 1px 0 #fff6c8,
    inset 0 0 0 2px #ffe28a;
  filter: none;
  opacity: 1;
}

.pick-list :deep(.chip) {
  flex: none;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  aspect-ratio: 1;
}
</style>
