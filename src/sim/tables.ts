import type { CategoryId, ClassId, ItemId, StationId } from './types'

export const DAY_LENGTH_S = 24 * 60
export const OFFLINE_CAP_S = 8 * 60 * 60

export const START_GOLD = 80
/** 高级代币占位。新档 0，本轮没有获得途径。 */
export const START_DIAMONDS = 0
export const RECRUIT_COST = 15

/** 同站堆人：speed = (1 / cycleS) * stackFactor(n) * 共振倍率 */
export const STACK_LINEAR = 1
export const RESONANCE_SPEED_MUL = 1.2
/** 共振期间每完成这么多次吞吐，额外 +1 主产物（下游少空转 / 额外产出） */
export const RESONANCE_BONUS_EVERY = 4

/** 每 5 级解锁 1 个新品类：Lv5 第 2 类，Lv10 第 3 类。 */
export const CATEGORY_UNLOCK_EVERY = 5

export type ItemDef = {
  id: ItemId
  label: string
  sellGold: number
  cap: number
}

export const ITEM_DEF: Record<ItemId, ItemDef> = {
  wood: { id: 'wood', label: '木头', sellGold: 2, cap: 300 },
  ore: { id: 'ore', label: '铜矿', sellGold: 3, cap: 200 },
  ironOre: { id: 'ironOre', label: '铁矿', sellGold: 5, cap: 200 },
  mithrilOre: { id: 'mithrilOre', label: '秘银矿', sellGold: 8, cap: 160 },
  slag: { id: 'slag', label: '渣滓', sellGold: 1, cap: 200 },
  fish: { id: 'fish', label: '鱼', sellGold: 3, cap: 200 },
  meal: { id: 'meal', label: '熟食', sellGold: 8, cap: 400 },
  potion: { id: 'potion', label: '药剂', sellGold: 10, cap: 400 },
  weapon: { id: 'weapon', label: '铜器', sellGold: 12, cap: 500 },
  ironWeapon: { id: 'ironWeapon', label: '铁器', sellGold: 18, cap: 400 },
  mithrilWeapon: { id: 'mithrilWeapon', label: '秘银器', sellGold: 28, cap: 300 },
  blueprint: { id: 'blueprint', label: '图纸', sellGold: 20, cap: 200 },
}

export const ITEM_IDS = Object.keys(ITEM_DEF) as ItemId[]

export type IoRule = { itemId: ItemId; qty: number }

export type StationCategoryDef = {
  id: CategoryId
  label: string
  cycleS: number
  /** 一次吞吐要一次扣光的原料。单料 / n 个 / 多料都用同一数组。 */
  costs: IoRule[]
  /** 主 costs 不够时的替代配方（铜器可用渣滓）。 */
  altCosts?: IoRule[]
  outputs: IoRule[]
  xpPerCycle: number
  unlockLevel: number
}

export type StationDef = {
  id: StationId
  label: string
  neighbors: StationId[]
  categories: StationCategoryDef[]
}

function singleCategory(
  label: string,
  cycleS: number,
  costs: IoRule[],
  outputs: IoRule[],
  extras: Partial<StationCategoryDef> = {},
): StationCategoryDef[] {
  return [
    {
      id: 'default',
      label,
      cycleS,
      costs,
      outputs,
      xpPerCycle: 1,
      unlockLevel: 1,
      ...extras,
    },
  ]
}

export const STATION_DEF: Record<StationId, StationDef> = {
  woodcutting: {
    id: 'woodcutting',
    label: '伐木',
    neighbors: ['alchemy'],
    categories: singleCategory('木头', 5, [], [{ itemId: 'wood', qty: 1 }]),
  },
  mining: {
    id: 'mining',
    label: '采矿',
    neighbors: ['forging'],
    categories: [
      {
        id: 'copper',
        label: '铜矿',
        cycleS: 5,
        costs: [],
        outputs: [{ itemId: 'ore', qty: 1 }],
        xpPerCycle: 1,
        unlockLevel: 1,
      },
      {
        id: 'iron',
        label: '铁矿',
        cycleS: 6,
        costs: [],
        outputs: [{ itemId: 'ironOre', qty: 1 }],
        xpPerCycle: 2,
        unlockLevel: 5,
      },
      {
        id: 'mithril',
        label: '秘银矿',
        cycleS: 7,
        costs: [],
        outputs: [{ itemId: 'mithrilOre', qty: 1 }],
        xpPerCycle: 3,
        unlockLevel: 10,
      },
    ],
  },
  alchemy: {
    id: 'alchemy',
    label: '炼金',
    neighbors: ['forging', 'woodcutting'],
    categories: singleCategory(
      '药剂',
      10,
      [{ itemId: 'wood', qty: 1 }],
      [
        { itemId: 'potion', qty: 1 },
        { itemId: 'slag', qty: 1 },
      ],
    ),
  },
  fishing: {
    id: 'fishing',
    label: '钓鱼',
    neighbors: ['cooking'],
    categories: singleCategory('鱼', 6, [], [{ itemId: 'fish', qty: 1 }]),
  },
  cooking: {
    id: 'cooking',
    label: '烹饪',
    neighbors: ['fishing'],
    categories: singleCategory('熟食', 7, [{ itemId: 'fish', qty: 1 }], [{ itemId: 'meal', qty: 1 }]),
  },
  forging: {
    id: 'forging',
    label: '锻造',
    neighbors: ['mining', 'alchemy'],
    categories: [
      {
        id: 'copper',
        label: '铜器',
        cycleS: 8,
        costs: [{ itemId: 'ore', qty: 1 }],
        altCosts: [{ itemId: 'slag', qty: 1 }],
        outputs: [{ itemId: 'weapon', qty: 1 }],
        xpPerCycle: 1,
        unlockLevel: 1,
      },
      {
        id: 'iron',
        label: '铁器',
        cycleS: 9,
        costs: [
          { itemId: 'ironOre', qty: 1 },
          { itemId: 'wood', qty: 1 },
        ],
        outputs: [{ itemId: 'ironWeapon', qty: 1 }],
        xpPerCycle: 2,
        unlockLevel: 5,
      },
      {
        id: 'mithril',
        label: '秘银器',
        cycleS: 10,
        costs: [
          { itemId: 'mithrilOre', qty: 1 },
          { itemId: 'wood', qty: 2 },
        ],
        outputs: [{ itemId: 'mithrilWeapon', qty: 1 }],
        xpPerCycle: 3,
        unlockLevel: 10,
      },
    ],
  },
}

export const STATION_IDS = Object.keys(STATION_DEF) as StationId[]

/** 升到下一等级所需 XP：round(100 * 1.45^(L-1))，L>=1。 */
export const XP_TO_NEXT_BASE = 100
export const XP_TO_NEXT_GROWTH = 1.45

export function xpToNextLevel(level: number): number {
  const safe = Math.max(1, Math.floor(level))
  return Math.round(XP_TO_NEXT_BASE * Math.pow(XP_TO_NEXT_GROWTH, safe - 1))
}

/** 从 Lv1 升到 target 的累计 XP（不含当前等级内进度）。Lv5 = 760。 */
export function xpToReachLevel(level: number): number {
  const target = Math.max(1, Math.floor(level))
  let total = 0
  for (let current = 1; current < target; current++) total += xpToNextLevel(current)
  return total
}

export function stationCategories(stationId: StationId): StationCategoryDef[] {
  return STATION_DEF[stationId].categories
}

export function defaultCategory(stationId: StationId): StationCategoryDef {
  return STATION_DEF[stationId].categories[0]
}

export function findCategory(stationId: StationId, categoryId: CategoryId): StationCategoryDef | undefined {
  return STATION_DEF[stationId].categories.find((c) => c.id === categoryId)
}

/** 主界面：采矿→锻造、钓鱼→烹饪、伐木（产木可卖）。炼金仍骨架。 */
export const PLAYABLE_CHAINS: StationId[][] = [
  ['mining', 'forging'],
  ['fishing', 'cooking'],
  ['woodcutting'],
]
export const PLAYABLE_STATION_IDS: StationId[] = PLAYABLE_CHAINS.flat()
export const SKELETON_STATION_IDS: StationId[] = ['alchemy']
/** 卖货整批换金。含高阶兵器；偶遇敌人第一期仍收基础 weapon / 熟食。 */
export const SELLABLE_GOODS: ItemId[] = ['weapon', 'ironWeapon', 'mithrilWeapon', 'meal']

/** 当铺报价相对卖货价。略低，至少 1 金。 */
export const PAWN_RATE = 0.75
/** 收购单价相对卖货价。高于当铺，略高于银行单卖。 */
export const BULK_BUY_RATE = 1.15

export function pawnUnitGold(itemId: ItemId): number {
  return Math.max(1, Math.floor(ITEM_DEF[itemId].sellGold * PAWN_RATE))
}

export function bulkUnitGold(itemId: ItemId): number {
  return Math.max(pawnUnitGold(itemId) + 1, Math.round(ITEM_DEF[itemId].sellGold * BULK_BUY_RATE))
}

export const BANK_ROWS: ItemId[][] = [
  ['ore', 'ironOre', 'mithrilOre'],
  ['weapon', 'ironWeapon', 'mithrilWeapon'],
  ['fish', 'meal'],
  ['wood', 'slag', 'potion', 'blueprint'],
]

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
