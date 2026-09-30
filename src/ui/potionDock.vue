<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { bankQty } from '../sim/bank'
import { guideNeedsCampForPotion, isGuideQuestFlash } from '../sim/guideQuest'
import { potionInstallGroups } from '../sim/potionSlots'
import { ITEM_DEF, isPotionItemId } from '../sim/tables'
import type { ItemId, PotionItemId } from '../sim/types'
import { pushFloatTip } from './floatTips'
import { useGameStore } from './gameStore'
import { potionEffectRemainRatio, potionEmptyAcquireTip, potionQtyRestocked } from './potionHotbar'
import {
  isPotionHelpOpen,
  nextPotionHelp,
  POTION_EQUIP_HINT,
  potionHelpCopy,
  type PotionHelpKey,
} from './potionHelp'
import PotionIcon from './potionIcon.vue'
import { useFrameNow } from './visualProgress'

const game = useGameStore()
const frameNow = useFrameNow()
const pickIndex = ref<number | null>(null)
const potionSlots = computed(() => game.save.potionSlots)
const pickGroups = computed(() => potionInstallGroups(game.save))
const guideFlashInstall = computed(() => isGuideQuestFlash(game.save, 'potionInstall'))
const guideFlashUse = computed(
  () => isGuideQuestFlash(game.save, 'potionUse') && !guideNeedsCampForPotion(game.save),
)

function slotQty(id: PotionItemId | null) {
  return id ? bankQty(game.save, id) : 0
}

function slotLabel(itemId: ItemId | null) {
  if (!itemId || !isPotionItemId(itemId)) return '空'
  return `${ITEM_DEF[itemId].label} ×${bankQty(game.save, itemId)}`
}

function remainRatio(itemId: PotionItemId | null) {
  return potionEffectRemainRatio({
    itemId,
    elapsedS: game.save.elapsedS,
    lastTick: game.save.lastTick,
    now: frameNow.value,
    workers: game.save.workers,
  })
}

function haloStyle(itemId: PotionItemId | null) {
  return { '--remain': remainRatio(itemId).toFixed(4) }
}

const pressed = ref<number[]>([])
const restock = ref<number[]>([])
const pressTimers = new Map<number, ReturnType<typeof setTimeout>>()
let qtySnap: { id: PotionItemId | null; qty: number }[] | null = null

watch(
  () => potionSlots.value.map((id) => ({ id, qty: slotQty(id) })),
  (rows) => {
    if (!qtySnap) {
      qtySnap = rows.map((row) => ({ id: row.id, qty: row.qty }))
      return
    }
    const prev = qtySnap
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    rows.forEach((row, index) => {
      const before = prev[index]
      const same = !!before && before.id != null && before.id === row.id
      if (reduced || !potionQtyRestocked(before?.qty ?? 0, row.qty, same)) return
      restock.value = restock.value.filter((slot) => slot !== index)
      void nextTick(() => {
        if (!restock.value.includes(index)) restock.value = [...restock.value, index]
      })
    })
    qtySnap = rows.map((row) => ({ id: row.id, qty: row.qty }))
  },
  { immediate: true },
)

function onRestockEnd(index: number, ev: AnimationEvent) {
  if (!ev.animationName.includes('potion-breathe')) return
  restock.value = restock.value.filter((slot) => slot !== index)
}

function onPointerDown(index: number, ev: PointerEvent) {
  const target = ev.target
  if (target instanceof Element && target.closest('.potion-help')) return
  const pending = pressTimers.get(index)
  if (pending) clearTimeout(pending)
  pressed.value = pressed.value.filter((slot) => slot !== index)
  void nextTick(() => {
    if (!pressed.value.includes(index)) pressed.value = [...pressed.value, index]
  })
  pressTimers.set(
    index,
    setTimeout(() => {
      pressed.value = pressed.value.filter((slot) => slot !== index)
      pressTimers.delete(index)
    }, 220),
  )
}

const help = ref<PotionHelpKey | null>(null)
const helpPos = ref({ left: 8, top: 8 })

function closeHelp() {
  help.value = null
}

function onHelp(ev: MouseEvent, source: PotionHelpKey['source'], id: PotionItemId, index?: number) {
  ev.stopPropagation()
  const next = nextPotionHelp(help.value, source === 'slot' ? { source, id, index } : { source, id })
  help.value = next
  if (!next) return
  const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect()
  helpPos.value = {
    left: Math.min(window.innerWidth - 228, Math.max(8, rect.left)),
    top: Math.min(window.innerHeight - 120, rect.bottom + 6),
  }
}

const canUnequip = computed(() => {
  const key = help.value
  if (!key || key.source !== 'slot' || key.index == null) return false
  return game.save.potionSlots[key.index] != null
})

function onUnequip() {
  const key = help.value
  if (!key || key.source !== 'slot' || key.index == null) return
  game.clearPotionSlot(key.index)
  closeHelp()
}

function onDoc(ev: PointerEvent) {
  const el = ev.target
  if (!(el instanceof Element)) return
  if (!(el.closest('[data-potion-help]') || el.closest('[data-potion-bubble]'))) closeHelp()
}

const helpBubble = computed(() => {
  const key = help.value
  if (!key) return null
  return potionHelpCopy(key.id, key.source === 'slot' ? bankQty(game.save, key.id) : undefined)
})

function onSlot(index: number) {
  const id = game.save.potionSlots[index]
  closeHelp()
  if (!id) {
    pickIndex.value = index
    return
  }
  if (slotQty(id) <= 0) {
    pushFloatTip(potionEmptyAcquireTip(id), 'err')
    return
  }
  game.usePotionSlot(index)
}

function onInstall(itemId: PotionItemId) {
  const index = pickIndex.value
  if (index == null) return
  closeHelp()
  const result = game.installPotion(index, itemId)
  if (result.ok) pickIndex.value = null
}

function closePick() {
  pickIndex.value = null
  closeHelp()
}

onMounted(() => {
  document.addEventListener('pointerdown', onDoc, true)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', onDoc, true)
  for (const timer of pressTimers.values()) clearTimeout(timer)
  pressTimers.clear()
})
</script>

<template>
  <div class="potion-dock">
    <div class="potion-row" aria-label="药剂技能槽">
      <button
        v-for="(itemId, i) in potionSlots"
        :key="`potion-${i}`"
        type="button"
        class="potion-slot"
        :class="{
          empty: !itemId,
          dry: !!itemId && slotQty(itemId) <= 0,
          pressed: pressed.includes(i),
          restock: restock.includes(i),
          'guide-flash': (!itemId && guideFlashInstall) || (!!itemId && guideFlashUse),
        }"
        :aria-label="itemId ? `${slotLabel(itemId)} · 点击使用` : `装入药剂槽 ${i + 1}`"
        @pointerdown="onPointerDown(i, $event)"
        @click="onSlot(i)"
        @animationend="onRestockEnd(i, $event)"
      >
        <template v-if="itemId">
          <span v-if="remainRatio(itemId) > 0" class="potion-halo" :style="haloStyle(itemId)" aria-hidden="true" />
          <PotionIcon :name="itemId" />
          <span class="potion-name">{{ ITEM_DEF[itemId].label }}</span>
          <span class="potion-qty">{{ slotQty(itemId) }}</span>
          <span
            class="potion-help"
            data-potion-help
            role="button"
            :aria-pressed="isPotionHelpOpen(help, 'slot', itemId, i)"
            :aria-label="`查看 ${ITEM_DEF[itemId].label} 效果`"
            @click.stop="onHelp($event, 'slot', itemId, i)"
          >i</span>
        </template>
        <template v-else>
          <span class="potion-vacant" aria-hidden="true"></span>
        </template>
      </button>
    </div>
  </div>

  <Teleport to="body">
    <div
      v-if="pickIndex != null"
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-label="装配药剂"
      @click.self="closePick"
    >
      <div class="sheet">
        <header>
          <h2 class="title">装配药剂</h2>
          <button type="button" class="close" @click="closePick">关闭</button>
        </header>
        <p class="hint">{{ POTION_EQUIP_HINT }}</p>
        <div v-if="pickGroups.length" class="potion-groups">
          <section v-for="group in pickGroups" :key="group.label" class="potion-group">
            <h3 class="potion-group-title">{{ group.label }}</h3>
            <div class="pick-list">
              <div v-for="id in group.ids" :key="id" class="pick-cell">
                <div class="potion-pick-row">
                  <button type="button" class="potion-pick-main" @click="onInstall(id)">
                    <PotionIcon :name="id" />
                    <span>{{ ITEM_DEF[id].label }} ×{{ bankQty(game.save, id) }}</span>
                  </button>
                  <button
                    type="button"
                    class="potion-help pick"
                    data-potion-help
                    :aria-pressed="isPotionHelpOpen(help, 'pick', id)"
                    :aria-label="`查看 ${ITEM_DEF[id].label} 效果`"
                    @click.stop="onHelp($event, 'pick', id)"
                  >i</button>
                </div>
              </div>
            </div>
          </section>
        </div>
        <p v-else class="hint">没有可装的药剂</p>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div
      v-if="helpBubble"
      class="potion-bubble"
      data-potion-bubble
      role="dialog"
      :aria-label="helpBubble.title"
      :style="{ left: `${helpPos.left}px`, top: `${helpPos.top}px` }"
    >
      <b>{{ helpBubble.title }}</b>
      <p>{{ helpBubble.effect }}</p>
      <small v-if="helpBubble.stock != null">库存 ×{{ helpBubble.stock }}</small>
      <button v-if="canUnequip" type="button" class="potion-bubble-unequip" @click="onUnequip">卸下</button>
    </div>
  </Teleport>
</template>

<style scoped>
.potion-dock {
  position: relative;
  flex: 0 0 auto;
  margin: 10px 0 0;
  padding: 8px 8px 6px;
  border: 3px solid var(--stroke);
  border-radius: 16px;
  background: var(--wood-face);
  background-blend-mode: multiply, normal;
  box-shadow: 0 3px 0 var(--stroke), inset 0 1px 0 rgba(255, 248, 230, 0.35);
}

.potion-row {
  display: flex;
  align-items: stretch;
  min-height: 78px;
  min-width: 0;
  gap: 6px;
}

.potion-slot {
  position: relative;
  overflow: visible;
  flex: 1;
  min-width: 0;
  min-height: 78px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 8px 4px 16px;
  border: 3px solid var(--stroke);
  border-radius: 18px;
  background: var(--wood-face);
  background-blend-mode: multiply, normal;
  box-shadow: inset 0 1px 0 rgba(255, 248, 230, 0.45), 0 3px 0 var(--stroke);
  color: #5c3a16;
  transition: transform 0.08s ease, box-shadow 0.08s ease;
}

.potion-slot:active:not(:has(.potion-help:active)) {
  transform: translateY(3px);
  box-shadow: inset 0 2px 3px rgba(58, 36, 16, 0.18), 0 1px 0 var(--stroke);
}

.potion-slot.pressed::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: rgba(255, 220, 140, 0.42);
  pointer-events: none;
  animation: potion-flash 0.2s ease-out;
}

.potion-slot.empty {
  border-style: dashed;
  border-color: rgba(58, 36, 20, 0.45);
  background: rgba(90, 52, 24, 0.12);
}

.potion-slot.dry {
  filter: grayscale(0.35);
}

.potion-halo {
  position: absolute;
  inset: -3px;
  z-index: 1;
  border-radius: 16px;
  padding: 2px;
  background: conic-gradient(from -90deg, #ffc14a calc(var(--remain) * 1turn), rgba(255, 193, 74, 0.14) 0);
  pointer-events: none;
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
}

.potion-vacant {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: rgba(255, 244, 220, 0.08);
  box-shadow: inset 0 0 0 1.5px rgba(226, 163, 26, 0.28);
}

.potion-slot .potion-help {
  position: absolute;
  top: 3px;
  right: 3px;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 1px solid #6a4a22;
  border-radius: 50%;
  background: #f6e2bc;
  color: #5c3a16;
  font-size: 11px;
  font-weight: 900;
  line-height: 1;
}

.potion-groups {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.potion-group-title {
  margin: 0 0 6px;
  font-size: 13px;
  letter-spacing: 0.08em;
}

.potion-pick-row {
  display: flex;
  align-items: stretch;
  gap: 6px;
}

.potion-pick-main {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
}

.potion-help.pick {
  flex: 0 0 32px;
  width: 32px;
  min-width: 32px;
  border-radius: 10px;
  font-weight: 900;
}

.potion-bubble {
  position: fixed;
  z-index: calc(var(--z-sheet) + 6);
  width: 220px;
  padding: 8px 10px;
  border: 2px solid var(--stroke);
  border-radius: 12px;
  background: #fff6e4;
  color: var(--ink);
  box-shadow: 0 4px 0 rgba(58, 36, 16, 0.2);
}

.potion-bubble b {
  display: block;
  margin-bottom: 4px;
}

.potion-bubble p,
.potion-bubble small {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
}

.potion-bubble small {
  display: block;
  margin-top: 4px;
  color: #7a5a32;
}

.potion-bubble-unequip {
  margin-top: 8px;
  min-height: 28px;
}

.potion-slot :deep(.potion-ico) {
  width: 28px;
  height: 28px;
}

.potion-slot.dry :deep(.potion-ico) {
  opacity: 0.55;
}

.potion-name {
  max-width: 100%;
  overflow: hidden;
  font-size: 11px;
  font-weight: 800;
  line-height: 1.2;
  text-align: center;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.potion-qty {
  position: absolute;
  right: 4px;
  bottom: 4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: #2f7a32;
  color: #f4ffe8;
  font-size: 10px;
  font-weight: 900;
  line-height: 16px;
  text-align: center;
}

.potion-slot.dry .potion-qty {
  background: #b42318;
  color: #fff6f4;
}

.potion-slot.pressed .potion-qty {
  animation: potion-badge-pop 0.22s ease-out;
}

@keyframes potion-flash {
  from { opacity: 0.95; }
  to { opacity: 0; }
}

@keyframes potion-badge-pop {
  0% { transform: scale(1); }
  40% { transform: scale(1.35); }
  100% { transform: scale(1); }
}

@keyframes potion-breathe {
  0%,
  100% { filter: brightness(1); }
  45% {
    filter: brightness(1.45);
    box-shadow: inset 0 0 0 2px #ffc14a, 0 0 14px rgba(255, 196, 74, 0.85), 0 4px 0 #120e0a;
  }
}

.potion-slot.restock {
  animation: potion-breathe 0.45s ease-in-out 2;
}

.modal {
  position: fixed;
  inset: 0;
  z-index: calc(var(--z-sheet) + 4);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 16px 12px 0;
  background: rgba(8, 28, 14, 0.58);
}

.sheet {
  width: min(480px, 100%);
  max-height: min(78vh, 640px);
  overflow: auto;
  padding: 16px 16px calc(16px + var(--dock-height));
  border: 3px solid var(--gold-deep);
  border-radius: 16px 16px 12px 12px;
  background: var(--wood-face);
}

.sheet header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.title {
  margin: 0;
  font-size: 18px;
}

.pick-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

@media (prefers-reduced-motion: reduce) {
  .potion-slot,
  .potion-slot.restock,
  .potion-slot.pressed::after,
  .potion-slot.pressed .potion-qty {
    animation: none;
    transition: none;
  }
}
</style>
