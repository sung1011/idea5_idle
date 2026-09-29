import { computed, onMounted, onUnmounted, ref, type ComputedRef, type Ref } from 'vue'

export type VisualProgressInput = {
  progress: number
  speed: number
  stalled: boolean
  assigned: number
  lastTick: number
  now: number
  /**
   * 制造周期。跨过 1 就归零开始下一件，墙钟不封顶。
   * 缺省仍是夺宝那种「到顶钉住、最多补 1.05 秒」，避免整洞进度提前跳回 0。
   */
  wrap?: boolean
}

export type CraftProgressHalt = 'closed' | 'empty' | 'paused'

export type CraftProgressInput = {
  progress: number
  /** 当前这件每秒推进量，和 `currentSpeed` 同一单位。 */
  speed: number
  assigned: number
  /** 缺料、采集冻结，或速度为 0：sim 不加 progress。 */
  paused: boolean
  /** 封闭。没人时停住；已有苦工在岗则继续按真实进度走。 */
  closed: boolean
  lastTick: number
  now: number
}

export type CraftProgressView = {
  /** 0～1 */
  ratio: number
  /** 条宽用，0～100，不四舍五入。 */
  fillPct: number
  /** 条上的百分比，0～100 的整数。 */
  percent: number
  /** 未停时离下一件完成的秒数。 */
  remainS: number
  halted: boolean
  halt: CraftProgressHalt | null
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

function finiteOr(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback
}

/**
 * 对 1 取余。刚好做完一件落到 0，下一件从头走。负数和非法值归 0。
 * 不用「钉在 0.999」：那会把条停在 99.9%，等下一拍存档回绕时再猛地跳回去。
 */
export function wrapCycleProgress(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  const mod = value % 1
  return mod < 0 ? 0 : mod
}

/**
 * 显示用进度。权威仍是 sim 的 progress（每秒 applyTick）。
 * 没人 / 停产 / 空转不假跑，并把可能超过 1 的存档钳回 0～1。
 * `wrap` 时按墙钟把整段空档补上（切页、后台回来都不只补 1 秒），做完一件取余归零。
 * 不传 `wrap` 时仍把插值卡在 1.05 秒，到顶钉在 0.999，给不该提前回绕的读条用。
 */
export function visualStationProgress(input: VisualProgressInput): number {
  const stored = finiteOr(input.progress)
  const speed = finiteOr(input.speed)
  if (input.assigned <= 0 || input.stalled || speed <= 0) return clamp01(stored)
  const now = finiteOr(input.now, finiteOr(input.lastTick))
  const last = finiteOr(input.lastTick, now)
  const dt = Math.max(0, (now - last) / 1000)
  if (input.wrap) return wrapCycleProgress(stored + speed * dt)
  const visual = clamp01(stored) + speed * Math.min(dt, 1.05)
  if (visual >= 1) return 0.999
  return visual
}

export function craftHaltText(halt: CraftProgressHalt | null, detail?: string | null): string | null {
  if (halt === 'closed') return '已封闭'
  if (halt === 'empty') return '无苦工在岗'
  if (halt === 'paused') {
    const text = typeof detail === 'string' ? detail.trim() : ''
    return text || '暂停'
  }
  return null
}

/** 详情里这一件的进度。停住时不加墙钟；在制时和站卡同一套取余。 */
export function craftProgressView(input: CraftProgressInput): CraftProgressView {
  const assigned = finiteOr(input.assigned)
  const speed = finiteOr(input.speed)
  const noCrew = assigned <= 0
  const paused = input.paused === true || (!noCrew && speed <= 0)
  const halt: CraftProgressHalt | null = noCrew ? (input.closed ? 'closed' : 'empty') : paused ? 'paused' : null
  const ratio = visualStationProgress({
    progress: input.progress,
    speed,
    stalled: halt != null,
    assigned: noCrew ? 0 : 1,
    lastTick: input.lastTick,
    now: input.now,
    wrap: true,
  })
  const fillPct = Math.min(100, Math.max(0, ratio * 100))
  const percent = Math.min(100, Math.max(0, Math.round(fillPct)))
  const remainS = halt == null && speed > 0 ? Math.max(0, (1 - ratio) / speed) : 0
  return { ratio, fillPct, percent, remainS, halted: halt != null, halt }
}

/** 一帧一拍的墙钟，工坊竖签多站共用，避免每站各开一条 RAF。 */
export function useFrameNow(): Ref<number> {
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

  return now
}

export function useVisualProgress(read: () => Omit<VisualProgressInput, 'now'>): ComputedRef<number> {
  const now = useFrameNow()
  return computed(() => visualStationProgress({ ...read(), now: now.value }))
}
