import { computed, onMounted, onUnmounted, ref, type ComputedRef } from 'vue'

export type VisualProgressInput = {
  progress: number
  speed: number
  stalled: boolean
  assigned: number
  lastTick: number
  now: number
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

/**
 * 显示用进度。权威仍是 sim 的 progress（每秒 applyTick）。
 * 两拍之间按 speed 插值；到整周期先钉在 0.999，等真实 progress 回绕再对齐。
 * 没人 / 停产 / 空转不假跑。
 */
export function visualStationProgress(input: VisualProgressInput): number {
  const base = clamp01(input.progress)
  if (input.assigned <= 0 || input.stalled || input.speed <= 0) return base
  const dt = Math.max(0, (input.now - input.lastTick) / 1000)
  const visual = base + input.speed * Math.min(dt, 1.05)
  if (visual >= 1) return 0.999
  return visual
}

export function useVisualProgress(read: () => Omit<VisualProgressInput, 'now'>): ComputedRef<number> {
  const now = ref(Date.now())
  let raf = 0

  function loop() {
    now.value = Date.now()
    raf = requestAnimationFrame(loop)
  }

  onMounted(() => {
    now.value = Date.now()
    if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(loop)
  })

  onUnmounted(() => {
    if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf)
  })

  return computed(() => visualStationProgress({ ...read(), now: now.value }))
}
