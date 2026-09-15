import type { ClassId, ItemId, StationId } from './types'

export const DAY_LENGTH_S = 24 * 60
export const OFFLINE_CAP_S = 8 * 60 * 60

export const START_GOLD = 80
export const RECRUIT_COST = 15

/** 同站堆人：speed = (1 / cycleS) * stackFactor(n) * 共振倍率 */
export const STACK_LINEAR = 1
export const RESONANCE_SPEED_MUL = 1.2
/** 共振期间每完成这么多次吞吐，额外 +1 主产物（下游少空转 / 额外产出） */
export const RESONANCE_BONUS_EVERY = 4

export type ItemDef = {
  id: ItemId
  label: string
  sellGold: number
  cap: number
}

export const ITEM_DEF: Record<ItemId, ItemDef> = {
  wood: { id: 'wood', label: '木头', sellGold: 2, cap: 30 },
  ore: { id: 'ore', label: '矿石', sellGold: 3, cap: 20 },
  slag: { id: 'slag', label: '渣滓', sellGold: 1, cap: 20 },
  fish: { id: 'fish', label: '鱼', sellGold: 3, cap: 20 },
  meal: { id: 'meal', label: '熟食', sellGold: 8, cap: 40 },
  potion: { id: 'potion', label: '药剂', sellGold: 10, cap: 40 },
  weapon: { id: 'weapon', label: '武器', sellGold: 12, cap: 50 },
  blueprint: { id: 'blueprint', label: '图纸', sellGold: 20, cap: 20 },
}

export const ITEM_IDS = Object.keys(ITEM_DEF) as ItemId[]

export type IoRule = { itemId: ItemId; qty: number }

export type StationDef = {
  id: StationId
  label: string
  cycleS: number
  /** 消耗：锻造优先扣矿，没有矿再扣渣滓（炼金回流）。 */
  inputs: IoRule[]
  altInputs?: IoRule[]
  outputs: IoRule[]
  neighbors: StationId[]
}

export const STATION_DEF: Record<StationId, StationDef> = {
  woodcutting: {
    id: 'woodcutting',
    label: '伐木',
    cycleS: 5,
    inputs: [],
    outputs: [{ itemId: 'wood', qty: 1 }],
    neighbors: ['alchemy'],
  },
  mining: {
    id: 'mining',
    label: '采矿',
    cycleS: 5,
    inputs: [],
    outputs: [{ itemId: 'ore', qty: 1 }],
    neighbors: ['forging'],
  },
  alchemy: {
    id: 'alchemy',
    label: '炼金',
    cycleS: 10,
    inputs: [{ itemId: 'wood', qty: 1 }],
    outputs: [
      { itemId: 'potion', qty: 1 },
      { itemId: 'slag', qty: 1 },
    ],
    neighbors: ['forging', 'woodcutting'],
  },
  fishing: {
    id: 'fishing',
    label: '钓鱼',
    cycleS: 6,
    inputs: [],
    outputs: [{ itemId: 'fish', qty: 1 }],
    neighbors: ['cooking'],
  },
  cooking: {
    id: 'cooking',
    label: '烹饪',
    cycleS: 7,
    inputs: [{ itemId: 'fish', qty: 1 }],
    outputs: [{ itemId: 'meal', qty: 1 }],
    neighbors: ['fishing'],
  },
  forging: {
    id: 'forging',
    label: '锻造',
    cycleS: 8,
    inputs: [{ itemId: 'ore', qty: 1 }],
    altInputs: [{ itemId: 'slag', qty: 1 }],
    outputs: [{ itemId: 'weapon', qty: 1 }],
    neighbors: ['mining', 'alchemy'],
  },
}

export const STATION_IDS = Object.keys(STATION_DEF) as StationId[]

export const PLAYABLE_STATION_IDS: StationId[] = ['mining', 'forging']
export const SKELETON_STATION_IDS: StationId[] = ['woodcutting', 'alchemy', 'fishing', 'cooking']

export const WORKER_NAME_POOL = [
  '阿木',
  '石子',
  '炉火',
  '青苔',
  '河虾',
  '煤灰',
  '铁钉',
  '芦花',
  '砂锅',
  '麻绳',
]

export const CLASS_PLACEHOLDERS: ClassId[] = ['laborer', 'artisan', 'wanderer']

export const CLASS_LABEL: Record<ClassId, string> = {
  laborer: '力工',
  artisan: '匠人',
  wanderer: '游民',
}

export function gameDay(elapsedS: number): number {
  return Math.floor(Math.max(0, elapsedS) / DAY_LENGTH_S) + 1
}

export function timeOfDayS(elapsedS: number): number {
  return Math.max(0, elapsedS) % DAY_LENGTH_S
}

export function formatClock(totalS: number): string {
  const safe = Math.max(0, Math.floor(totalS))
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

/** 同站人数加速。n 人 → n 倍基础速度（迅雷手感）。 */
export function stackFactor(n: number): number {
  if (n <= 0) return 0
  return n * STACK_LINEAR
}

/**
 * 站点每秒进度。
 * speed = (1 / cycleS) * n * (共振 ? RESONANCE_SPEED_MUL : 1)
 * 1 人采矿 cycleS=5 → 0.2/s，5 秒出 1 矿
 * 3 人采矿 → 0.6/s，同等时间 3 倍吞吐
 */
export function stationSpeed(n: number, cycleS: number, resonating = false): number {
  if (n <= 0 || cycleS <= 0) return 0
  const base = 1 / cycleS
  return base * stackFactor(n) * (resonating ? RESONANCE_SPEED_MUL : 1)
}
