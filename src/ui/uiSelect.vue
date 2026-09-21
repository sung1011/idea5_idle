<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  nextUiSelectUid,
  uiSelectCanPick,
  uiSelectLabel,
  uiSelectOptionFlashing,
  uiSelectStepIndex,
  type UiSelectOption,
} from './uiSelect'

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: readonly UiSelectOption[]
    disabled?: boolean
    ariaLabel?: string
    /** 来源提示：打开菜单并给对应选项加 guide-flash，不改 modelValue。 */
    flashValues?: readonly string[]
  }>(),
  { disabled: false },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const uid = nextUiSelectUid()
const listId = `${uid}-list`

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const active = ref(-1)
const menuStyle = ref<Record<string, string>>({})

const currentLabel = computed(() => uiSelectLabel(props.options, props.modelValue))
const selectedIndex = computed(() =>
  props.options.findIndex((row) => row.value === props.modelValue),
)
let openedByFlash = false

function optionFlashing(value: string) {
  return uiSelectOptionFlashing(value, props.flashValues)
}

function placeMenu() {
  const el = trigger.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const gap = 4
  const maxH = 260
  const spaceBelow = window.innerHeight - r.bottom - 8
  const spaceAbove = r.top - 8
  const openUp = spaceBelow < 140 && spaceAbove > spaceBelow
  const height = Math.min(maxH, Math.max(96, openUp ? spaceAbove : spaceBelow))
  const width = Math.min(Math.max(r.width, 140), window.innerWidth - 16)
  const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8)
  menuStyle.value = {
    position: 'fixed',
    left: `${left}px`,
    width: `${width}px`,
    maxHeight: `${height}px`,
    zIndex: 'var(--z-select)',
    ...(openUp
      ? { bottom: `${window.innerHeight - r.top + gap}px` }
      : { top: `${r.bottom + gap}px` }),
  }
}

function scrollActive() {
  const i = active.value
  if (i < 0) return
  menu.value?.querySelector<HTMLElement>(`[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest' })
}

async function setOpen(next: boolean) {
  if (props.disabled) return
  open.value = next
  if (!next) return
  active.value = selectedIndex.value >= 0 ? selectedIndex.value : uiSelectStepIndex(props.options, -1, 1)
  await nextTick()
  placeMenu()
  scrollActive()
}

function toggle() {
  void setOpen(!open.value)
}

function pick(option: UiSelectOption) {
  if (!uiSelectCanPick(option)) return
  emit('update:modelValue', option.value)
  open.value = false
}

function onDocPointer(ev: PointerEvent) {
  if (!open.value) return
  const t = ev.target as Node
  if (root.value?.contains(t) || menu.value?.contains(t)) return
  open.value = false
}

function onWin() {
  if (open.value) placeMenu()
}

function onKey(ev: KeyboardEvent) {
  if (!open.value) {
    if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && document.activeElement === trigger.value) {
      ev.preventDefault()
      void setOpen(true)
    }
    return
  }
  if (ev.key === 'Escape') {
    ev.preventDefault()
    open.value = false
    trigger.value?.focus()
    return
  }
  if (ev.key === 'ArrowDown') {
    ev.preventDefault()
    active.value = uiSelectStepIndex(props.options, active.value, 1)
    scrollActive()
    return
  }
  if (ev.key === 'ArrowUp') {
    ev.preventDefault()
    active.value = uiSelectStepIndex(props.options, active.value, -1)
    scrollActive()
    return
  }
  if (ev.key === 'Enter' || ev.key === ' ') {
    ev.preventDefault()
    const option = props.options[active.value]
    if (option) pick(option)
  }
}

watch(
  () => props.options,
  () => {
    if (open.value) {
      placeMenu()
      if (active.value >= props.options.length) active.value = selectedIndex.value
    }
  },
)

watch(
  () => (props.flashValues ?? []).join('\0'),
  (key) => {
    const on = key.length > 0
    if (on) {
      if (!open.value && !props.disabled) {
        openedByFlash = true
        void setOpen(true)
      }
      return
    }
    if (openedByFlash) {
      openedByFlash = false
      open.value = false
    }
  },
)

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointer, true)
  window.addEventListener('keydown', onKey)
  window.addEventListener('resize', onWin)
  window.addEventListener('scroll', onWin, true)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointer, true)
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', onWin)
  window.removeEventListener('scroll', onWin, true)
})
</script>

<template>
  <div ref="root" class="ui-select" :class="{ open, off: disabled }">
    <button
      ref="trigger"
      type="button"
      class="face"
      role="combobox"
      :aria-expanded="open"
      aria-haspopup="listbox"
      :aria-controls="listId"
      :aria-label="ariaLabel"
      :disabled="disabled"
      @click="toggle"
    >
      <span class="lab">{{ currentLabel }}</span>
      <i class="chev" aria-hidden="true" />
    </button>
    <Teleport to="body">
      <ul
        v-if="open"
        :id="listId"
        ref="menu"
        class="menu"
        role="listbox"
        :aria-label="ariaLabel"
        :style="menuStyle"
      >
        <li
          v-for="(row, i) in options"
          :key="`${row.value || 'none'}-${i}`"
          :data-i="i"
          role="option"
          class="opt"
          :class="{ on: row.value === modelValue, active: i === active, off: row.disabled, 'guide-flash': optionFlashing(row.value) }"
          :data-source-flash="optionFlashing(row.value) ? row.value : undefined"
          :aria-selected="row.value === modelValue"
          :aria-disabled="!!row.disabled"
          @mouseenter="active = i"
          @click="pick(row)"
        >
          {{ row.label }}
        </li>
      </ul>
    </Teleport>
  </div>
</template>

<style scoped>
.ui-select {
  position: relative;
  display: block;
  min-width: 120px;
  max-width: 100%;
}

.face {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 36px;
  padding: 4px 10px;
  text-align: left;
}

.lab {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.chev {
  flex: 0 0 auto;
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 6px solid var(--ink);
  opacity: 0.72;
  transition: transform var(--motion) ease;
}

.open .chev {
  transform: rotate(180deg);
}

.off .face {
  cursor: default;
}

.menu {
  list-style: none;
  margin: 0;
  padding: 6px;
  overflow: auto;
  border: 3px solid var(--gold-deep);
  border-radius: 12px;
  background:
    var(--paper-grain),
    linear-gradient(180deg, #fffef8 0%, #fff3d8 100%);
  background-blend-mode: multiply, normal;
  box-shadow:
    0 6px 0 var(--shadow),
    inset 0 1px 0 rgba(255, 255, 255, 0.78),
    inset 0 0 0 2px #fff8e0;
}

.opt {
  min-height: 36px;
  padding: 6px 10px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--ink);
  cursor: pointer;
}

.opt.active:not(.off) {
  background: linear-gradient(#fff8d8, #ffe9b0);
}

.opt.on {
  background: linear-gradient(#ffe27a, #f0b83a);
  box-shadow: inset 0 0 0 2px var(--gold-deep);
}

.opt.off {
  color: var(--muted);
  cursor: default;
  opacity: 0.55;
  filter: grayscale(0.15);
}
</style>
