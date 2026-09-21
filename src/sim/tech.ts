import { resizeEncounterBoard } from './encounters'
import { syncKnightLevel } from './knightLevel'
import { roll01 } from './rng'
import { OFFLINE_CAP_S, PLAYABLE_CHAINS, RECRUIT_COST } from './tables'
import type { ActionResult, Save, StationId, TechId } from './types'

export const BATTLEFIELD_SLOT_MIN = 2
export const BATTLEFIELD_SLOT_MAX = 4
export const MARKET_SLOT_MIN = 2
export const MARKET_SLOT_MAX = 4
/** 战场订单格科技。每级 +1，与初始 2 格相加，封顶 4。 */
export const BATTLEFIELD_SLOT_EFFECT = 'battlefieldSlot'
/** 商场订单格科技。每级 +1，与初始 2 格相加，封顶 4。 */
export const MARKET_SLOT_EFFECT = 'marketSlot'
/** @deprecated 旧单板 effectId；现拆成 battlefieldSlot / marketSlot。 */
export const ENCOUNTER_SLOT_EFFECT = BATTLEFIELD_SLOT_EFFECT
export const NOOP_TECH_EFFECT = 'noop'
/** 已实装节点先保持单级，图标仍走 `0/1`→`1/1`。 */
export const IMPLEMENTED_TECH_MAX_LEVEL = 1
/** 占位节点可连点，图标能看出 `1/5`。 */
export const PLACEHOLDER_TECH_MAX_LEVEL = 5

export const SLAG_COPPER_EFFECT = 'slagCopper'
export const STATION_XP_EFFECT = 'stationXp'
export const MINING_OUTPUT_EFFECT = 'miningOutput'
export const TOOL_UPKEEP_EFFECT = 'toolUpkeep'
export const FORGE_CYCLE_EFFECT = 'forgeCycle'
export const OFFLINE_HOURS_EFFECT = 'offlineHours'
export const WORKER_ATK_EFFECT = 'workerAtk'
export const WORKER_HP_EFFECT = 'workerHp'
export const WEAKNESS_CRIT_EFFECT = 'weaknessCrit'
export const REVEAL_EXTRA_EFFECT = 'revealExtra'
export const ATK_INTERVAL_EFFECT = 'atkInterval'
export const REMATCH_SUPPLY_EFFECT = 'rematchSupply'
export const CAMP_BANDAGE_EFFECT = 'campBandage'
export const ASSIST_FLOOR_EFFECT = 'assistFloor'
export const TRADE_GOLD_EFFECT = 'tradeGold'
export const EXPLORE_COST_EFFECT = 'exploreCost'
export const LOOT_GOLD_EFFECT = 'lootGold'
export const GROUP_CONFLICT_EFFECT = 'groupConflict'
export const WILD_CRYSTAL_DROP_EFFECT = 'wildCrystalDrop'
export const ALCHEMY_BATCH_EFFECT = 'alchemyBatch'
export const HUNT_HAZARD_EFFECT = 'huntHazard'
export const FIRST_STRIKE_EFFECT = 'firstStrike'
export const RUNE_ATK_EFFECT = 'runeAtk'
export const WOUNDED_GUARD_EFFECT = 'woundedGuard'
export const BREAK_ECHO_EFFECT = 'breakEcho'
export const TIMED_ORDER_DURATION_EFFECT = 'timedOrderDuration'
export const TIMED_ORDER_CHANCE_EFFECT = 'timedOrderChance'
export const EXPLORE_COST_STACK_EFFECT = 'exploreCostStack'
export const RECRUIT_COST_EFFECT = 'recruitCost'
export const DIAMOND_ORDER_EFFECT = 'diamondOrder'
export const RUNE_SCRAP_EFFECT = 'runeScrap'
export const REINFORCE_FIRST_EFFECT = 'reinforceFirst'
export const KNIGHT_CYCLE_EFFECT = 'knightCycle'

/** 骑士每满 N 级，全站周期 −1%。 */
export const KNIGHT_CYCLE_STEP = 5
/** 匠师印章周期减免软上限。 */
export const KNIGHT_CYCLE_CAP = 0.08
/** 探索费叠乘下限。 */
export const EXPLORE_COST_FLOOR = 0.6
/** 轮值章程：同组两站都有人时，把现有冲突惩罚再乘 0.5。 */
export const GROUP_CONFLICT_PENALTY_MUL = 0.5

/** 已实装效果的默认数值。`techEffectValue` 按等级叠乘。 */
export const TECH_EFFECT_BASE: Readonly<Record<string, number>> = {
  [SLAG_COPPER_EFFECT]: 0.5,
  [STATION_XP_EFFECT]: 0.15,
  [MINING_OUTPUT_EFFECT]: 0.1,
  [TOOL_UPKEEP_EFFECT]: 0.05,
  [FORGE_CYCLE_EFFECT]: 0.1,
  [OFFLINE_HOURS_EFFECT]: 2,
  [WORKER_ATK_EFFECT]: 0.1,
  [WORKER_HP_EFFECT]: 0.1,
  [WEAKNESS_CRIT_EFFECT]: 0.1,
  [REVEAL_EXTRA_EFFECT]: 1,
  [ATK_INTERVAL_EFFECT]: 0.1,
  [REMATCH_SUPPLY_EFFECT]: 1,
  [CAMP_BANDAGE_EFFECT]: 0.1,
  [ASSIST_FLOOR_EFFECT]: 1,
  [TRADE_GOLD_EFFECT]: 0.15,
  [EXPLORE_COST_EFFECT]: 0.2,
  [LOOT_GOLD_EFFECT]: 0.15,
  [GROUP_CONFLICT_EFFECT]: 0.5,
  [WILD_CRYSTAL_DROP_EFFECT]: 0.1,
  [ALCHEMY_BATCH_EFFECT]: 1,
  [HUNT_HAZARD_EFFECT]: 0.2,
  [FIRST_STRIKE_EFFECT]: 0.5,
  [RUNE_ATK_EFFECT]: 0.15,
  [WOUNDED_GUARD_EFFECT]: 0.2,
  [BREAK_ECHO_EFFECT]: 0.15,
  [TIMED_ORDER_DURATION_EFFECT]: 0.5,
  [TIMED_ORDER_CHANCE_EFFECT]: 0.15,
  [EXPLORE_COST_STACK_EFFECT]: 0.1,
  [RECRUIT_COST_EFFECT]: 5,
  [DIAMOND_ORDER_EFFECT]: 0.1,
  [RUNE_SCRAP_EFFECT]: 0.5,
  [REINFORCE_FIRST_EFFECT]: 0.2,
  [KNIGHT_CYCLE_EFFECT]: 0.01,
}

export const TECH_TAB_IDS = ['production', 'combat', 'affairs'] as const
export type TechTabId = (typeof TECH_TAB_IDS)[number]

export const TECH_TAB_LABELS: Record<TechTabId, string> = {
  production: '生产',
  combat: '战斗',
  affairs: '事务',
}

export type TechNodeDef = {
  id: TechId
  name: string
  desc: string
  cost: number
  /** 实装效果 id；占位为 noop。事务订单格为 battlefieldSlot / marketSlot；冲突仍走 stationConflictMul。 */
  effectId: string
  tab: TechTabId
  row: number
  icon: string
  implemented: boolean
  /** 可点次数，≥1。已实装先 1；占位 5。 */
  maxLevel: number
}

export type TechRowDef = {
  tab: TechTabId
  row: number
  cost: number
  options: readonly TechNodeDef[]
}

export type TechTabDef = {
  id: TechTabId
  name: string
  rows: readonly TechRowDef[]
}

type OptionSeed = {
  id: TechId
  name: string
  desc: string
  icon: string
  effectId?: string
  implemented?: boolean
  maxLevel?: number
}

type RowSeed = {
  cost: number
  options: readonly OptionSeed[]
}

/** 未研究时同站两人冲突倍率（−30%）。 */
export const STATION_CONFLICT_BASE_MUL = 0.7
/** 解锁「工坊规章」后冲突倍率（−15%）。 */
export const STATION_CONFLICT_RULES_MUL = 0.85
/** 解锁「工匠密录」后消除冲突。 */
export const STATION_CONFLICT_CLEARED_MUL = 1

function implemented(effectId: string, extra: Partial<OptionSeed> = {}): Pick<OptionSeed, 'effectId' | 'implemented' | 'maxLevel'> {
  return {
    effectId,
    implemented: true,
    maxLevel: IMPLEMENTED_TECH_MAX_LEVEL,
    ...extra,
  }
}

const PRODUCTION_ROWS: readonly RowSeed[] = [
  {
    cost: 2,
    options: [
      {
        id: 'slagRecycle',
        name: '渣滓回炉',
        desc: '回炉把渣滓当 0.5 铜等价，可替铜矿付账。',
        icon: '♻️',
        ...implemented(SLAG_COPPER_EFFECT),
      },
      {
        id: 'recipeImprint',
        name: '配方拓印',
        desc: '工序拓印更清楚，站经验 +15%。',
        icon: '📝',
        ...implemented(STATION_XP_EFFECT),
      },
      {
        id: 'veinSelect',
        name: '矿脉精选',
        desc: '挑富矿下手，采矿产出 +10%。',
        icon: '⛏️',
        ...implemented(MINING_OUTPUT_EFFECT),
      },
    ],
  },
  {
    cost: 4,
    options: [
      {
        id: 'workshopRules',
        name: '工坊规章',
        desc: '排班规矩减轻同站两人冲突（效率 −15%）。',
        icon: '📜',
        implemented: true,
        maxLevel: IMPLEMENTED_TECH_MAX_LEVEL,
      },
      {
        id: 'toolUpkeep',
        name: '工具保养',
        desc: '保养铭刀，铭刻成功时额外 +1 枚符文。',
        icon: '🔧',
        ...implemented(TOOL_UPKEEP_EFFECT),
      },
    ],
  },
  {
    cost: 6,
    options: [
      {
        id: 'artisanArchive',
        name: '工匠密录',
        desc: '密录消除同站两人冲突，满员按人数全速。',
        icon: '📗',
        implemented: true,
        maxLevel: IMPLEMENTED_TECH_MAX_LEVEL,
      },
      {
        id: 'forgeHeat',
        name: '炉温调控',
        desc: '把炉火稳住，铭刻耗时 −10%。',
        icon: '🔥',
        ...implemented(FORGE_CYCLE_EFFECT),
      },
    ],
  },
  {
    cost: 8,
    options: [
      {
        id: 'nightLamp',
        name: '夜班油灯',
        desc: '夜里也能接着干，离线上限 +2 小时。',
        icon: '🪔',
        ...implemented(OFFLINE_HOURS_EFFECT),
      },
      {
        id: 'workshopCrest',
        name: '轮值章程',
        desc: '同组两站都至少派入 1 人时，该组冲突惩罚再减半。',
        icon: '🛡️',
        ...implemented(GROUP_CONFLICT_EFFECT),
      },
      {
        id: 'knightCrest',
        name: '匠师印章',
        desc: '骑士每满 5 级，全站制作周期 −1%，最多 −8%。',
        icon: '🏅',
        ...implemented(KNIGHT_CYCLE_EFFECT),
      },
    ],
  },
  {
    cost: 10,
    options: [
      {
        id: 's06DraftA',
        name: '荒晶提纯',
        desc: '采矿荒晶双掉概率 +10%。',
        icon: '🔥',
        ...implemented(WILD_CRYSTAL_DROP_EFFECT),
      },
      {
        id: 's07DraftA',
        name: '配伍札记',
        desc: '炼金每批固定多出 1 瓶，随机池不变。',
        icon: '📚',
        ...implemented(ALCHEMY_BATCH_EFFECT),
      },
    ],
  },
  {
    cost: 12,
    options: [
      {
        id: 's08DraftA',
        name: '猎场标记',
        desc: '狩猎遇险概率 −20%。',
        icon: '📢',
        ...implemented(HUNT_HAZARD_EFFECT),
      },
      {
        id: 's09DraftA',
        name: '符文边角料',
        desc: '铭刻软失败时 50% 概率退回 1 荒晶。',
        icon: '🤝',
        ...implemented(RUNE_SCRAP_EFFECT),
      },
      {
        id: 's10DraftA',
        name: '长夜油灯',
        desc: '离线上限再 +2 小时（夜班油灯之后到 12 小时）。',
        icon: '👑',
        ...implemented(OFFLINE_HOURS_EFFECT),
      },
    ],
  },
]

const COMBAT_ROWS: readonly RowSeed[] = [
  {
    cost: 3,
    options: [
      {
        id: 'dummyDrill',
        name: '木桩加训',
        desc: '加练出拳，工人 ATK +10%。',
        icon: '🪵',
        ...implemented(WORKER_ATK_EFFECT),
      },
      {
        id: 'bracerTighten',
        name: '护腕束紧',
        desc: '护腕勒紧，工人 HP +10%。',
        icon: '🥊',
        ...implemented(WORKER_HP_EFFECT),
      },
    ],
  },
  {
    cost: 5,
    options: [
      {
        id: 'weaknessNotes',
        name: '弱点札记',
        desc: '记下要害，弱点暴击伤再 +10%。',
        icon: '🎯',
        ...implemented(WEAKNESS_CRIT_EFFECT),
      },
      {
        id: 'revealSight',
        name: '揭秘眼力',
        desc: '小兵 / 精英开战再多露 1 弱点（不超过总数）。',
        icon: '👁️',
        ...implemented(REVEAL_EXTRA_EFFECT),
      },
      {
        id: 'rapidForm',
        name: '急行整队',
        desc: '整队更快出手，攻击间隔 ×0.9。',
        icon: '🏃',
        ...implemented(ATK_INTERVAL_EFFECT),
      },
    ],
  },
  {
    cost: 7,
    options: [
      {
        id: 'rematchSupply',
        name: '回营绷带',
        desc: '倒地回休息的工人立刻恢复 10% HP。',
        icon: '🎒',
        ...implemented(CAMP_BANDAGE_EFFECT),
      },
      {
        id: 'assistHorn',
        name: '助战号角',
        desc: '邀请助战品质下限 = max(1, floor(自身最高品质 / 2))。',
        icon: '📯',
        ...implemented(ASSIST_FLOOR_EFFECT),
      },
    ],
  },
  {
    cost: 9,
    options: [
      {
        id: 'combatBanner',
        name: '破晓号令',
        desc: '开战时工人首次攻击间隔 −0.5 秒。',
        icon: '🚩',
        ...implemented(FIRST_STRIKE_EFFECT),
      },
      {
        id: 'combatEdge',
        name: '符刃开光',
        desc: '本场已装备符文的工人 ATK +15%；无符文不加。',
        icon: '🗡️',
        ...implemented(RUNE_ATK_EFFECT),
      },
      {
        id: 'combatArmor',
        name: '残血顽抗',
        desc: '工人 HP≤30% 上限时受到伤害 −20%。',
        icon: '🪖',
        ...implemented(WOUNDED_GUARD_EFFECT),
      },
    ],
  },
  {
    cost: 11,
    options: [
      {
        id: 'combatCourt',
        name: '增援鼓点',
        desc: '经增援上场的工人第一击伤害 +20%。',
        icon: '🏰',
        ...implemented(REINFORCE_FIRST_EFFECT),
      },
      {
        id: 'combatLegend',
        name: '连破余韵',
        desc: '敌人处于破防 / 虚弱窗口时，伤害再 ×1.15。',
        icon: '⭐',
        ...implemented(BREAK_ECHO_EFFECT),
      },
    ],
  },
]

const AFFAIRS_ROWS: readonly RowSeed[] = [
  {
    cost: 5,
    options: [
      {
        id: 'pathOutpost',
        name: '探路哨岗',
        desc: '在工坊外立一座哨岗，战场订单格 +1（2→3）。',
        icon: '🏕️',
        effectId: BATTLEFIELD_SLOT_EFFECT,
        maxLevel: IMPLEMENTED_TECH_MAX_LEVEL,
      },
      {
        id: 'bargainBell',
        name: '议价铜铃',
        desc: '当铺 / 收购换金 +15%。',
        icon: '🔔',
        ...implemented(TRADE_GOLD_EFFECT),
      },
    ],
  },
  {
    cost: 8,
    options: [
      {
        id: 'marketLicense',
        name: '市集摊位',
        desc: '多摆一个摊位，商场订单格 +1（2→3）。',
        icon: '🪪',
        effectId: MARKET_SLOT_EFFECT,
        maxLevel: IMPLEMENTED_TECH_MAX_LEVEL,
      },
      {
        id: 'rushOrder',
        name: '急单优先',
        desc: '探路少绕弯，探索费用 −20%。',
        icon: '📨',
        ...implemented(EXPLORE_COST_EFFECT),
      },
    ],
  },
  {
    cost: 12,
    options: [
      {
        id: 'scoutRelay',
        name: '斥候驿站',
        desc: '路书可传到更远，战场订单格 +1（3→4）。',
        icon: '🏇',
        effectId: BATTLEFIELD_SLOT_EFFECT,
        maxLevel: IMPLEMENTED_TECH_MAX_LEVEL,
      },
      {
        id: 'lootSort',
        name: '战利品分拣',
        desc: '主线战利品金币 +15%。',
        icon: '📦',
        ...implemented(LOOT_GOLD_EFFECT),
      },
    ],
  },
  {
    cost: 16,
    options: [
      {
        id: 'farWatch',
        name: '货栈扩容',
        desc: '货栈多开一间，商场订单格 +1（3→4）。',
        icon: '🗼',
        effectId: MARKET_SLOT_EFFECT,
        maxLevel: IMPLEMENTED_TECH_MAX_LEVEL,
      },
      {
        id: 's04DraftC',
        name: '双轨急单',
        desc: '商场刷出限时单概率 +15%。',
        icon: '🌙',
        ...implemented(TIMED_ORDER_CHANCE_EFFECT),
      },
    ],
  },
  {
    cost: 20,
    options: [
      {
        id: 'caravanPermit',
        name: '限时加急章',
        desc: '限时商场订单时限 +50%，不再加商场格。',
        icon: '🐫',
        ...implemented(TIMED_ORDER_DURATION_EFFECT),
      },
      {
        id: 's05DraftC',
        name: '探路折扣',
        desc: '探索费再 ×0.9，与急单优先叠乘，下限 0.6。',
        icon: '💮',
        ...implemented(EXPLORE_COST_STACK_EFFECT),
      },
    ],
  },
  {
    cost: 24,
    options: [
      {
        id: 'affairsRoadbook',
        name: '回扣账本',
        desc: '当铺 / 收购金币再 ×1.15，与议价铜铃叠乘。',
        icon: '🗺️',
        ...implemented(TRADE_GOLD_EFFECT),
      },
      {
        id: 'affairsRoster',
        name: '募兵折',
        desc: '抽工人钻石费用 15→10。',
        icon: '📒',
        ...implemented(RECRUIT_COST_EFFECT),
      },
      {
        id: 'affairsSeal',
        name: '钻标订单',
        desc: '商场钻石奖励类订单出现率 +10%。',
        icon: '🔏',
        ...implemented(DIAMOND_ORDER_EFFECT),
      },
    ],
  },
]

function isSlotEffect(effectId: string | undefined): boolean {
  return effectId === BATTLEFIELD_SLOT_EFFECT || effectId === MARKET_SLOT_EFFECT
}

function isImplemented(seed: OptionSeed): boolean {
  return seed.implemented === true || isSlotEffect(seed.effectId)
}

function resolveMaxLevel(seed: OptionSeed): number {
  if (typeof seed.maxLevel === 'number' && Number.isFinite(seed.maxLevel) && seed.maxLevel >= 1) {
    return Math.floor(seed.maxLevel)
  }
  return isImplemented(seed) ? IMPLEMENTED_TECH_MAX_LEVEL : PLACEHOLDER_TECH_MAX_LEVEL
}

function buildRow(tab: TechTabId, row: number, seed: RowSeed): TechRowDef {
  const options = seed.options.map((option) => ({
    id: option.id,
    name: option.name,
    desc: option.desc,
    cost: seed.cost,
    effectId: option.effectId ?? NOOP_TECH_EFFECT,
    tab,
    row,
    icon: option.icon,
    implemented: isImplemented(option),
    maxLevel: resolveMaxLevel(option),
  }))
  return { tab, row, cost: seed.cost, options }
}

function buildTab(id: TechTabId, seeds: readonly RowSeed[]): TechTabDef {
  return {
    id,
    name: TECH_TAB_LABELS[id],
    rows: seeds.map((seed, i) => buildRow(id, i + 1, seed)),
  }
}

/** 三页签科技树。每页独立线性层，第 1 层在屏幕最下。 */
export const TECH_TABS: readonly TechTabDef[] = [
  buildTab('production', PRODUCTION_ROWS),
  buildTab('combat', COMBAT_ROWS),
  buildTab('affairs', AFFAIRS_ROWS),
]

/** 扁平表，兼容旧遍历。顺序：生产 → 战斗 → 事务，层内自下而上。 */
export const TECH_TREE: readonly TechNodeDef[] = TECH_TABS.flatMap((tab) =>
  tab.rows.flatMap((row) => row.options),
)

export const TECH_IDS = TECH_TREE.map((node) => node.id)

export const BATTLEFIELD_SLOT_TECH_IDS: readonly TechId[] = TECH_TREE.filter(
  (node) => node.effectId === BATTLEFIELD_SLOT_EFFECT,
).map((node) => node.id)

export const MARKET_SLOT_TECH_IDS: readonly TechId[] = TECH_TREE.filter(
  (node) => node.effectId === MARKET_SLOT_EFFECT,
).map((node) => node.id)

/** 战场 + 商场订单格科技，按科技树顺序。 */
export const ENCOUNTER_SLOT_TECH_IDS: readonly TechId[] = TECH_TREE.filter((node) =>
  isSlotEffect(node.effectId),
).map((node) => node.id)

const TECH_BY_ID = new Map<TechId, TechNodeDef>(TECH_TREE.map((node) => [node.id, node]))
const TAB_BY_ID = new Map<TechTabId, TechTabDef>(TECH_TABS.map((tab) => [tab.id, tab]))
const TECH_ID_SET = new Set<TechId>(TECH_IDS)

export function isTechTabId(value: unknown): value is TechTabId {
  return typeof value === 'string' && TECH_TAB_IDS.includes(value as TechTabId)
}

export function isTechId(value: unknown): value is TechId {
  return typeof value === 'string' && TECH_ID_SET.has(value)
}

export function techNode(id: TechId): TechNodeDef {
  return TECH_BY_ID.get(id) ?? TECH_TREE[0]
}

export function techTab(id: TechTabId): TechTabDef {
  return TAB_BY_ID.get(id) ?? TECH_TABS[0]
}

export function techRow(tab: TechTabId, row: number): TechRowDef | undefined {
  return techTab(tab).rows.find((item) => item.row === row)
}

export function techReadyLabel(node: TechNodeDef): string {
  return node.implemented ? '已实装' : '未实装'
}

export function normalizeTechPoints(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return Math.floor(value)
}

export function normalizeTechLevel(value: unknown, maxLevel: number): number {
  const cap = Math.max(1, Math.floor(maxLevel))
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return Math.min(cap, Math.floor(value))
}

function unlockedSet(ids: readonly string[]): Set<TechId> {
  return new Set(ids.filter(isTechId))
}

/**
 * 旧档：能对上新表的 id 原样留下并保留效果，对不上的丢掉。
 * 不要求下层已买，也不扣灵感。
 */
export function hydrateUnlockedTechIds(raw: unknown): TechId[] {
  if (!Array.isArray(raw)) return []
  const have = unlockedSet(raw.filter((id): id is string => typeof id === 'string'))
  return TECH_TREE.filter((node) => have.has(node.id)).map((node) => node.id)
}

export function hydrateTechLevels(raw: unknown, unlockedIds: readonly TechId[] = []): Partial<Record<TechId, number>> {
  const levels: Partial<Record<TechId, number>> = {}
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const node of TECH_TREE) {
      const n = normalizeTechLevel((raw as Record<string, unknown>)[node.id], node.maxLevel)
      if (n > 0) levels[node.id] = n
    }
  }
  for (const id of unlockedIds) {
    if (!isTechId(id)) continue
    const node = techNode(id)
    if ((levels[id] ?? 0) < 1) levels[id] = 1
    if ((levels[id] ?? 0) > node.maxLevel) levels[id] = node.maxLevel
  }
  return levels
}

function syncUnlockedFromLevels(levels: Partial<Record<TechId, number>>): TechId[] {
  return TECH_TREE.filter((node) => (levels[node.id] ?? 0) >= 1).map((node) => node.id)
}

/** 把旧档 / 测试里只写了 `unlockedTechIds` 的点落成 level=1，避免再点时冲掉。 */
function materializeTechLevels(save: Save): Partial<Record<TechId, number>> {
  const levels: Partial<Record<TechId, number>> = { ...save.techLevels }
  for (const id of save.unlockedTechIds ?? []) {
    if (!isTechId(id)) continue
    if ((levels[id] ?? 0) < 1) levels[id] = 1
  }
  return levels
}

export function hydrateTechFields(save: Save & { inspiration?: unknown; techLevels?: unknown }): void {
  const hasPoints =
    typeof save.techPoints === 'number' && Number.isFinite(save.techPoints) && save.techPoints > 0
  save.techPoints = normalizeTechPoints(hasPoints ? save.techPoints : save.inspiration)
  const unlocked = hydrateUnlockedTechIds(save.unlockedTechIds)
  save.techLevels = hydrateTechLevels(save.techLevels, unlocked)
  save.unlockedTechIds = syncUnlockedFromLevels(save.techLevels)
  syncKnightLevel(save)
}

export function techLevel(save: Save, id: TechId): number {
  const node = techNode(id)
  const fromLevels = normalizeTechLevel(save.techLevels?.[id], node.maxLevel)
  if (fromLevels > 0) return fromLevels
  return save.unlockedTechIds.includes(id) ? 1 : 0
}

export function isTechMaxed(save: Save, id: TechId): boolean {
  return techLevel(save, id) >= techNode(id).maxLevel
}

export function techProgressText(save: Save, id: TechId): string {
  return `${techLevel(save, id)}/${techNode(id).maxLevel}`
}

export function techActivateLabel(save: Save, id: TechId): string {
  const node = techNode(id)
  if (isTechMaxed(save, id)) return '已激活'
  if (techLevel(save, id) > 0) return `还可再点 · ${node.cost} 灵感`
  return `激活 · ${node.cost} 灵感`
}

export function hasTech(save: Save, id: TechId): boolean {
  return techLevel(save, id) >= 1
}

export function rowHasPurchase(save: Save, tab: TechTabId, row: number): boolean {
  const def = techRow(tab, row)
  return !!def && def.options.some((option) => hasTech(save, option.id))
}

/** 某层可买：第 1 层，或更低序号层已买过至少 1 个。本层已有旧档点亮时也可补买同行。 */
export function isRowOpen(save: Save, tab: TechTabId, row: number): boolean {
  if (row <= 1) return true
  return rowHasPurchase(save, tab, row - 1) || rowHasPurchase(save, tab, row)
}

export function researchBlockReason(save: Save, techId: string): string | null {
  if (!isTechId(techId)) return '未知科技'
  if (isTechMaxed(save, techId)) return '已经点满'
  const node = techNode(techId)
  if (!isRowOpen(save, node.tab, node.row)) return '未解锁'
  if (normalizeTechPoints(save.techPoints) < node.cost) return '灵感不足'
  return null
}

export function researchableTechs(save: Save): TechNodeDef[] {
  const out: TechNodeDef[] = []
  for (const tab of TECH_TABS) {
    for (const row of tab.rows) {
      if (!isRowOpen(save, tab.id, row.row)) continue
      for (const option of row.options) {
        if (!isTechMaxed(save, option.id)) out.push(option)
      }
    }
  }
  return out
}

export function nextTech(save: Save): TechNodeDef | null {
  return researchableTechs(save)[0] ?? null
}

export function isTechComplete(save: Save): boolean {
  return TECH_TREE.every((node) => isTechMaxed(save, node.id))
}

export function techTier(save: Save): number {
  return TECH_TREE.filter((node) => hasTech(save, node.id)).length
}

function slotCountFor(
  save: Save,
  ids: readonly TechId[],
  min: number,
  max: number,
): number {
  let bonus = 0
  for (const id of ids) bonus += techLevel(save, id)
  return Math.min(max, Math.max(min, min + bonus))
}

/** 战场订单格。初始 2，每级战场格科技 +1，封顶 4。 */
export function battlefieldSlotCount(save: Save): number {
  return slotCountFor(save, BATTLEFIELD_SLOT_TECH_IDS, BATTLEFIELD_SLOT_MIN, BATTLEFIELD_SLOT_MAX)
}

/** 商场订单格。初始 2，每级商场格科技 +1，封顶 4。 */
export function marketSlotCount(save: Save): number {
  return slotCountFor(save, MARKET_SLOT_TECH_IDS, MARKET_SLOT_MIN, MARKET_SLOT_MAX)
}

/** 两板格数合计，仅作展示 / 旧调用兼容。 */
export function encounterSlotCount(save: Save): number {
  return battlefieldSlotCount(save) + marketSlotCount(save)
}

/** 已点节点按 effectId 叠等级 × 表值。订单格走 battlefieldSlotCount / marketSlotCount，冲突走 stationConflictMul。 */
export function techEffectValue(save: Save, effectId: string): number {
  if (!effectId || effectId === NOOP_TECH_EFFECT || isSlotEffect(effectId)) return 0
  const base = TECH_EFFECT_BASE[effectId]
  if (typeof base !== 'number' || !Number.isFinite(base) || base === 0) return 0
  let levels = 0
  for (const node of TECH_TREE) {
    if (node.effectId !== effectId) continue
    levels += techLevel(save, node.id)
  }
  return levels > 0 ? base * levels : 0
}

export function stationXpMul(save: Save): number {
  return 1 + techEffectValue(save, STATION_XP_EFFECT)
}

export function miningOutputMul(save: Save): number {
  return 1 + techEffectValue(save, MINING_OUTPUT_EFFECT)
}

export function toolUpkeepBonus(save: Save): number {
  return techEffectValue(save, TOOL_UPKEEP_EFFECT)
}

export function forgeCycleMul(save: Save): number {
  return Math.max(0.1, 1 - techEffectValue(save, FORGE_CYCLE_EFFECT))
}

export function workerAtkMul(save: Save): number {
  return 1 + techEffectValue(save, WORKER_ATK_EFFECT)
}

export function workerHpMul(save: Save): number {
  return 1 + techEffectValue(save, WORKER_HP_EFFECT)
}

export function weaknessCritBonus(save: Save): number {
  return techEffectValue(save, WEAKNESS_CRIT_EFFECT)
}

export function revealExtraCount(save: Save): number {
  return Math.max(0, Math.floor(techEffectValue(save, REVEAL_EXTRA_EFFECT)))
}

export function attackIntervalMul(save: Save): number {
  return Math.max(0.1, 1 - techEffectValue(save, ATK_INTERVAL_EFFECT))
}

/** 再战已取消，始终 0。旧档点过余粮整备也不再减消耗。 */
export function rematchSupplyCut(_save: Save): number {
  return 0
}

export function campBandageHeal(hpMax: number): number {
  return Math.max(1, Math.ceil(Math.max(1, hpMax) * techEffectBaseOr(CAMP_BANDAGE_EFFECT, 0.1)))
}

function techEffectBaseOr(effectId: string, fallback: number): number {
  const base = TECH_EFFECT_BASE[effectId]
  return typeof base === 'number' && Number.isFinite(base) && base > 0 ? base : fallback
}

export function campBandageHealAmount(save: Save, hpMax: number): number {
  if (techEffectValue(save, CAMP_BANDAGE_EFFECT) <= 0) return 0
  return campBandageHeal(hpMax)
}

export function runeScrapChance(save: Save): number {
  return Math.min(1, Math.max(0, techEffectValue(save, RUNE_SCRAP_EFFECT)))
}

export function reinforceFirstMul(save: Save): number {
  return 1 + techEffectValue(save, REINFORCE_FIRST_EFFECT)
}

export function knightCycleMul(save: Save): number {
  const per = techEffectValue(save, KNIGHT_CYCLE_EFFECT)
  if (per <= 0) return 1
  const level = typeof save.knightLevel === 'number' && Number.isFinite(save.knightLevel) ? save.knightLevel : 1
  const cut = Math.min(KNIGHT_CYCLE_CAP, per * Math.floor(Math.max(0, level) / KNIGHT_CYCLE_STEP))
  return Math.max(1 - KNIGHT_CYCLE_CAP, 1 - cut)
}

/** 同 effectId 多节点按「1 + 等级 × 表值」叠乘，不是相加。 */
export function stackedBonusMul(save: Save, effectId: string): number {
  const base = TECH_EFFECT_BASE[effectId]
  if (typeof base !== 'number' || !Number.isFinite(base) || base === 0) return 1
  let mul = 1
  for (const node of TECH_TREE) {
    if (node.effectId !== effectId) continue
    const lv = techLevel(save, node.id)
    if (lv > 0) mul *= 1 + base * lv
  }
  return mul
}

export function tradeGoldMul(save: Save): number {
  return stackedBonusMul(save, TRADE_GOLD_EFFECT)
}

export function lootGoldMul(save: Save): number {
  return 1 + techEffectValue(save, LOOT_GOLD_EFFECT)
}

export function exploreCostMul(save: Save): number {
  let mul = 1 - techEffectValue(save, EXPLORE_COST_EFFECT)
  const stack = techEffectValue(save, EXPLORE_COST_STACK_EFFECT)
  if (stack > 0) mul *= 1 - stack
  return Math.max(EXPLORE_COST_FLOOR, mul)
}

export function miningDualDropBonus(save: Save): number {
  return techEffectValue(save, WILD_CRYSTAL_DROP_EFFECT)
}

export function alchemyBatchBonus(save: Save): number {
  return Math.max(0, Math.round(techEffectValue(save, ALCHEMY_BATCH_EFFECT)))
}

export function huntingHazardMul(save: Save): number {
  return Math.max(0, 1 - techEffectValue(save, HUNT_HAZARD_EFFECT))
}

export function firstStrikeCutS(save: Save): number {
  return Math.max(0, techEffectValue(save, FIRST_STRIKE_EFFECT))
}

export function runeAtkMul(save: Save): number {
  return 1 + techEffectValue(save, RUNE_ATK_EFFECT)
}

export function woundedTakenMul(save: Save): number {
  const cut = techEffectValue(save, WOUNDED_GUARD_EFFECT)
  return cut > 0 ? Math.max(0, 1 - cut) : 1
}

export function breakEchoMul(save: Save): number {
  return 1 + techEffectValue(save, BREAK_ECHO_EFFECT)
}

export function timedOrderDurationMul(save?: Save): number {
  return 1 + (save ? techEffectValue(save, TIMED_ORDER_DURATION_EFFECT) : 0)
}

export function timedOrderChanceBonus(save?: Save): number {
  return save ? techEffectValue(save, TIMED_ORDER_CHANCE_EFFECT) : 0
}

export function diamondOrderChanceBonus(save?: Save): number {
  return save ? techEffectValue(save, DIAMOND_ORDER_EFFECT) : 0
}

export function marketDiamondChance(base: number, save?: Save): number {
  const raw = (Number.isFinite(base) ? base : 0) + diamondOrderChanceBonus(save)
  return Math.min(1, Math.max(0, raw))
}

export function slagCopperValue(save: Save): number {
  return techEffectValue(save, SLAG_COPPER_EFFECT)
}

export function assistQualityFloor(save: Save, maxQuality: number): number {
  if (techEffectValue(save, ASSIST_FLOOR_EFFECT) <= 0) return 1
  const cap = Math.max(1, Math.floor(maxQuality))
  return Math.max(1, Math.min(cap, Math.floor(cap / 2)))
}

/** 按倍率放大整数产出；小数部分用存档 rng 掷一次。 */
export function scaleQtyByMul(save: Save, qty: number, mul: number): number {
  if (!Number.isFinite(qty) || qty <= 0) return 0
  if (!Number.isFinite(mul) || mul <= 0) return 0
  if (mul === 1) return Math.floor(qty)
  const raw = qty * mul
  const whole = Math.floor(raw + 1e-9)
  const frac = raw - whole
  if (frac <= 1e-9) return whole
  return whole + (roll01(save) < frac ? 1 : 0)
}

/** 结算占位。恒 no-op。 */
export function applyTechEffects(_save: Save): void {}

/** 抽人费可读科技：募兵折 −5（15→10）。 */
export function recruitCost(save: Save): number {
  return Math.max(1, RECRUIT_COST - Math.round(techEffectValue(save, RECRUIT_COST_EFFECT)))
}

/** 探索费按比例减免；`exploreCost` 用 mul，这里只给旧调用一个整数差。 */
export function exploreCostReduce(save: Save): number {
  const cut = techEffectValue(save, EXPLORE_COST_EFFECT)
  if (cut <= 0) return 0
  return cut
}

/** 离线上限：夜班油灯每级 +2 小时。 */
export function offlineCapS(save: Save): number {
  return OFFLINE_CAP_S + Math.round(techEffectValue(save, OFFLINE_HOURS_EFFECT) * 3600)
}

export function offlineCapHours(save: Save): number {
  return Math.round(offlineCapS(save) / 3600)
}

/** 合成后新人留在原站。 */
export function fuseStayAssigned(_save: Save): boolean {
  return true
}

/** 站速度乘区仍 1；匠师印章走 stationCycleS 的周期乘区。 */
export function stationTechSpeedMul(_save: Save, _stationId: StationId): number {
  return 1
}

function assignedAt(save: Save, stationId: StationId): number {
  return save.workers.filter((w) => w.assignment === stationId).length
}

/**
 * 同站正好 2 人时的冲突倍率，乘在人数 / 工具等之后。
 * 1 人或 0 人无冲突。不做吵架、掉血、拆队，也不影响战斗。
 */
function groupPairOf(stationId: StationId): readonly [StationId, StationId] | undefined {
  return PLAYABLE_CHAINS.find((pair) => pair[0] === stationId || pair[1] === stationId)
}

/** 同组两站都至少有 1 个派入工人。 */
export function groupBothStaffed(save: Save, stationId: StationId): boolean {
  const pair = groupPairOf(stationId)
  if (!pair) return false
  return assignedAt(save, pair[0]) >= 1 && assignedAt(save, pair[1]) >= 1
}

export function stationConflictMul(save: Save, stationId: StationId): number {
  if (assignedAt(save, stationId) !== 2) return STATION_CONFLICT_CLEARED_MUL
  if (hasTech(save, 'artisanArchive')) return STATION_CONFLICT_CLEARED_MUL
  let mul = hasTech(save, 'workshopRules') ? STATION_CONFLICT_RULES_MUL : STATION_CONFLICT_BASE_MUL
  if (techEffectValue(save, GROUP_CONFLICT_EFFECT) > 0 && groupBothStaffed(save, stationId)) {
    mul = 1 - (1 - mul) * GROUP_CONFLICT_PENALTY_MUL
  }
  return mul
}

/** 站卡满 2 人且仍有冲突时的提示。mul === 1 不显示。 */
export function stationConflictHint(save: Save, stationId: StationId): string | null {
  const mul = stationConflictMul(save, stationId)
  if (mul >= 1) return null
  const cutPct = Math.round((1 - mul) * 100)
  return `冲突：效率 −${cutPct}%`
}

export function researchTech(save: Save, techId: string): ActionResult {
  const blocked = researchBlockReason(save, techId)
  if (blocked) return { ok: false, reason: blocked }
  const node = techNode(techId)
  save.techPoints = normalizeTechPoints(save.techPoints) - node.cost
  const nextLevel = techLevel(save, node.id) + 1
  save.techLevels = { ...materializeTechLevels(save), [node.id]: nextLevel }
  save.unlockedTechIds = syncUnlockedFromLevels(save.techLevels)
  if (isSlotEffect(node.effectId)) {
    resizeEncounterBoard(save)
  }
  return { ok: true, message: `已点亮「${node.name}」` }
}

export function researchNextTech(save: Save): ActionResult {
  const next = nextTech(save)
  if (!next) return { ok: false, reason: '科技树已满' }
  return researchTech(save, next.id)
}

/** 已点科技按「等级 × 该层 cost」累计消耗的灵感。 */
export function spentTechPoints(save: Save): number {
  let spent = 0
  for (const node of TECH_TREE) {
    spent += techLevel(save, node.id) * node.cost
  }
  return spent
}

/** GM：清空科技进度并全额返还灵感。不改骑士等级、金币、工人、其它资源。 */
export function resetAllTech(save: Save): ActionResult {
  const refund = spentTechPoints(save)
  save.techPoints = normalizeTechPoints(save.techPoints) + refund
  save.techLevels = {}
  save.unlockedTechIds = []
  resizeEncounterBoard(save)
  return {
    ok: true,
    message: refund > 0 ? `已重置科技，返还灵感 ${refund}` : '已重置科技',
  }
}
