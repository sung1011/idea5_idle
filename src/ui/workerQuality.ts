import { hydrateQualityTier, workerQualityDef } from '../sim/tables'
import type { QualityTier, Worker, WorkerQualityId } from '../sim/types'

const TILE_FACE: Record<WorkerQualityId, { background: string; color: string }> = {
  white: { background: '#f5f0e6', color: '#8a8070' },
  green: { background: 'linear-gradient(#e8f8d0, #c8f070)', color: '#2e7a1e' },
  blue: { background: 'linear-gradient(#dcebff, #8ec8ff)', color: '#1f56b0' },
  cyan: { background: 'linear-gradient(#d8fff8, #90f0e8)', color: '#187878' },
  purple: { background: 'linear-gradient(#f0e2ff, #d4a0ff)', color: '#6b2fb0' },
  orange: { background: 'linear-gradient(#ffe7c8, #ffc070)', color: '#b85a08' },
  pink: { background: 'linear-gradient(#ffe0ec, #ffb0d0)', color: '#c04070' },
  red: { background: 'linear-gradient(#ffe0e0, #ff9090)', color: '#b02020' },
  gold: { background: 'linear-gradient(#fff8d0, #ffe27a)', color: '#8a6410' },
  rainbow: {
    background: 'linear-gradient(135deg,#ff9090,#ffe27a,#90f0e8,#d4a0ff)',
    color: '#4a2c0a',
  },
}

export function qualityOf(worker: Worker) {
  return workerQualityDef(worker.qualityTier)
}

/** 浅档用深字，其余角标白字，避免羊皮纸上白/粉/金看不清。 */
export function qualityInk(worker: Worker) {
  const id = qualityOf(worker).id
  return id === 'white' || id === 'gold' || id === 'cyan' || id === 'pink' ? '#5a3a10' : '#fffdf8'
}

export function workerQualityToneClass(worker: Worker) {
  const id = qualityOf(worker).id
  return {
    rainbow: id === 'rainbow',
    pink: id === 'pink',
  }
}

export function workerQualityCardStyle(worker: Worker) {
  const color = qualityOf(worker).color
  return {
    borderColor: color,
    boxShadow: `inset 6px 0 0 ${color}, 0 3px 0 var(--gold-deep), inset 0 0 0 2px #fff8e0`,
  }
}

export function workerQualityBadgeStyle(worker: Worker) {
  return {
    color: qualityInk(worker),
    background: qualityOf(worker).color,
    borderColor: qualityOf(worker).color,
  }
}

/** 选人列表名字色：用档表色；白档等浅色改偏深棕，羊皮纸上能看清。 */
export function workerQualityNameStyle(worker: Worker) {
  const { id, color } = qualityOf(worker)
  return {
    color: id === 'white' ? '#5a3a10' : color,
  }
}

export function workerQualityDotStyle(tier: QualityTier) {
  const q = workerQualityDef(tier)
  if (q.id === 'rainbow') {
    return {
      background: 'linear-gradient(90deg,#ff6b6b,#ffd93d,#6bcb77,#4d96ff,#c77dff)',
    }
  }
  return { background: q.color }
}

/** 工人页小图标底：浅档渐变 + 表色描边，和分组色点同一套档。 */
export function workerQualityTileStyle(worker: Worker) {
  const framed = workerQualityFrameStyle(worker.qualityTier)
  return {
    background: framed.background,
    color: TILE_FACE[qualityOf(worker).id].color,
    borderColor: framed.borderColor,
  }
}

/** 苦工圆头像的底色和描边。脏档落到白，不抛。 */
export function workerQualityFrameStyle(tier: unknown): { background: string; borderColor: string } {
  const q = workerQualityDef(hydrateQualityTier(tier))
  const face = TILE_FACE[q.id]
  return {
    background: face.background,
    borderColor: q.color,
  }
}

/** 营地格子专用，比档表色更饱和，木底上能分开。 */
const CAMP_RING_COLOR: Record<WorkerQualityId, string> = {
  white: '#e4d2a4',
  green: '#18c41c',
  blue: '#2a6dff',
  cyan: '#00c6c6',
  purple: '#b026ff',
  orange: '#ff7a00',
  pink: '#ff4d94',
  red: '#ff3030',
  gold: '#ffc400',
  rainbow: '#ff3d9a',
}

const CAMP_RING_OUTLINE = '0 0 0 1px #3a2208'

/** 紫档及以上才带外发光。 */
export function campAvatarRingGlows(tier: unknown): boolean {
  return workerQualityDef(hydrateQualityTier(tier)).tier >= 5
}

/** 圆框厚度约直径的 9%，48px 头像是 4px。 */
export function campAvatarRingPx(diameterPx: number): number {
  const diameter = Math.max(1, diameterPx)
  return Math.max(1, Math.round(diameter * 0.09))
}

/** 只给营地格子用。外圈深色细描边，高品质再加淡淡发光。 */
export function campAvatarRingStyle(
  tier: unknown,
  diameterPx: number,
): { background: string; borderColor: string; borderWidth: number; boxShadow: string } {
  const q = workerQualityDef(hydrateQualityTier(tier))
  const face = TILE_FACE[q.id]
  const color = CAMP_RING_COLOR[q.id]
  const glow = campAvatarRingGlows(tier) ? `, 0 0 6px ${color}` : ''
  return {
    background: face.background,
    borderColor: color,
    borderWidth: campAvatarRingPx(diameterPx),
    boxShadow: `${CAMP_RING_OUTLINE}${glow}`,
  }
}
