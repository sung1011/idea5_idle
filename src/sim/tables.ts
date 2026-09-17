import type {
  Affix,
  CategoryId,
  ClassId,
  DeprecatedStationId,
  QualityTier,
  WorkerQualityId,
  EffectInstance,
  FisheryTier,
  FishingCatchOutcome,
  ItemId,
  ProductionBuff,
  StationId,
  StationKind,
  ToolTypeId,
} from './types'

export const DAY_LENGTH_S = 24 * 60
export const OFFLINE_CAP_S = 8 * 60 * 60

export const START_GOLD = 80
/** 高级代币占位。新档 0，本轮没有获得途径。 */
export const START_DIAMONDS = 0
export const RECRUIT_COST = 15

/** 每站派驻上限。第 3 人派入失败；旧档超出的人 hydrate 撤到休息。 */
export const STATION_WORKER_CAP = 2
/** 同站堆人：speed = (1 / cycleS) * stackFactor(n) * 冲突倍率。玩法 n≤2。 */
export const STACK_LINEAR = 1

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
  roast: { id: 'roast', label: '烤肉', sellGold: 10 },
  stew: { id: 'stew', label: '香料炖', sellGold: 14 },
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
  /** 已废：旧共振邻接。结算不再读。 */
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
    neighbors: [],
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
    neighbors: [],
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
    neighbors: [],
    categories: [
      {
        id: 'copper',
        label: '野猪',
        cycleS: 24,
        costs: [],
        outputs: [{ itemId: 'meat', qty: 1 }],
        xpPerCycle: 1,
        unlockLevel: 1,
      },
      {
        id: 'iron',
        label: '狼',
        cycleS: 24,
        costs: [],
        outputs: [
          { itemId: 'meat', qty: 1 },
          { itemId: 'tooth', qty: 1 },
        ],
        xpPerCycle: 2,
        unlockLevel: 5,
      },
      {
        id: 'mithril',
        label: '鹿',
        cycleS: 24,
        costs: [],
        outputs: [
          { itemId: 'meat', qty: 1 },
          { itemId: 'blood', qty: 1 },
          { itemId: 'eye', qty: 1 },
        ],
        xpPerCycle: 3,
        unlockLevel: 10,
      },
    ],
  },
  cooking: {
    id: 'cooking',
    label: '烹饪',
    kind: 'craft',
    neighbors: [],
    categories: [
      {
        id: 'copper',
        label: '烤鱼',
        cycleS: 28,
        costs: [{ itemId: 'fish', qty: 1 }],
        outputs: [{ itemId: 'meal', qty: 1 }],
        xpPerCycle: 1,
        unlockLevel: 1,
      },
      {
        id: 'iron',
        label: '烤肉',
        cycleS: 28,
        costs: [{ itemId: 'meat', qty: 1 }],
        outputs: [{ itemId: 'roast', qty: 1 }],
        xpPerCycle: 1,
        unlockLevel: 1,
      },
      {
        id: 'mithril',
        label: '香料炖',
        cycleS: 32,
        costs: [
          { itemId: 'meat', qty: 1 },
          { itemId: 'spice', qty: 1 },
        ],
        altCosts: [
          { itemId: 'fish', qty: 1 },
          { itemId: 'spice', qty: 1 },
        ],
        outputs: [{ itemId: 'stew', qty: 1 }],
        xpPerCycle: 2,
        unlockLevel: 5,
      },
    ],
  },
  herbalism: {
    id: 'herbalism',
    label: '采药',
    kind: 'gather',
    neighbors: [],
    categories: singleCategory('草', 20, [], [{ itemId: 'herb', qty: 1 }]),
  },
  alchemy: {
    id: 'alchemy',
    label: '炼金',
    kind: 'craft',
    neighbors: [],
    categories: singleCategory('药剂', 40, [{ itemId: 'herb', qty: 1 }], [{ itemId: 'potion', qty: 1 }]),
  },
  fishing: {
    id: 'fishing',
    label: '钓鱼',
    kind: 'gather',
    neighbors: [],
    categories: [
      {
        id: 'copper',
        label: '初级渔场',
        cycleS: 28,
        costs: [],
        outputs: [{ itemId: 'fish', qty: 1 }],
        xpPerCycle: 1,
        unlockLevel: 1,
      },
      {
        id: 'iron',
        label: '中级渔场',
        cycleS: 32,
        costs: [],
        outputs: [{ itemId: 'fish', qty: 1 }],
        xpPerCycle: 2,
        unlockLevel: 5,
      },
      {
        id: 'mithril',
        label: '高级渔场',
        cycleS: 36,
        costs: [],
        outputs: [{ itemId: 'fish', qty: 1 }],
        xpPerCycle: 3,
        unlockLevel: 10,
      },
    ],
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

export type MiningCategoryId = 'copper' | 'iron' | 'mithril'

export function isMiningCategoryId(id: CategoryId): id is MiningCategoryId {
  return id === 'copper' || id === 'iron' || id === 'mithril'
}

export function asMiningCategoryId(id: CategoryId): MiningCategoryId {
  return isMiningCategoryId(id) ? id : 'copper'
}

/** 矿节点 HP / 恢复。挖空后按 recoverS 游戏秒恢复。 */
export const MINING_NODE_DEF: Record<MiningCategoryId, MiningNodeDef> = {
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

export const FISHERY_TIER_RANK: Record<FisheryTier, number> = {
  beginner: 1,
  mid: 2,
  high: 3,
}

export function categoryToFisheryTier(categoryId: CategoryId): FisheryTier {
  if (categoryId === 'iron') return 'mid'
  if (categoryId === 'mithril') return 'high'
  return 'beginner'
}

/** 渔场 × 品阶掉落（含空杆）。结算时再按 fisheryTier 墙过滤。 */
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

/** 猎物遇险率。周期结束掷骰，遇险非战斗。 */
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
      { itemId: 'eye', qty: 1 },
    ],
  },
]

export const HUNTING_CATEGORY_PREY: Record<CategoryId, string> = {
  copper: 'boar',
  iron: 'wolf',
  mithril: 'stag',
  default: 'boar',
}

/** 遇险：掉本周期产出 + 短暂停手；有熟食则再耗 1 份。无战斗。 */
export const HUNTING_HAZARD_PAUSE_S = 8
export const HUNTING_HAZARD_CONSUME: IoRule = { itemId: 'meal', qty: 1 }

export function huntingPreyByCategory(categoryId: CategoryId): HuntingPreyDef {
  const id = HUNTING_CATEGORY_PREY[categoryId] ?? 'boar'
  return HUNTING_PREY_TABLE.find((row) => row.id === id) ?? HUNTING_PREY_TABLE[0]
}

export type HerbalismDropWeight = {
  itemId: ItemId
  weight: number
}

/** 采药权重：不允许空采。 */
export const HERBALISM_DROP_TABLE: HerbalismDropWeight[] = [
  { itemId: 'herb', weight: 70 },
  { itemId: 'spice', weight: 30 },
]

/** 炼金一次扣光其中一组：草或猎副产。产物仍是占位 `potion`。 */
export const ALCHEMY_COST_OPTIONS: IoRule[][] = [
  [{ itemId: 'herb', qty: 1 }],
  [{ itemId: 'blood', qty: 1 }],
  [{ itemId: 'tooth', qty: 1 }],
  [{ itemId: 'eye', qty: 1 }],
]

export type AlchemyInputId = 'herb' | 'blood' | 'tooth' | 'eye'

export function isAlchemyInputId(id: unknown): id is AlchemyInputId {
  return id === 'herb' || id === 'blood' || id === 'tooth' || id === 'eye'
}

export function isPotionItemId(id: unknown): id is 'potion' {
  return id === 'potion'
}

/** 锻造软失败率。周期走完后掷骰。 */
export const FORGING_SOFT_FAIL_CHANCE: Record<CategoryId, number> = {
  copper: 0.1,
  iron: 0.15,
  mithril: 0.2,
  default: 0,
}

/** 软失败扣料比例；不足 1 按 1。铜档 1 矿失败也扣 1。 */
export const FORGING_SOFT_FAIL_TAKE_RATIO = 0.5
/** 软失败 XP 相对本档 xpPerCycle；至少 1。 */
export const FORGING_SOFT_FAIL_XP_MUL = 0.5

export const EFFECT_ID = {
  prodSpeed: 'prodSpeed',
  extraOutput: 'extraOutput',
  cycleShorten: 'cycleShorten',
} as const

export type ToolItemId = 'tool' | 'ironTool' | 'mithrilTool'

export type ToolTypeDef = {
  id: ToolTypeId
  label: string
  matchStationId: StationId
}

/** 锅 / 瓶架等按表匹配制造站；采集站也各有对应类型。 */
export const TOOL_TYPE_DEF: Record<ToolTypeId, ToolTypeDef> = {
  pick: { id: 'pick', label: '镐', matchStationId: 'mining' },
  hammer: { id: 'hammer', label: '锤', matchStationId: 'forging' },
  spear: { id: 'spear', label: '猎具', matchStationId: 'hunting' },
  pot: { id: 'pot', label: '锅', matchStationId: 'cooking' },
  sickle: { id: 'sickle', label: '镰', matchStationId: 'herbalism' },
  rack: { id: 'rack', label: '瓶架', matchStationId: 'alchemy' },
  rod: { id: 'rod', label: '竿', matchStationId: 'fishing' },
}

export const TOOL_TYPE_IDS = Object.keys(TOOL_TYPE_DEF) as ToolTypeId[]

export function isToolTypeId(id: unknown): id is ToolTypeId {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(TOOL_TYPE_DEF, id)
}

export function toolTypeByStation(stationId: StationId): ToolTypeId {
  const found = TOOL_TYPE_IDS.find((id) => TOOL_TYPE_DEF[id].matchStationId === stationId)
  return found ?? 'pick'
}

export type ToolDef = {
  itemId: ToolItemId
  /** hydrate / 旧档缺 match 时的回落，不表示只能装这一站。 */
  matchStationId: StationId
  affixes: Affix[]
  effects: EffectInstance[]
  /** T1 无词条只加速度；T2+ 至少 2 种 effectId。 */
  prodSpeed: number
}

function toolEffects(prodSpeed: number, affixes: Affix[]): EffectInstance[] {
  return [
    { effectId: EFFECT_ID.prodSpeed, value: prodSpeed, source: 'tool' },
    ...affixes.map((affix) => ({ effectId: affix.effectId, value: affix.value, source: 'tool' as const })),
  ]
}

/** T1 只加速度；T2+ 额外产出 + 缩短时间，常驻被动，不占食物 Buff 栏。 */
export const TOOL_DEF: Record<ToolItemId, ToolDef> = {
  tool: {
    itemId: 'tool',
    matchStationId: 'mining',
    prodSpeed: 1.25,
    affixes: [],
    effects: toolEffects(1.25, []),
  },
  ironTool: {
    itemId: 'ironTool',
    matchStationId: 'hunting',
    prodSpeed: 1.2,
    affixes: [
      { affixId: 'yield', effectId: EFFECT_ID.extraOutput, value: 1 },
      { affixId: 'haste', effectId: EFFECT_ID.cycleShorten, value: 0.2 },
    ],
    effects: toolEffects(1.2, [
      { affixId: 'yield', effectId: EFFECT_ID.extraOutput, value: 1 },
      { affixId: 'haste', effectId: EFFECT_ID.cycleShorten, value: 0.2 },
    ]),
  },
  mithrilTool: {
    itemId: 'mithrilTool',
    matchStationId: 'fishing',
    prodSpeed: 1.3,
    affixes: [
      { affixId: 'bounty', effectId: EFFECT_ID.extraOutput, value: 1 },
      { affixId: 'swift', effectId: EFFECT_ID.cycleShorten, value: 0.3 },
    ],
    effects: toolEffects(1.3, [
      { affixId: 'bounty', effectId: EFFECT_ID.extraOutput, value: 1 },
      { affixId: 'swift', effectId: EFFECT_ID.cycleShorten, value: 0.3 },
    ]),
  },
}

export const TOOL_ITEM_IDS = Object.keys(TOOL_DEF) as ToolItemId[]

export function isToolItemId(id: unknown): id is ToolItemId {
  return id === 'tool' || id === 'ironTool' || id === 'mithrilTool'
}

export type FoodItemId = 'meal' | 'roast' | 'stew'

/** 食物 → 生产 Buff。装槽后续期 / 换食覆盖 / 可手动吃 1。 */
export const FOOD_BUFF_DEF: Record<FoodItemId, ProductionBuff> = {
  meal: { effectId: EFFECT_ID.prodSpeed, mul: 1.15, durationS: 180 },
  roast: { effectId: EFFECT_ID.extraOutput, mul: 1, durationS: 180 },
  stew: { effectId: EFFECT_ID.prodSpeed, mul: 1.35, durationS: 240 },
}

export const FOOD_ITEM_IDS = Object.keys(FOOD_BUFF_DEF) as FoodItemId[]

export function isFoodItemId(id: unknown): id is FoodItemId {
  return id === 'meal' || id === 'roast' || id === 'stew'
}

export function foodBuffDef(itemId: ItemId): ProductionBuff | undefined {
  return isFoodItemId(itemId) ? FOOD_BUFF_DEF[itemId] : undefined
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
/** 七站已全部上主列。保留空表以免旧 UI 引用炸掉。 */
export const SKELETON_STATION_IDS: StationId[] = []

function pushUniqueItem(list: ItemId[], itemId: ItemId | undefined): void {
  if (!itemId || list.includes(itemId)) return
  list.push(itemId)
}

export type StationRelatedItems = {
  costs: ItemId[]
  outputs: ItemId[]
}

/**
 * 该站产出 / 消耗相关物品（给 leftover 归类用，不是站卡常驻列表）。
 * 只从表里的 `costs` / `altCosts` / `outputs` 以及掉落表、`ALCHEMY_COST_OPTIONS` 归并。
 */
export function stationRelatedItems(stationId: StationId): StationRelatedItems {
  const costs: ItemId[] = []
  const outputs: ItemId[] = []
  for (const cat of STATION_DEF[stationId].categories) {
    for (const io of cat.costs) pushUniqueItem(costs, io.itemId)
    for (const io of cat.altCosts ?? []) pushUniqueItem(costs, io.itemId)
    for (const io of cat.outputs) pushUniqueItem(outputs, io.itemId)
  }
  if (stationId === 'alchemy') {
    for (const rules of ALCHEMY_COST_OPTIONS) {
      for (const io of rules) pushUniqueItem(costs, io.itemId)
    }
  }
  if (stationId === 'fishing') {
    for (const rows of Object.values(FISHING_DROP_TABLE)) {
      for (const row of rows) pushUniqueItem(outputs, row.itemId)
    }
  }
  if (stationId === 'herbalism') {
    for (const row of HERBALISM_DROP_TABLE) pushUniqueItem(outputs, row.itemId)
  }
  if (stationId === 'hunting') {
    for (const prey of HUNTING_PREY_TABLE) {
      for (const io of prey.outputs) pushUniqueItem(outputs, io.itemId)
    }
  }
  if (stationId === 'forging') pushUniqueItem(outputs, 'blueprint')
  return { costs, outputs }
}

/** 不挂在任一可玩站上的旧物（木头 / 搁置武器等）。有货时工坊页脚展示。 */
export function leftoverStockItems(): ItemId[] {
  const used = new Set<ItemId>()
  for (const id of PLAYABLE_STATION_IDS) {
    const related = stationRelatedItems(id)
    for (const itemId of related.costs) used.add(itemId)
    for (const itemId of related.outputs) used.add(itemId)
  }
  return ITEM_IDS.filter((id) => !used.has(id))
}

/** 整批换金（sim / 调试）。主界面已撤卖货；去武器，只收工具 / 烹饪食物。 */
export const SELLABLE_GOODS: ItemId[] = [
  'tool',
  'ironTool',
  'mithrilTool',
  'meal',
  'roast',
  'stew',
]

/** 当铺报价相对 `sellGold`。略低，至少 1 金。 */
export const PAWN_RATE = 0.75
/** 收购单价相对 `sellGold`。高于当铺。 */
export const BULK_BUY_RATE = 1.15

export function pawnUnitGold(itemId: ItemId): number {
  return Math.max(1, Math.floor(ITEM_DEF[itemId].sellGold * PAWN_RATE))
}

export function bulkUnitGold(itemId: ItemId): number {
  return Math.max(pawnUnitGold(itemId) + 1, Math.round(ITEM_DEF[itemId].sellGold * BULK_BUY_RATE))
}

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
  miner: '矿工',
  fisher: '渔夫',
  hunter: '猎手',
  cook: '厨子',
  herbalist: '药农',
  smith: '铁匠',
  alchemist: '炼金师',
  steward: '管事',
  knight: '骑士',
}

export const CLASS_IDS = Object.keys(CLASS_LABEL) as ClassId[]

/** 职业最低可用品质，按新表 1～10。第 1 档仍是基础三职业。 */
export const CLASS_MIN_QUALITY: Record<ClassId, QualityTier> = {
  laborer: 1,
  artisan: 1,
  wanderer: 1,
  miner: 2,
  fisher: 3,
  hunter: 4,
  cook: 5,
  herbalist: 6,
  smith: 7,
  alchemist: 8,
  steward: 9,
  knight: 10,
}

export function isClassId(id: unknown): id is ClassId {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(CLASS_LABEL, id)
}

export const QUALITY_MIN = 1 as const
export const QUALITY_MAX = 10 as const
export const QUALITY_TIERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const satisfies readonly QualityTier[]

export type WorkerQualityDef = {
  tier: QualityTier
  id: WorkerQualityId
  label: string
  color: string
}

/**
 * 工人品质 10 档。白为首，粉插在橙后红前，无灰。
 * 档 1 抽人默认；档 10 满档不能再合成。
 */
export const WORKER_QUALITY_TABLE: Record<QualityTier, WorkerQualityDef> = {
  1: { tier: 1, id: 'white', label: '白', color: '#c4bba8' },
  2: { tier: 2, id: 'green', label: '绿', color: '#3e9a2a' },
  3: { tier: 3, id: 'blue', label: '蓝', color: '#3a7ad9' },
  4: { tier: 4, id: 'cyan', label: '青', color: '#1aa6a6' },
  5: { tier: 5, id: 'purple', label: '紫', color: '#8a4ecf' },
  6: { tier: 6, id: 'orange', label: '橙', color: '#e67a12' },
  7: { tier: 7, id: 'pink', label: '粉', color: '#ff7aad' },
  8: { tier: 8, id: 'red', label: '红', color: '#d43a3a' },
  9: { tier: 9, id: 'gold', label: '金', color: '#d4a017' },
  10: { tier: 10, id: 'rainbow', label: '彩', color: '#e83e8c' },
}

/** 当前工人色表版本。缺字段或小于此值视为旧灰表。 */
export const WORKER_QUALITY_REV = 2

/**
 * 旧灰表 1灰 2白 3绿 4蓝 5青 6紫 7橙 8红 9金 10彩
 * → 新表 1白 2绿 3蓝 4青 5紫 6橙 7粉 8红 9金 10彩。
 * 旧灰/旧白都并到新白；红/金/彩数字不变；新粉无人自然拥有。
 */
const GRAY_TABLE_TO_CURRENT: Record<QualityTier, QualityTier> = {
  1: 1,
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  7: 6,
  8: 8,
  9: 9,
  10: 10,
}

export function isQualityTier(value: unknown): value is QualityTier {
  return typeof value === 'number' && Number.isInteger(value) && value >= QUALITY_MIN && value <= QUALITY_MAX
}

/** 缺字段 / 脏值补最低档（白）。不在这里迁旧灰表，避免已是新表的档位被再映射。 */
export function hydrateQualityTier(raw: unknown): QualityTier {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return QUALITY_MIN
  const n = Math.floor(raw)
  return isQualityTier(n) ? n : QUALITY_MIN
}

export function needsGrayQualityMigration(rev: unknown): boolean {
  return typeof rev !== 'number' || !Number.isInteger(rev) || rev < WORKER_QUALITY_REV
}

export function migrateQualityTierFromGrayTable(tier: QualityTier): QualityTier {
  return GRAY_TABLE_TO_CURRENT[tier]
}

export function workerQualityDef(tier: QualityTier): WorkerQualityDef {
  return WORKER_QUALITY_TABLE[tier]
}

export function classPoolForQuality(tier: QualityTier): ClassId[] {
  return CLASS_IDS.filter((id) => CLASS_MIN_QUALITY[id] <= tier)
}

export function pickClassFromPool(pool: ClassId[], roll: number): ClassId {
  if (!pool.length) return 'laborer'
  const i = Math.min(pool.length - 1, Math.max(0, Math.floor(roll * pool.length)))
  return pool[i]
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
 * 站点每秒进度（人数项，不含冲突）。
 * speed = (1 / cycleS) * n
 * 1 人采矿 cycleS=20 → 0.05/s，20 秒出 1 矿
 * 3 人采矿 → 0.15/s，同等时间 3 倍吞吐
 * 玩法满 2 人时 currentSpeed 再乘 stationConflictMul
 */
export function stationSpeed(n: number, cycleS: number): number {
  if (n <= 0 || cycleS <= 0) return 0
  const base = 1 / cycleS
  return base * stackFactor(n)
}
