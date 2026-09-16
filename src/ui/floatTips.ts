import { ref } from 'vue'

export type FloatTipKind = 'ok' | 'err'

export type FloatTip = {
  id: number
  text: string
  kind: FloatTipKind
  x: number
  y: number
}

const LIFE_MS = 1400
const tips = ref<FloatTip[]>([])
let nextId = 1
let pointer = { x: 0, y: 0 }
let listening = false

function bindPointer() {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener(
    'pointerdown',
    (ev) => {
      pointer = { x: ev.clientX, y: ev.clientY }
    },
    true,
  )
}

function tipPoint() {
  if (typeof window === 'undefined') return { x: 160, y: 72 }
  const x = pointer.x > 0 ? pointer.x : window.innerWidth / 2
  const y = pointer.y > 0 ? pointer.y : 72
  return {
    x: Math.min(window.innerWidth - 24, Math.max(24, x)),
    y: Math.min(window.innerHeight - 24, Math.max(48, y)),
  }
}

/** 失败/拦截与短成功提示：点附近上浮淡出，可叠多条。 */
export function pushFloatTip(text: string, kind: FloatTipKind = 'err') {
  const msg = text.trim()
  if (!msg) return
  bindPointer()
  const id = nextId++
  const at = tipPoint()
  const stack = tips.value.length
  tips.value = [...tips.value, { id, text: msg, kind, x: at.x, y: at.y - stack * 28 }]
  window.setTimeout(() => {
    tips.value = tips.value.filter((tip) => tip.id !== id)
  }, LIFE_MS)
}

export function useFloatTips() {
  bindPointer()
  return { tips }
}
