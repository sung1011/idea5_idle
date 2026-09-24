import type {
  Affix,
  CategoryId,
  ClassId,
  DeprecatedStationId,
  QualityTier,
  WorkerQualityId,
  EffectInstance,
  ItemId,
  ProductionBuff,
  PotionItemId,
  RuneItemId,
  StationId,
  StationKind,
  StationToolId,
  StationToolIndexCode,
  ToolTypeId,
} from './types'

export const DAY_LENGTH_S = 24 * 60
export const OFFLINE_CAP_S = 8 * 60 * 60

export const START_GOLD = 80
/** 新档钻石。旧档缺字段 hydrate 补这个数；已有字段（含 0）不重灌。 */
export const START_DIAMONDS = 150
/** 新档初始灵感。旧档 hydrate 不改写成这个数。 */
export const START_TECH_POINTS = 20
export const RECRUIT_COST = 12

/** 每站派驻上限。第 3 人派入失败；旧档超出的人 hydrate 撤到休息。 */
export const STATION_WORKER_CAP = 1
/** 同站堆人：speed = (1 / cycleS) * stackFactor(n) * 冲突倍率。玩法 n≤2。 */
export const STACK_LINEAR = 1

/** 每 5 级解锁 1 个新品类：Lv5 第 2 类，Lv10 第 3 类。 */
export const CATEGORY_UNLOCK_EVERY = 5

export type ItemDef = {
  id: ItemId
  label: string
  sellGold: number
  /** 工坊吞吐按产出数量结算的金币；当铺 / 收购仍用 sellGold。 */
  craftGold: number
}

const BASE_ITEM_DEF: Record<Exclude<ItemId, StationToolId>, ItemDef> = {
  wood: { id: 'wood', label: '木头', sellGold: 2, craftGold: 0 },
  ore: { id: 'ore', label: '铜矿', sellGold: 3, craftGold: 0 },
  ironOre: { id: 'ironOre', label: '铁矿', sellGold: 5, craftGold: 1 },
  mithrilOre: { id: 'mithrilOre', label: '秘银矿', sellGold: 8, craftGold: 1 },
  slag: { id: 'slag', label: '渣滓', sellGold: 1, craftGold: 0 },
  fish: { id: 'fish', label: '鱼', sellGold: 3, craftGold: 0 },
  junk: { id: 'junk', label: '杂物', sellGold: 1, craftGold: 0 },
  meal: { id: 'meal', label: '熟食', sellGold: 8, craftGold: 1 },
  roast: { id: 'roast', label: '烤肉', sellGold: 10, craftGold: 2 },
  stew: { id: 'stew', label: '香料炖', sellGold: 14, craftGold: 3 },
  potion: { id: 'potion', label: '药剂', sellGold: 10, craftGold: 2 },
  stim: { id: 'stim', label: '兴奋剂', sellGold: 10, craftGold: 2 },
  salve: { id: 'salve', label: '回春散', sellGold: 8, craftGold: 1 },
  renewSoup: { id: 'renewSoup', label: '续命汤', sellGold: 10, craftGold: 2 },
  brinkSalve: { id: 'brinkSalve', label: '绝境膏', sellGold: 12, craftGold: 2 },
  rushPowder: { id: 'rushPowder', label: '赶工粉', sellGold: 16, craftGold: 3 },
  doubleMist: { id: 'doubleMist', label: '双份雾', sellGold: 12, craftGold: 2 },
  clearMind: { id: 'clearMind', label: '醒神散', sellGold: 10, craftGold: 2 },
  anyPotion: { id: 'anyPotion', label: '任意药剂', sellGold: 8, craftGold: 0 },
  anyRune: { id: 'anyRune', label: '任意符文', sellGold: 8, craftGold: 0 },
  weapon: { id: 'weapon', label: '铜器', sellGold: 12, craftGold: 0 },
  ironWeapon: { id: 'ironWeapon', label: '铁器', sellGold: 18, craftGold: 0 },
  mithrilWeapon: { id: 'mithrilWeapon', label: '秘银器', sellGold: 28, craftGold: 0 },
  blueprint: { id: 'blueprint', label: '图纸', sellGold: 20, craftGold: 0 },
  meat: { id: 'meat', label: '肉', sellGold: 4, craftGold: 1 },
  blood: { id: 'blood', label: '血', sellGold: 3, craftGold: 0 },
  tooth: { id: 'tooth', label: '牙', sellGold: 3, craftGold: 0 },
  eye: { id: 'eye', label: '眼', sellGold: 4, craftGold: 1 },
  herb: { id: 'herb', label: '草', sellGold: 2, craftGold: 0 },
  spice: { id: 'spice', label: '香料', sellGold: 3, craftGold: 1 },
  wildCrystal: { id: 'wildCrystal', label: '荒晶', sellGold: 4, craftGold: 0 },
  runeSharp: { id: 'runeSharp', label: '锋锐', sellGold: 8, craftGold: 2 },
  runeArmor: { id: 'runeArmor', label: '厚甲', sellGold: 8, craftGold: 2 },
  runeBlood: { id: 'runeBlood', label: '血酬', sellGold: 10, craftGold: 2 },
  runeBreak: { id: 'runeBreak', label: '破障', sellGold: 10, craftGold: 2 },
  runeSwift: { id: 'runeSwift', label: '迅击', sellGold: 12, craftGold: 3 },
  runeInsight: { id: 'runeInsight', label: '洞悉', sellGold: 12, craftGold: 3 },
  tool: { id: 'tool', label: '初级工具', sellGold: 12, craftGold: 2 },
  ironTool: { id: 'ironTool', label: '中阶工具', sellGold: 18, craftGold: 2 },
  mithrilTool: { id: 'mithrilTool', label: '高阶工具', sellGold: 28, craftGold: 3 },
}

export function itemCraftGold(itemId: ItemId): number {
  const unit = ITEM_DEF[itemId]?.craftGold
  if (typeof unit !== 'number' || !Number.isFinite(unit) || unit <= 0) return 0
  return Math.floor(unit)
}

export const ITEM_DEF: Record<ItemId, ItemDef> = { ...BASE_ITEM_DEF } as Record<ItemId, ItemDef>

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
        outputs: [
          { itemId: 'ore', qty: 1 },
          { itemId: 'wildCrystal', qty: 1 },
        ],
        xpPerCycle: 1,
        unlockLevel: 1,
      },
      {
        id: 'iron',
        label: '铁矿',
        cycleS: 24,
        costs: [],
        outputs: [
          { itemId: 'ironOre', qty: 1 },
          { itemId: 'wildCrystal', qty: 1 },
        ],
        xpPerCycle: 2,
        unlockLevel: 5,
      },
      {
        id: 'mithril',
        label: '秘银矿',
        cycleS: 28,
        costs: [],
        outputs: [
          { itemId: 'mithrilOre', qty: 1 },
          { itemId: 'wildCrystal', qty: 1 },
        ],
        xpPerCycle: 3,
        unlockLevel: 10,
      },
    ],
  },
  inscription: {
    id: 'inscription',
    label: '铭刻',
    kind: 'craft',
    neighbors: [],
    categories: singleCategory('符文', 32, [{ itemId: 'wildCrystal', qty: 2 }], []),
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
        outputs: [
          { itemId: 'meat', qty: 1 },
          { itemId: 'fish', qty: 1 },
        ],
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
          { itemId: 'fish', qty: 1 },
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
          { itemId: 'fish', qty: 1 },
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
}

export const STATION_IDS = Object.keys(STATION_DEF) as StationId[]

/** 旧伐木 / 钓鱼。新档不入表，hydrate 撤派。 */
export const DEPRECATED_STATION_IDS: readonly DeprecatedStationId[] = ['woodcutting', 'fishing']
export const DEPRECATED_STATION_LABEL: Record<DeprecatedStationId, string> = {
  woodcutting: '伐木',
  fishing: '钓鱼',
}

/** 旧档 / 文案别称 → 现玩法站 id。`forging` / `smithing` 不是独立站。 */
export const STATION_ID_ALIASES: Record<string, StationId> = {
  smithing: 'inscription',
  forging: 'inscription',
  engraving: 'inscription',
}

export function isStationId(id: unknown): id is StationId {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(STATION_DEF, id)
}

export function isDeprecatedStationId(id: unknown): id is DeprecatedStationId {
  return id === 'woodcutting' || id === 'fishing'
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
  copper: { categoryId: 'copper', nodeHpMax: 20, recoverS: 50 },
  iron: { categoryId: 'iron', nodeHpMax: 24, recoverS: 90 },
  mithril: { categoryId: 'mithril', nodeHpMax: 28, recoverS: 120 },
}

export function miningNodeDef(categoryId: CategoryId): MiningNodeDef {
  if (categoryId === 'iron' || categoryId === 'mithril') return MINING_NODE_DEF[categoryId]
  return MINING_NODE_DEF.copper
}

export type HuntingPreyDef = {
  id: string
  label: string
  hazardChance: number
  outputs: IoRule[]
}

/** 猎物遇险率。周期结束掷骰，遇险非战斗。原钓鱼鱼货并入成功捕获。 */
export const HUNTING_PREY_TABLE: HuntingPreyDef[] = [
  {
    id: 'boar',
    label: '野猪',
    hazardChance: 0.12,
    outputs: [
      { itemId: 'meat', qty: 1 },
      { itemId: 'fish', qty: 1 },
    ],
  },
  {
    id: 'wolf',
    label: '狼',
    hazardChance: 0.22,
    outputs: [
      { itemId: 'meat', qty: 1 },
      { itemId: 'fish', qty: 1 },
      { itemId: 'tooth', qty: 1 },
    ],
  },
  {
    id: 'stag',
    label: '鹿',
    hazardChance: 0.08,
    outputs: [
      { itemId: 'meat', qty: 1 },
      { itemId: 'fish', qty: 1 },
      { itemId: 'blood', qty: 1 },
      { itemId: 'eye', qty: 1 },
    ],
  },
]

/** 狩猎成功后的额外掉落：原钓鱼杂物低权并入。 */
export type HuntingSideDropWeight = {
  itemId: ItemId | null
  weight: number
}

export const HUNTING_SIDE_DROP_TABLE: HuntingSideDropWeight[] = [
  { itemId: 'junk', weight: 10 },
  { itemId: null, weight: 90 },
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

/** 炼金一次扣光其中一组：草或猎副产。产物从 7 种药剂池随机出一批。 */
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

export const POTION_ITEM_IDS: readonly PotionItemId[] = [
  'stim',
  'salve',
  'renewSoup',
  'brinkSalve',
  'rushPowder',
  'doubleMist',
  'clearMind',
]

export type PotionBatchRange = { min: number; max: number }

/** 炼金一次成功随机一种，数量落在该区间（含端点）。 */
export const POTION_BATCH_RANGE: Readonly<Record<PotionItemId, PotionBatchRange>> = {
  salve: { min: 8, max: 14 },
  stim: { min: 4, max: 8 },
  renewSoup: { min: 5, max: 10 },
  brinkSalve: { min: 4, max: 8 },
  rushPowder: { min: 2, max: 5 },
  doubleMist: { min: 3, max: 6 },
  clearMind: { min: 3, max: 6 },
}

export const POTION_EFFECT_TEXT: Readonly<Record<PotionItemId, string>> = {
  stim: '在岗工人工作速度 ×1.5，持续 3 分钟',
  salve: '在岗工人立刻回复 10% 最大生命',
  renewSoup: '在岗存活工人每 10 秒回复 5% 最大生命，持续 2 分钟',
  brinkSalve: '在岗：生命 ≤30% 抬到 40% 最大生命，其余立刻回复 5%',
  rushPowder: '随机一个有在岗工人的工位，下一次产出周期缩短 40%',
  doubleMist: '随机一个有在岗工人的工位，下一批成功产出 80% 为 ×2、20% 为 ×3',
  clearMind: '只治疗在岗里最残的 1～2 人：第 1 人回复 35% 最大生命；第 2 人若生命 ≤50% 再回复 20%',
}

export function isPotionItemId(id: unknown): id is PotionItemId {
  return (
    id === 'stim' ||
    id === 'salve' ||
    id === 'renewSoup' ||
    id === 'brinkSalve' ||
    id === 'rushPowder' ||
    id === 'doubleMist' ||
    id === 'clearMind'
  )
}

export const ANY_POTION_ITEM_ID = 'anyPotion' as const
export const ANY_RUNE_ITEM_ID = 'anyRune' as const

export function isAnyPotionNeed(id: unknown): id is typeof ANY_POTION_ITEM_ID {
  return id === ANY_POTION_ITEM_ID
}

export function isAnyRuneNeed(id: unknown): id is typeof ANY_RUNE_ITEM_ID {
  return id === ANY_RUNE_ITEM_ID
}

export function isWildcardNeedId(id: unknown): id is typeof ANY_POTION_ITEM_ID | typeof ANY_RUNE_ITEM_ID {
  return isAnyPotionNeed(id) || isAnyRuneNeed(id)
}

/** 通配订单可扣的具体 SKU。顺序稳定，数量并列时取表内靠前的。 */
export function wildcardPayItems(itemId: ItemId): readonly ItemId[] {
  if (isAnyPotionNeed(itemId)) return POTION_ITEM_IDS
  if (isAnyRuneNeed(itemId)) return RUNE_ITEM_IDS
  return []
}

export function isLegacyPotionItemId(id: unknown): id is 'potion' {
  return id === 'potion'
}

export const RUNE_ITEM_IDS: readonly RuneItemId[] = [
  'runeSharp',
  'runeArmor',
  'runeBlood',
  'runeBreak',
  'runeSwift',
  'runeInsight',
]

export type RuneBatchRange = { min: number; max: number }

export type RuneDef = {
  id: RuneItemId
  label: string
  /** 短效果文案，选人弹层用。 */
  effect: string
  unlockLevel: number
  costs: IoRule[]
  batch: RuneBatchRange
  xpPerCycle: number
}

/** 铭刻配方。随机从已解锁池抽一种。 */
export const RUNE_DEF: Readonly<Record<RuneItemId, RuneDef>> = {
  runeSharp: {
    id: 'runeSharp',
    label: '锋锐',
    effect: '本场造成伤害 ×1.25',
    unlockLevel: 1,
    costs: [{ itemId: 'wildCrystal', qty: 2 }],
    batch: { min: 1, max: 2 },
    xpPerCycle: 1,
  },
  runeArmor: {
    id: 'runeArmor',
    label: '厚甲',
    effect: '本场受到伤害 ×0.75',
    unlockLevel: 1,
    costs: [{ itemId: 'wildCrystal', qty: 2 }],
    batch: { min: 1, max: 2 },
    xpPerCycle: 1,
  },
  runeBlood: {
    id: 'runeBlood',
    label: '血酬',
    effect: '本场结束后该工人额外获得战斗经验（胜负都发）',
    unlockLevel: 5,
    costs: [{ itemId: 'wildCrystal', qty: 2 }],
    batch: { min: 1, max: 2 },
    xpPerCycle: 2,
  },
  runeBreak: {
    id: 'runeBreak',
    label: '破障',
    effect: '命中弱点时额外扣 1 盾',
    unlockLevel: 5,
    costs: [{ itemId: 'wildCrystal', qty: 2 }],
    batch: { min: 1, max: 2 },
    xpPerCycle: 2,
  },
  runeSwift: {
    id: 'runeSwift',
    label: '迅击',
    effect: '本场出手间隔 ×0.85',
    unlockLevel: 10,
    costs: [{ itemId: 'wildCrystal', qty: 3 }],
    batch: { min: 1, max: 1 },
    xpPerCycle: 3,
  },
  runeInsight: {
    id: 'runeInsight',
    label: '洞悉',
    effect: '本场开战多揭示 1 条弱点（多名携带只生效一次）',
    unlockLevel: 10,
    costs: [{ itemId: 'wildCrystal', qty: 3 }],
    batch: { min: 1, max: 1 },
    xpPerCycle: 3,
  },
}

export const RUNE_EFFECT_TEXT: Readonly<Record<RuneItemId, string>> = {
  runeSharp: RUNE_DEF.runeSharp.effect,
  runeArmor: RUNE_DEF.runeArmor.effect,
  runeBlood: RUNE_DEF.runeBlood.effect,
  runeBreak: RUNE_DEF.runeBreak.effect,
  runeSwift: RUNE_DEF.runeSwift.effect,
  runeInsight: RUNE_DEF.runeInsight.effect,
}

export const RUNE_DEAL_MUL = 1.25
export const RUNE_TAKEN_MUL = 0.75
export const RUNE_SWIFT_SPD_MUL = 0.85
export const RUNE_BLOOD_XP = 8
export const RUNE_BREAK_SHIELD_BONUS = 1

export function isRuneItemId(id: unknown): id is RuneItemId {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(RUNE_DEF, id)
}

export function unlockedRuneIds(stationLevel: number): RuneItemId[] {
  const level = Number.isFinite(stationLevel) ? Math.floor(stationLevel) : 1
  return RUNE_ITEM_IDS.filter((id) => RUNE_DEF[id].unlockLevel <= level)
}

export function inscriptionRecipes(stationLevel: number): RuneDef[] {
  return unlockedRuneIds(stationLevel).map((id) => RUNE_DEF[id])
}

/** 铭刻软失败率。周期走完后掷骰。 */
export const INSCRIPTION_SOFT_FAIL_CHANCE = 0.1
export const FORGING_SOFT_FAIL_CHANCE: Record<CategoryId, number> = {
  copper: 0.1,
  iron: 0.15,
  mithril: 0.2,
  default: INSCRIPTION_SOFT_FAIL_CHANCE,
}

/** 软失败扣料比例；不足 1 按 1。 */
export const INSCRIPTION_SOFT_FAIL_TAKE_RATIO = 0.5
export const FORGING_SOFT_FAIL_TAKE_RATIO = INSCRIPTION_SOFT_FAIL_TAKE_RATIO
/** 软失败 XP 相对本档 xpPerCycle；至少 1。 */
export const INSCRIPTION_SOFT_FAIL_XP_MUL = 0.5
export const FORGING_SOFT_FAIL_XP_MUL = INSCRIPTION_SOFT_FAIL_XP_MUL

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

/** 锅 / 瓶架等按表匹配制造站；采集站也各有对应类型。钓鱼竿已撤。 */
export const TOOL_TYPE_DEF: Record<ToolTypeId, ToolTypeDef> = {
  pick: { id: 'pick', label: '镐', matchStationId: 'mining' },
  hammer: { id: 'hammer', label: '锤', matchStationId: 'inscription' },
  spear: { id: 'spear', label: '猎具', matchStationId: 'hunting' },
  pot: { id: 'pot', label: '锅', matchStationId: 'cooking' },
  sickle: { id: 'sickle', label: '镰', matchStationId: 'herbalism' },
  rack: { id: 'rack', label: '瓶架', matchStationId: 'alchemy' },
}

export const TOOL_TYPE_IDS = Object.keys(TOOL_TYPE_DEF) as ToolTypeId[]

export function isToolTypeId(id: unknown): id is ToolTypeId {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(TOOL_TYPE_DEF, id)
}

export function toolTypeByStation(stationId: StationId): ToolTypeId {
  const found = TOOL_TYPE_IDS.find((id) => TOOL_TYPE_DEF[id].matchStationId === stationId)
  return found ?? 'pick'
}

/** 每站专属工具种数。 */
export const STATION_TOOL_COUNT = 20
/** 站等级每 5 级解锁 1 种：`floor(stationLevel/5)`，上限 20。 */
export const STATION_TOOL_UNLOCK_EVERY = 5
/** 选中第 n 把：效率 ×(1 + n × 3%)。只生效一把。 */
export const STATION_TOOL_SPEED_STEP = 0.03

export const STATION_TOOL_INDEX_CODES = [
  '01',
  '02',
  '03',
  '04',
  '05',
  '06',
  '07',
  '08',
  '09',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
  '19',
  '20',
] as const satisfies readonly StationToolIndexCode[]

export type StationToolDef = {
  id: StationToolId
  stationId: StationId
  index: number
  label: string
}

export function padStationToolIndex(index: number): StationToolIndexCode {
  return String(Math.max(1, Math.min(STATION_TOOL_COUNT, Math.floor(index)))).padStart(
    2,
    '0',
  ) as StationToolIndexCode
}

export function stationToolItemId(stationId: StationId, index: number): StationToolId {
  return `${stationId}Tool${padStationToolIndex(index)}`
}

export function stationToolUnlockCount(stationLevel: number): number {
  const level = Number.isFinite(stationLevel) ? Math.floor(stationLevel) : 1
  return Math.min(STATION_TOOL_COUNT, Math.max(0, Math.floor(level / STATION_TOOL_UNLOCK_EVERY)))
}

export function stationToolUnlockLevel(index: number): number {
  return Math.max(1, Math.floor(index)) * STATION_TOOL_UNLOCK_EVERY
}

export function isStationToolUnlocked(stationLevel: number, index: number): boolean {
  return index >= 1 && index <= stationToolUnlockCount(stationLevel)
}

/** 锻造能造到第几档：看锻造站自身等级，`min(20, forgeLevel)`。 */
export function forgeToolUnlockCount(forgeLevel: number): number {
  const level = Number.isFinite(forgeLevel) ? Math.floor(forgeLevel) : 1
  return Math.min(STATION_TOOL_COUNT, Math.max(0, level))
}

export function forgeToolUnlockLevel(index: number): number {
  return Math.min(STATION_TOOL_COUNT, Math.max(1, Math.floor(index)))
}

export function isForgeToolUnlocked(forgeLevel: number, index: number): boolean {
  return index >= 1 && index <= forgeToolUnlockCount(forgeLevel)
}

export function stationToolSpeedMulOf(index: number): number {
  if (!Number.isFinite(index) || index < 1) return 1
  return 1 + Math.floor(index) * STATION_TOOL_SPEED_STEP
}

function buildStationToolTable(): {
  byStation: Record<StationId, StationToolDef[]>
  byId: Record<StationToolId, StationToolDef>
} {
  const byStation = {} as Record<StationId, StationToolDef[]>
  const byId = {} as Record<StationToolId, StationToolDef>
  for (const stationId of STATION_IDS) {
    const rows: StationToolDef[] = []
    for (let index = 1; index <= STATION_TOOL_COUNT; index++) {
      const id = stationToolItemId(stationId, index)
      const row: StationToolDef = {
        id,
        stationId,
        index,
        label: `${STATION_DEF[stationId].label}工具${index}`,
      }
      rows.push(row)
      byId[id] = row
      ITEM_DEF[id] = { id, label: row.label, sellGold: 8, craftGold: 1 }
    }
    byStation[stationId] = rows
  }
  return { byStation, byId }
}

const STATION_TOOL_TABLE = buildStationToolTable()

export const STATION_TOOL_DEF = STATION_TOOL_TABLE.byStation
export const STATION_TOOL_BY_ID = STATION_TOOL_TABLE.byId
export const STATION_TOOL_IDS = Object.keys(STATION_TOOL_BY_ID) as StationToolId[]

export function isStationToolId(id: unknown): id is StationToolId {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(STATION_TOOL_BY_ID, id)
}

export function stationToolsOf(stationId: StationId): StationToolDef[] {
  return STATION_TOOL_DEF[stationId] ?? []
}

export type ForgeToolRecipe = {
  toolId: StationToolId
  cycleS: number
  costs: IoRule[]
  altCosts?: IoRule[]
  xpPerCycle: number
  softFailChance: number
}

/** 占位配方：1–5 铜矿 32s，6–10 铁矿 36s，11–20 秘银矿 40s。第 1 种可用渣滓。 */
export function forgeToolRecipeOf(toolId: StationToolId): ForgeToolRecipe {
  const def = STATION_TOOL_BY_ID[toolId]
  const index = def?.index ?? 1
  if (index <= 5) {
    return {
      toolId,
      cycleS: 32,
      costs: [{ itemId: 'ore', qty: 1 }],
      altCosts: index === 1 ? [{ itemId: 'slag', qty: 1 }] : undefined,
      xpPerCycle: 1,
      softFailChance: FORGING_SOFT_FAIL_CHANCE.copper,
    }
  }
  if (index <= 10) {
    return {
      toolId,
      cycleS: 36,
      costs: [{ itemId: 'ironOre', qty: 1 }],
      xpPerCycle: 2,
      softFailChance: FORGING_SOFT_FAIL_CHANCE.iron,
    }
  }
  return {
    toolId,
    cycleS: 40,
    costs: [{ itemId: 'mithrilOre', qty: 1 }],
    xpPerCycle: 3,
    softFailChance: FORGING_SOFT_FAIL_CHANCE.mithril,
  }
}

export function forgeCategoryFromRecipe(recipe: ForgeToolRecipe): StationCategoryDef {
  const def = STATION_TOOL_BY_ID[recipe.toolId]
  return {
    id: 'default',
    label: def?.label ?? '专属工具',
    cycleS: recipe.cycleS,
    costs: recipe.costs,
    altCosts: recipe.altCosts,
    outputs: [{ itemId: recipe.toolId, qty: 1 }],
    xpPerCycle: recipe.xpPerCycle,
    unlockLevel: stationToolUnlockLevel(def?.index ?? 1),
  }
}

export const ITEM_IDS = Object.keys(ITEM_DEF) as ItemId[]

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
    matchStationId: 'hunting',
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

/** 入休息吃到的短时弱生产效果。主职是回血，加速压得很低。 */
export const FOOD_BUFF_DEF: Record<FoodItemId, ProductionBuff> = {
  meal: { effectId: EFFECT_ID.prodSpeed, mul: 1.02, durationS: 180 },
  roast: { effectId: EFFECT_ID.extraOutput, mul: 0, durationS: 180 },
  stew: { effectId: EFFECT_ID.prodSpeed, mul: 1.03, durationS: 240 },
}

/** 残血自动吃 1：按 hpMax 向上取整回血。 */
export const FOOD_HEAL_RATIO: Record<FoodItemId, number> = {
  meal: 0.25,
  roast: 0.4,
  stew: 0.55,
}

/** 旧通用药剂用药比例；现已不用。回春散为 10%。 */
export const POTION_HEAL_RATIO = 0.2
export const SALVE_HEAL_RATIO = 0.1
export const RENEW_HEAL_RATIO = 0.05
/** 绝境膏：HP/hpMax ≤ 此值则抬到目标比例，否则按少量比例回。 */
export const BRINK_LOW_RATIO = 0.3
export const BRINK_LOW_TARGET_RATIO = 0.4
export const BRINK_HEAL_RATIO = 0.05
/** 醒神散：最残一人、次残一人（次残还须 HP≤50%）。 */
export const CLEAR_MIND_PRIMARY_RATIO = 0.35
export const CLEAR_MIND_SECONDARY_RATIO = 0.2
export const CLEAR_MIND_SECONDARY_MAX_RATIO = 0.5
/** 双份雾：低于此掷骰为 ×2，否则 ×3。 */
export const DOUBLE_MIST_DOUBLE_RATE = 0.8
/** 赶工粉：下一次周期缩短的比例。 */
export const RUSH_CYCLE_CUT = 0.4
export const STIM_SPEED_MUL = 1.5
export const STIM_DURATION_S = 180
export const RENEW_DURATION_S = 120
export const RENEW_TICK_S = 10

export const FOOD_ITEM_IDS = Object.keys(FOOD_BUFF_DEF) as FoodItemId[]

export function isFoodItemId(id: unknown): id is FoodItemId {
  return id === 'meal' || id === 'roast' || id === 'stew'
}

export function foodBuffDef(itemId: ItemId): ProductionBuff | undefined {
  return isFoodItemId(itemId) ? FOOD_BUFF_DEF[itemId] : undefined
}

/**
 * 升到下一等级所需 XP。
 * Lv1–4 用固定门槛（5 / 10 / 15 / 20），让前期骑士等级更快起来。
 * Lv5 起沿用：round(100 * 1.45^(L-1) * 0.175)。
 */
export const XP_TO_NEXT_BASE = 100
export const XP_TO_NEXT_GROWTH = 1.45
export const XP_TO_NEXT_SCALE = 0.175

/** Lv1–4 升下一级的固定 XP。 */
export const XP_TO_NEXT_EARLY = [5, 10, 15, 20] as const

export function xpToNextLevel(level: number): number {
  const safe = Math.max(1, Math.floor(level))
  if (safe <= XP_TO_NEXT_EARLY.length) return XP_TO_NEXT_EARLY[safe - 1]
  return Math.max(
    1,
    Math.round(XP_TO_NEXT_BASE * Math.pow(XP_TO_NEXT_GROWTH, safe - 1) * XP_TO_NEXT_SCALE),
  )
}

/** 从 Lv1 升到 target 的累计 XP（不含当前等级内进度）。Lv5 = 50。 */
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

/**
 * 工坊组 / 工人左栏 / 派入空槽扫描共用上→下顺序，避免三处漂移。
 * 药剂（采药+炼金）→ 食物（狩猎+烹饪）→ 符文（采矿+铭刻）。伐木 / 钓鱼已藏。
 */
export const PLAYABLE_CHAINS: readonly (readonly [StationId, StationId])[] = [
  ['herbalism', 'alchemy'],
  ['hunting', 'cooking'],
  ['mining', 'inscription'],
]
/** 六站展开顺序，与 PLAYABLE_CHAINS 展平一致。 */
export const STATION_ORDER: readonly StationId[] = PLAYABLE_CHAINS.flatMap((pair) => pair)
export const PLAYABLE_STATION_IDS: StationId[] = [...STATION_ORDER]
/** 现玩法站已全部上主列。保留空表以免旧 UI 引用炸掉。 */
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
    for (const id of POTION_ITEM_IDS) pushUniqueItem(outputs, id)
  }
  if (stationId === 'herbalism') {
    for (const row of HERBALISM_DROP_TABLE) pushUniqueItem(outputs, row.itemId)
  }
  if (stationId === 'hunting') {
    for (const prey of HUNTING_PREY_TABLE) {
      for (const io of prey.outputs) pushUniqueItem(outputs, io.itemId)
    }
    for (const row of HUNTING_SIDE_DROP_TABLE) {
      if (row.itemId) pushUniqueItem(outputs, row.itemId)
    }
  }
  if (stationId === 'inscription') {
    pushUniqueItem(costs, 'wildCrystal')
    for (const id of RUNE_ITEM_IDS) pushUniqueItem(outputs, id)
  }
  if (stationId === 'mining') pushUniqueItem(outputs, 'wildCrystal')
  return { costs, outputs }
}

/** 可生产物资的主产站。多站都能出时取 PLAYABLE_STATION_IDS 里第一个。旧通用工具回落铭刻；金币 / 其它旧物返回 null。 */
export function itemProducerStation(itemId: ItemId): StationId | null {
  if (isAnyPotionNeed(itemId)) return 'alchemy'
  if (isAnyRuneNeed(itemId)) return 'inscription'
  if (isToolItemId(itemId) || isStationToolId(itemId)) return 'inscription'
  for (const id of PLAYABLE_STATION_IDS) {
    if (stationRelatedItems(id).outputs.includes(itemId)) return id
  }
  return null
}

/** 不挂在任一可玩站上的旧物（木头 / 搁置武器等）。有货时工坊页脚展示。 */
export function leftoverStockItems(): ItemId[] {
  const used = new Set<ItemId>()
  for (const id of PLAYABLE_STATION_IDS) {
    const related = stationRelatedItems(id)
    for (const itemId of related.costs) used.add(itemId)
    for (const itemId of related.outputs) used.add(itemId)
  }
  return ITEM_IDS.filter((id) => !used.has(id) && !isStationToolId(id) && !isWildcardNeedId(id))
}

/** 整批换金（sim / 调试）。主界面已撤卖货；去武器，只收符文 / 烹饪食物。 */
export const SELLABLE_GOODS: ItemId[] = [
  'runeSharp',
  'runeArmor',
  'runeBlood',
  'runeBreak',
  'runeSwift',
  'runeInsight',
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
 * 在岗正好 1 人时 currentSpeed 再乘 SOLO_STAFF_MUL；同站冲突已废弃
 */
export function stationSpeed(n: number, cycleS: number): number {
  if (n <= 0 || cycleS <= 0) return 0
  const base = 1 / cycleS
  return base * stackFactor(n)
}
