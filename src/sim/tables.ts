import type {
  Affix,
  CategoryId,
  ClassId,
  DeprecatedStationId,
  EffectInstance,
  FisheryTier,
  FishingCatchOutcome,
  ItemId,
  ProductionBuff,
  StationId,
  StationKind,
} from './types'

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
}

export const ITEM_DEF: Record<ItemId, ItemDef> = {
  wood: { id: 'wood', label: '木头', sellGold: 2 },
  ore: { id: 'ore', label: '铜矿', sellGold: 3 },
  ironOre: { id: 'ironOre', label: '铁矿', sellGold: 5 },
  mithrilOre: { id: 'mithrilOre', label: '秘银矿', sellGold: 8 },
  slag: { id: 'slag', label: '渣滓', sellGold: 1 },
  fish: { id: 'fish', label: '鱼', sellGold: 3 },
  junk: { id: 'junk', label: '杂物', sellGold: 1 },
  meal: { id: 'meal', label: '熟食', sellGold: 8 },
  potion: { id: 'potion', label: '药剂', sellGold: 10 },
  weapon: { id: 'weapon', label: '铜器', sellGold: 12 },
  ironWeapon: { id: 'ironWeapon', label: '铁器', sellGold: 18 },
  mithrilWeapon: { id: 'mithrilWeapon', label: '秘银器', sellGold: 28 },
  blueprint: { id: 'blueprint', label: '图纸', sellGold: 20 },
  meat: { id: 'meat', label: '肉', sellGold: 4 },
  blood: { id: 'blood', label: '血', sellGold: 3 },
  tooth: { id: 'tooth', label: '牙', sellGold: 3 },
  eye: { id: 'eye', label: '眼', sellGold: 4 },
  herb: { id: 'herb', label: '草', sellGold: 2 },
  spice: { id: 'spice', label: '香料', sellGold: 3 },
  tool: { id: 'tool', label: '初级工具', sellGold: 12 },
  ironTool: { id: 'ironTool', label: '中阶工具', sellGold: 18 },
  mithrilTool: { id: 'mithrilTool', label: '高阶工具', sellGold: 28 },
}

export const ITEM_IDS = Object.keys(ITEM_DEF) as ItemId[]

export type IoRule = { itemId: ItemId; qty: number }

export type StationCategoryDef = {
  id: CategoryId
  label: string
  cycleS: number
  /** 一次吞吐要一次扣光的原料。单料 / n 个 / 多料都用同一数组。 */
  costs: IoRule[]
  /** 主 costs 不够时的替代配方（铜档工具可用渣滓）。 */
  altCosts?: IoRule[]
  outputs: IoRule[]
  xpPerCycle: number
  unlockLevel: number
}

export type StationDef = {
  id: StationId
  label: string
  kind: StationKind
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
  mining: {
    id: 'mining',
    label: '采矿',
    kind: 'gather',
    neighbors: ['forging'],
    categories: [
      {
        id: 'copper',
        label: '铜矿',
        cycleS: 20,
        costs: [],
        outputs: [{ itemId: 'ore', qty: 1 }],
        xpPerCycle: 1,
        unlockLevel: 1,
      },
      {
        id: 'iron',
        label: '铁矿',
        cycleS: 24,
        costs: [],
        outputs: [{ itemId: 'ironOre', qty: 1 }],
        xpPerCycle: 2,
        unlockLevel: 5,
      },
      {
        id: 'mithril',
        label: '秘银矿',
        cycleS: 28,
        costs: [],
        outputs: [{ itemId: 'mithrilOre', qty: 1 }],
        xpPerCycle: 3,
        unlockLevel: 10,
      },
    ],
  },
  forging: {
    id: 'forging',
    label: '锻造',
    kind: 'craft',
    neighbors: ['mining'],
    categories: [
      {
        id: 'copper',
        label: '初级工具',
        cycleS: 32,
        costs: [{ itemId: 'ore', qty: 1 }],
        altCosts: [{ itemId: 'slag', qty: 1 }],
        outputs: [{ itemId: 'tool', qty: 1 }],
        xpPerCycle: 1,
        unlockLevel: 1,
      },
      {
        id: 'iron',
        label: '中阶工具',
        cycleS: 36,
        costs: [{ itemId: 'ironOre', qty: 1 }],
        outputs: [{ itemId: 'ironTool', qty: 1 }],
        xpPerCycle: 2,
        unlockLevel: 5,
      },
      {
        id: 'mithril',
        label: '高阶工具',
        cycleS: 40,
        costs: [{ itemId: 'mithrilOre', qty: 1 }],
        outputs: [{ itemId: 'mithrilTool', qty: 1 }],
        xpPerCycle: 3,
        unlockLevel: 10,
      },
    ],
  },
  hunting: {
    id: 'hunting',
    label: '狩猎',
    kind: 'gather',
    neighbors: ['cooking'],
    categories: singleCategory('肉', 24, [], [{ itemId: 'meat', qty: 1 }]),
  },
  cooking: {
    id: 'cooking',
    label: '烹饪',
    kind: 'craft',
    neighbors: ['fishing', 'hunting'],
    categories: singleCategory('熟食', 28, [{ itemId: 'fish', qty: 1 }], [{ itemId: 'meal', qty: 1 }]),
  },
  herbalism: {
    id: 'herbalism',
    label: '采药',
    kind: 'gather',
    neighbors: ['alchemy'],
    categories: singleCategory('草', 20, [], [{ itemId: 'herb', qty: 1 }]),
  },
  alchemy: {
    id: 'alchemy',
    label: '炼金',
    kind: 'craft',
    neighbors: ['herbalism'],
    categories: singleCategory('药剂', 40, [{ itemId: 'herb', qty: 1 }], [{ itemId: 'potion', qty: 1 }]),
  },
  fishing: {
    id: 'fishing',
    label: '钓鱼',
    kind: 'gather',
    neighbors: ['cooking'],
    categories: singleCategory('鱼', 24, [], [{ itemId: 'fish', qty: 1 }]),
  },
}

export const STATION_IDS = Object.keys(STATION_DEF) as StationId[]

/** 旧伐木。新档不入表，hydrate 撤派。 */
export const DEPRECATED_STATION_IDS: readonly DeprecatedStationId[] = ['woodcutting']
export const DEPRECATED_STATION_LABEL: Record<DeprecatedStationId, string> = {
  woodcutting: '伐木',
}

/** 旧档 / 文案别称 → 七站 id。`smithing` 不是独立站。 */
export const STATION_ID_ALIASES: Record<string, StationId> = {
  smithing: 'forging',
}

export function isStationId(id: unknown): id is StationId {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(STATION_DEF, id)
}

export function isDeprecatedStationId(id: unknown): id is DeprecatedStationId {
  return id === 'woodcutting'
}

export function resolveStationId(id: unknown): StationId | null {
  if (isStationId(id)) return id
  if (typeof id === 'string' && Object.prototype.hasOwnProperty.call(STATION_ID_ALIASES, id)) {
    return STATION_ID_ALIASES[id]
  }
  return null
}

export type MiningNodeDef = {
  categoryId: CategoryId
  nodeHpMax: number
  recoverS: number
}

/** 矿节点 HP / 恢复占位。第 2 期才结算挖空。 */
export const MINING_NODE_DEF: Record<'copper' | 'iron' | 'mithril', MiningNodeDef> = {
  copper: { categoryId: 'copper', nodeHpMax: 20, recoverS: 60 },
  iron: { categoryId: 'iron', nodeHpMax: 24, recoverS: 90 },
  mithril: { categoryId: 'mithril', nodeHpMax: 28, recoverS: 120 },
}

export function miningNodeDef(categoryId: CategoryId): MiningNodeDef {
  if (categoryId === 'iron' || categoryId === 'mithril') return MINING_NODE_DEF[categoryId]
  return MINING_NODE_DEF.copper
}

export type FishingDropWeight = {
  outcome: FishingCatchOutcome
  weight: number
  catchTier?: FisheryTier
  itemId?: ItemId
}

/** 渔场 × 品阶掉落（含空杆权重）。第 2 期才按权重结算。 */
export const FISHING_DROP_TABLE: Record<FisheryTier, FishingDropWeight[]> = {
  beginner: [
    { outcome: 'empty', weight: 40 },
    { outcome: 'fish', weight: 50, catchTier: 'beginner', itemId: 'fish' },
    { outcome: 'junk', weight: 10, catchTier: 'beginner', itemId: 'junk' },
  ],
  mid: [
    { outcome: 'empty', weight: 35 },
    { outcome: 'fish', weight: 40, catchTier: 'beginner', itemId: 'fish' },
    { outcome: 'fish', weight: 15, catchTier: 'mid', itemId: 'fish' },
    { outcome: 'junk', weight: 10, itemId: 'junk' },
  ],
  high: [
    { outcome: 'empty', weight: 30 },
    { outcome: 'fish', weight: 30, catchTier: 'beginner', itemId: 'fish' },
    { outcome: 'fish', weight: 20, catchTier: 'mid', itemId: 'fish' },
    { outcome: 'fish', weight: 10, catchTier: 'high', itemId: 'fish' },
    { outcome: 'junk', weight: 10, itemId: 'junk' },
  ],
}

export type HuntingPreyDef = {
  id: string
  label: string
  hazardChance: number
  outputs: IoRule[]
}

/** 猎物遇险率占位。第 2 期才做检定。 */
export const HUNTING_PREY_TABLE: HuntingPreyDef[] = [
  { id: 'boar', label: '野猪', hazardChance: 0.12, outputs: [{ itemId: 'meat', qty: 1 }] },
  {
    id: 'wolf',
    label: '狼',
    hazardChance: 0.22,
    outputs: [
      { itemId: 'meat', qty: 1 },
      { itemId: 'tooth', qty: 1 },
    ],
  },
  {
    id: 'stag',
    label: '鹿',
    hazardChance: 0.08,
    outputs: [
      { itemId: 'meat', qty: 1 },
      { itemId: 'blood', qty: 1 },
    ],
  },
]

export type HerbalismDropWeight = {
  itemId: ItemId
  weight: number
}

/** 采药权重占位：不允许空采。第 2 期才按权重抽。 */
export const HERBALISM_DROP_TABLE: HerbalismDropWeight[] = [
  { itemId: 'herb', weight: 70 },
  { itemId: 'spice', weight: 30 },
]

/** 锻造软失败权重占位。第 3 期才掷骰。 */
export const FORGING_SOFT_FAIL_CHANCE: Record<CategoryId, number> = {
  copper: 0.1,
  iron: 0.15,
  mithril: 0.2,
  default: 0,
}

export const EFFECT_ID = {
  prodSpeed: 'prodSpeed',
} as const

export type ToolItemId = 'tool' | 'ironTool' | 'mithrilTool'

export type ToolDef = {
  itemId: ToolItemId
  matchStationId: StationId
  affixes: Affix[]
  effects: EffectInstance[]
}

/** 工具词条 effectId 占位。第 3 期才装槽生效。 */
export const TOOL_DEF: Record<ToolItemId, ToolDef> = {
  tool: {
    itemId: 'tool',
    matchStationId: 'mining',
    affixes: [],
    effects: [{ effectId: EFFECT_ID.prodSpeed, value: 1.1, source: 'tool' }],
  },
  ironTool: {
    itemId: 'ironTool',
    matchStationId: 'hunting',
    affixes: [{ affixId: 'keen', effectId: EFFECT_ID.prodSpeed, value: 1.2 }],
    effects: [{ effectId: EFFECT_ID.prodSpeed, value: 1.2, source: 'tool' }],
  },
  mithrilTool: {
    itemId: 'mithrilTool',
    matchStationId: 'fishing',
    affixes: [{ affixId: 'tide', effectId: EFFECT_ID.prodSpeed, value: 1.3 }],
    effects: [{ effectId: EFFECT_ID.prodSpeed, value: 1.3, source: 'tool' }],
  },
}

export const TOOL_ITEM_IDS = Object.keys(TOOL_DEF) as ToolItemId[]

export function isToolItemId(id: unknown): id is ToolItemId {
  return id === 'tool' || id === 'ironTool' || id === 'mithrilTool'
}

/** 食物 → 生产 Buff。第 4 期才装槽 / 续期。 */
export const FOOD_BUFF_DEF: Partial<Record<ItemId, ProductionBuff>> = {
  meal: { effectId: EFFECT_ID.prodSpeed, mul: 1.15, durationS: 180 },
}

export function foodBuffDef(itemId: ItemId): ProductionBuff | undefined {
  return FOOD_BUFF_DEF[itemId]
}

/**
 * 升到下一等级所需 XP。
 * 周期 ×4（且不少于 20s）后，再乘 0.175，让前期升到 Lv5 的墙钟比旧周期+旧 XP 大约快 30%。
 * 旧式：round(100 * 1.45^(L-1))；现式再乘 XP_TO_NEXT_SCALE。
 */
export const XP_TO_NEXT_BASE = 100
export const XP_TO_NEXT_GROWTH = 1.45
export const XP_TO_NEXT_SCALE = 0.175

export function xpToNextLevel(level: number): number {
  const safe = Math.max(1, Math.floor(level))
  return Math.max(
    1,
    Math.round(XP_TO_NEXT_BASE * Math.pow(XP_TO_NEXT_GROWTH, safe - 1) * XP_TO_NEXT_SCALE),
  )
}

/** 从 Lv1 升到 target 的累计 XP（不含当前等级内进度）。Lv5 = 133。 */
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

/** 主界面七站：挖矿→锻造、钓鱼/狩猎→烹饪、采药→炼金。伐木已藏。 */
export const PLAYABLE_CHAINS: StationId[][] = [
  ['mining', 'forging'],
  ['fishing', 'hunting', 'cooking'],
  ['herbalism', 'alchemy'],
]
export const PLAYABLE_STATION_IDS: StationId[] = PLAYABLE_CHAINS.flat()
export const SKELETON_STATION_IDS: StationId[] = []
/** 卖货整批换金。旧武器仍可出清；新主产物是工具 / 熟食。 */
export const SELLABLE_GOODS: ItemId[] = [
  'weapon',
  'ironWeapon',
  'mithrilWeapon',
  'tool',
  'ironTool',
  'mithrilTool',
  'meal',
]

/** 当铺报价相对卖货价。略低，至少 1 金。 */
export const PAWN_RATE = 0.75
/** 收购单价相对卖货价。高于当铺，略高于工坊单卖。 */
export const BULK_BUY_RATE = 1.15

export function pawnUnitGold(itemId: ItemId): number {
  return Math.max(1, Math.floor(ITEM_DEF[itemId].sellGold * PAWN_RATE))
}

export function bulkUnitGold(itemId: ItemId): number {
  return Math.max(pawnUnitGold(itemId) + 1, Math.round(ITEM_DEF[itemId].sellGold * BULK_BUY_RATE))
}

export const SUPPLY_ROWS: ItemId[][] = [
  ['ore', 'ironOre', 'mithrilOre'],
  ['tool', 'ironTool', 'mithrilTool'],
  ['weapon', 'ironWeapon', 'mithrilWeapon'],
  ['fish', 'junk', 'meal', 'meat'],
  ['herb', 'spice', 'blood', 'tooth', 'eye'],
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
 * 1 人采矿 cycleS=20 → 0.05/s，20 秒出 1 矿
 * 3 人采矿 → 0.15/s，同等时间 3 倍吞吐
 */
export function stationSpeed(n: number, cycleS: number, resonating = false): number {
  if (n <= 0 || cycleS <= 0) return 0
  const base = 1 / cycleS
  return base * stackFactor(n) * (resonating ? RESONANCE_SPEED_MUL : 1)
}
