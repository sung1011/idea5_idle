export type StationKind = 'gather' | 'craft'

export type StationId =
  | 'mining'
  | 'forging'
  | 'hunting'
  | 'cooking'
  | 'herbalism'
  | 'alchemy'

/** 旧站。仍可能出现在旧档，不当现玩法站。 */
export type DeprecatedStationId = 'woodcutting' | 'fishing'

/** 锻造别称，只作文案 / 旧档映射，不是 id。 */
export type StationAlias = 'smithing'

/** 站内品类。采矿 / 锻造多档；其它站单一品类兼容。 */
export type CategoryId = 'copper' | 'iron' | 'mithril' | 'default'

export type StationToolIndexCode =
  | '01'
  | '02'
  | '03'
  | '04'
  | '05'
  | '06'
  | '07'
  | '08'
  | '09'
  | '10'
  | '11'
  | '12'
  | '13'
  | '14'
  | '15'
  | '16'
  | '17'
  | '18'
  | '19'
  | '20'

/** 每站 20 种专属工具，如 `miningTool01`。 */
export type StationToolId = `${StationId}Tool${StationToolIndexCode}`

export type ItemId =
  | 'wood'
  | 'ore'
  | 'ironOre'
  | 'mithrilOre'
  | 'slag'
  | 'fish'
  | 'junk'
  | 'meal'
  | 'roast'
  | 'stew'
  | 'potion'
  | 'stim'
  | 'salve'
  | 'renewSoup'
  | 'brinkSalve'
  | 'wardElixir'
  | 'focusDraft'
  | 'clearMind'
  | 'weapon'
  | 'ironWeapon'
  | 'mithrilWeapon'
  | 'blueprint'
  | 'meat'
  | 'blood'
  | 'tooth'
  | 'eye'
  | 'herb'
  | 'spice'
  | 'tool'
  | 'ironTool'
  | 'mithrilTool'
  | StationToolId

/** 7 种可用药剂。旧档通用 `potion` / `warDrum` 不算在内。 */
export type PotionItemId =
  | 'stim'
  | 'salve'
  | 'renewSoup'
  | 'brinkSalve'
  | 'wardElixir'
  | 'focusDraft'
  | 'clearMind'

/** 药剂时效。字段都是 `elapsedS`；到期或未开为 null。 */
export type PotionBuffs = {
  stimUntil: number | null
  renewUntil: number | null
  renewNextAt: number | null
  wardUntil: number | null
  focusUntil: number | null
  focusConsumed: StationId[]
}

export type ClassId =
  | 'laborer'
  | 'artisan'
  | 'wanderer'
  | 'miner'
  | 'fisher'
  | 'hunter'
  | 'cook'
  | 'herbalist'
  | 'smith'
  | 'alchemist'
  | 'steward'
  | 'knight'

/** 三页签行选科技节点 id。表在 `TECH_TABS`，可往后扩。 */
export type TechId = string

/** 工人品质档。1 最低（抽人默认），10 最高（不能再合成）。 */
export type QualityTier = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

export type WorkerQualityId =
  | 'white'
  | 'green'
  | 'blue'
  | 'cyan'
  | 'purple'
  | 'orange'
  | 'pink'
  | 'red'
  | 'gold'
  | 'rainbow'

export type StallReason = 'emptyInput'

export type ActionResult = { ok: true; message?: string } | { ok: false; reason: string }

export type EffectSource = 'tool' | 'food'
export type EffectId = string

/** 工具类型。按表匹配工坊：镐/锤/猎具/锅/镰/瓶架。 */
export type ToolTypeId = 'pick' | 'hammer' | 'spear' | 'pot' | 'sickle' | 'rack'

/** 工人页药剂技能槽数。只记种类，点用才扣库存。 */
export const POTION_SLOT_COUNT = 4

export type PotionSlotId = PotionItemId | null
export type PotionSlots = [PotionSlotId, PotionSlotId, PotionSlotId, PotionSlotId]

/** 锻造产出队列：进物资的同时记下 matchStationId，装备时默认按此匹配。 */
export type ForgedTool = {
  itemId: ItemId
  matchStationId: StationId
}

export type EffectInstance = {
  effectId: EffectId
  value: number
  source: EffectSource
}

export type Affix = {
  affixId: string
  effectId: EffectId
  value: number
}

export type ToolSlot = {
  itemId: ItemId
  /** 匹配此站才吃满增效 / 高阶词条 */
  matchStationId: StationId
  affixes: Affix[]
  effects: EffectInstance[]
}

export type ProductionBuff = {
  effectId: EffectId
  mul: number
  durationS: number
}

export type FoodSlot = {
  itemId: ItemId
  /** 槽内未吃完的份数（不含当前正在生效的那一份） */
  qty: number
  /** 同时仅 1 个生产 Buff */
  buff: ProductionBuff
  /** 到期墙钟；到期若 qty>=1 则自动吃 1 份刷新，否则清空；残血自动吃 1 回血 */
  expiresAt: number
  effects: EffectInstance[]
}

export type CombatStats = {
  hp: number
  atk: number
  /** 每隔多少秒出手一次。越小越快。 */
  spd: number
}

/** 工人战斗属性 / 敌人弱点。物理 6 + 元素 6。 */
export type CombatAttrId =
  | 'sword'
  | 'polearm'
  | 'dagger'
  | 'axe'
  | 'bow'
  | 'staff'
  | 'fire'
  | 'ice'
  | 'lightning'
  | 'wind'
  | 'light'
  | 'dark'

/** 杂兵 2～3 弱点；精英 / 首领 3～4。由品质映射（本章 Boss 强制首领）。 */
export type EnemyRank = 'minion' | 'elite' | 'boss'

/** 主线敌人选目标规则。表在 `combatTarget.ts`，每次出手按阶级权重抽，订单可钉死。 */
export type EnemyTargetRuleId =
  | 'all'
  | 'rand1'
  | 'rand2'
  | 'rand3'
  | 'lowestHp'
  | 'highestHp'
  | 'workshopBias'
  | 'frontlineBias'
  | 'sameStation'
  | 'cleave2'

export type CombatFighter = CombatStats & {
  id: string
  label: string
  hpMax: number
  /** 下一次出手墙钟。 */
  nextActAt: number
  /** 出战工人带上自己的属性；敌人忽略。 */
  combatAttrs?: CombatAttrId[]
}

export type CombatLogEntry = {
  at: number
  text: string
}

export type CombatOutcome = 'win' | 'lose'

/** 敌人卡上的一场战斗快照。出战不算派驻；结束把工人 hp 写回。 */
export type EnemyCombat = {
  startedAt: number
  timeoutAt: number
  workerIds: string[]
  workers: CombatFighter[]
  enemy: CombatFighter
  logs: CombatLogEntry[]
  outcome: CombatOutcome | null
  /** 开战时掷出的破防盾上限。旧档缺字段开战 / 步进时补。 */
  shieldMax?: number
  /** 当前剩余盾。命中几种弱点扣几；到 0 破防。 */
  shield?: number
  /** 破防硬直结束墙钟。未破防或缺字段为 null。 */
  stunnedUntil?: number | null
}

export type Worker = {
  id: string
  name?: string
  /** 生活职业；战斗只做三围小修正，不当成长树。 */
  classId?: ClassId
  /** 1～10。抽人默认白档；旧档缺字段 hydrate 补 1。 */
  qualityTier: QualityTier
  assignment: StationId | null
  foodSlot: FoodSlot | null
  /** 当前生命。hydrate 缺字段则按表满血。 */
  hp: number
  hpMax: number
  /**
   * 战斗等级。从 1 起。只改 HP / ATK / SPD，不改生产 / 品质。
   * 旧档缺字段 hydrate 为 1。抽人 / spawn 默认 1。
   */
  level: number
  /** 当前级内经验。仅战胜领战利品发放。旧档缺字段 hydrate 为 0。 */
  xp: number
  /**
   * 战斗属性。槽数看品质：白 0、绿蓝青 1、紫及以上 2。
   * 同工人不重复。旧档缺字段 hydrate 按品质掷点；白档空数组。
   */
  combatAttrs: CombatAttrId[]
  /**
   * 工坊劳损累计。成功产出按公式加债（含近满血一口），≥1 时扣 floor 血并减债。
   * 工人界面底色读 hp - fatigueDebt。旧档缺字段 hydrate 为 0。
   */
  fatigueDebt: number
  /**
   * 开战弹框临时助战。不进花名册、不入存档、不领持久 XP。
   * 只活在本场选人 / 开战入参里。
   */
  guest?: boolean
}

export type MiningNodeState = {
  categoryId: CategoryId
  nodeHp: number
  nodeHpMax: number
  /** 挖空后恢复完成的 elapsedS；未空为 null */
  recoverAt: number | null
}

export type StationState = {
  progress: number
  stallReason: StallReason | null
  completed: number
  resonanceStreak: number
  stationXp: number
  stationLevel: number
  selectedCategory: CategoryId
  unlockedCategories: CategoryId[]
  /** 最近一次升级 / 解锁文案，query 当 progress 提示。 */
  progressNotice: string | null
  /** 当前选中矿的节点。其它品类存在 miningNodes。 */
  miningNode?: MiningNodeState | null
  /** 各矿品类节点，切换渔场式换矿时保留恢复倒计时。 */
  miningNodes?: Partial<Record<Extract<CategoryId, 'copper' | 'iron' | 'mithril'>, MiningNodeState>>
  /** 最近一次采集结算文案（空杆 / 遇险 / 挖空）。 */
  gatherNotice?: string | null
  /** 狩猎遇险短暂停手：恢复推进的 elapsedS；未暂停为 null。 */
  gatherPauseUntil?: number | null
  /** 锻造当前工具类型（镐/锅/瓶架等）。其它站忽略。 */
  selectedToolType?: ToolTypeId | null
  /** 锻造当前要造的专属工具。其它站忽略。未解锁或非法时回 null。 */
  selectedForgeToolId?: StationToolId | null
  /** 最近一次制造结算文案（软失败 / 锻成）。 */
  craftNotice?: string | null
  /**
   * 该站下拉选中的专属工具。`null` = 无。
   * 只生效一把；未解锁或库存见底时 hydrate / 结算会清回无。
   */
  selectedToolId: StationToolId | null
  /** 站内连招 / 毒雾 / 挫败。旧档缺字段 hydrate 为零。 */
  fatigueCombo: StationFatigueCombo
}

/** 站内劳损连招。不跨站。 */
export type StationFatigueCombo = {
  /** 采药倦意 / 同菜连锅 / 深挖 / 连竿 */
  streak: number
  /** 烹饪当前菜（selectedCategory）；其它站可空 */
  key: string | null
  /** 锻造软失败挫败层，下次成功清算 */
  frustration: number
  /** 炼金站级毒雾层，停产衰减 */
  fog: number
}

export type SoftFailRoll = {
  chance: number
  outcome: 'ok' | 'softFail'
}

export type HazardRoll = {
  /** 表驱动失败率 */
  chance: number
  outcome: 'ok' | 'hazard'
}

export type GameMessage = {
  id: string
  createdAt: number
  title: string
  body: string
  read: boolean
}

export type Save = {
  /** 探索 / 黑心商人购买扣金；当铺典当 / 收购 / 部分敌人与商场订单加金。 */
  gold: number
  /** 抽工人消耗。新档 100；旧档缺字段 hydrate 补 100，已有字段（含已花到 0）不重灌。战场 / 商场部分订单掉落。 */
  diamonds: number
  /** 站间物资数量。旧档字段名仍叫 bank；无容量。 */
  bank: Partial<Record<ItemId, number>>
  workers: Worker[]
  stations: Record<StationId, StationState>
  lastTick: number
  elapsedS: number
  nextWorkerId: number
  /** 战场订单板，只放敌人。格数由 `battlefieldSlotCount` 决定：初始 2、封顶 4。 */
  encounters: Encounter[]
  /** 商场订单板，只放交易单。格数由 `marketSlotCount` 决定：初始 2、封顶 4。旧档缺字段由 hydrate 从混合板拆出。 */
  marketEncounters: Encounter[]
  /** 主线章节。从 1 起；旧档缺字段 hydrate 为 1。 */
  mainChapter: number
  /**
   * 本章已成功领取的敌人格战利品次数（0 起）。
   * 到 10 后下一张新刷出的敌人是本章 Boss；领 Boss 战后清零并进下一章。
   * 旧档缺字段 hydrate 为 0。
   */
  mainLootClaims: number
  /**
   * 左下悬浮新手任务当前步。1～4 第一阶段；5～7 第二阶段（骑士 ≥2）；8 表示七步都已领取，浮层不渲染。
   * 旧 5 步档或缺 `guideQuestRev`：按现况落到第一未完成新步。
   */
  guideQuestStep: number
  /** 引导表版本。3 = 第一步抽工人 2 次。缺或低于当前 REV 按现况重落步号。 */
  guideQuestRev: number
  /** 是否已从药剂槽点用过。hydrate 时若有时效 buff 也算。 */
  guideQuestPotionUsed: boolean
  /**
   * 是否已成交过至少一笔主线订单（交易完成或敌人已领奖）。成交后即使探索刷掉该格也仍算完成。
   * 字段名沿用旧档；旧档 `true` 或板上已完成开局当仍算完成。
   */
  starterCopperPawnDone: boolean
  /** 工匠委托留下的工坊产量加成；到期后不算。 */
  workshopBuff: WorkshopBuff | null
  /** 成功探索次数，驱动探索费用与下一板种子。 */
  exploreCount: number
  departCount: number
  lastDepartAt: number | null
  /** 消息箱。离线收益等写入这里，不再强弹顶栏。 */
  messages: GameMessage[]
  nextMessageId: number
  /** 成功离线追赶次数（seconds > 0）。 */
  offlineCount: number
  /** 采集 / 锻造掷骰种子。缺字段 hydrate 为 1。 */
  rngState: number
  /** 未装备的锻造成品类型队列，与 bank 工具数量对齐。 */
  forgedTools: ForgedTool[]
  /**
   * 工人色表版本。2 = 白为首、无灰、粉在橙红之间。
   * 缺字段或小于 2 视为旧灰表，hydrate 迁一次后盖成 2。
   */
  workerQualityRev: number
  /**
   * 骑士等级快照。由各可玩工坊 `stationLevel` 换算：
   * `knightLevel = 1 + sum(stationLevel - 1)`，等价 `sum(level) - (站数 - 1)`。
   * 每升 1 级发 1 灵感；只在当前等级高于已有快照时补发，防重复。
   * 旧档缺字段按公式写入快照，不把缺字段当成 1 去灌差额。
   */
  knightLevel: number
  /** 账号级灵感。新档 START_TECH_POINTS；骑士等级每升 1 级 +1。旧档缺字段 / 别名 `inspiration` hydrate 为点数，不无故重置成新档初始值。 */
  techPoints: number
  /**
   * 已点亮的科技 id（`techLevels[id] >= 1`）。三页签各自成串，买任意 1 个开上一层，同行可补买。
   * 旧档缺字段为 []；hydrate 时原 id 会写成 `techLevels[id] = 1`。
   */
  unlockedTechIds: TechId[]
  /**
   * 各科技已点次数。0 / 缺省 = 未买。hydrate 会按节点 `maxLevel` 夹紧。
   * 旧档只有 `unlockedTechIds` 时，对得上的 id 记 1 级。
   */
  techLevels: Partial<Record<TechId, number>>
  /**
   * 工人页 4 个药剂装配槽。只记种类，数量读物资。
   * 点槽只打六站在岗；无人在岗不扣瓶。旧档缺字段 hydrate 为空槽。
   */
  potionSlots: PotionSlots
  /**
   * 账号级药剂时效。时间轴用 `elapsedS`（与离线追赶同一套 sim 秒）。
   * 旧档缺字段 hydrate 为空。
   */
  potionBuffs: PotionBuffs
  /**
   * 主线地牢：按游戏日掷 3 词缀、1 次开战。独立战斗，不进战场板、不被探索刷新。
   * 游戏日切强制刷新（先自动发未领宝箱 / 日切判败），旧档缺字段 hydrate 补当天词缀。
   * 旧档若只存 2 条，当日实例保留，下一次日切再掷满 3 条。
   */
  dungeon: DungeonState
}

export type EncounterQuality = 'gray' | 'green' | 'blue' | 'purple' | 'orange'

/** 工匠委托给整座工坊的临时产量加成。 */
export type WorkshopBuff = {
  mul: number
  endsAt: number
}

export type EncounterKind = 'enemy' | 'blackMerchant' | 'passerby' | 'pawn' | 'artisan' | 'bulkBuy'
/** @deprecated 旧名，等同 blackMerchant / passerby / pawn */
export type MerchantKind = 'blackMerchant' | 'passerby' | 'pawn'

export type EncounterNeedMap = Partial<Record<ItemId, number>>

type EncounterBase = {
  id: string
  label: string
  quality: EncounterQuality
  /** 商场限时单：过期墙钟。缺字段或已成交不当限时。 */
  timedUntil?: number | null
}

export type EnemyEncounter = EncounterBase & {
  kind: 'enemy'
  needs: EncounterNeedMap
  /** 战胜后点「战利品」发金币。与 lootDiamonds 互斥；钻石单为 0。 */
  lootGold: number
  /** 战胜后点「战利品」发钻石。与 lootGold 互斥；金币单或缺字段为 0。 */
  lootDiamonds?: number
  /** 旧两步流程残留。新档不写；仅 hydrate 用来让「已扣货未开战」免再扣。 */
  submitted?: boolean
  /** 成功开过战。统计用；主流程看 combat / lootClaimed。 */
  departed: boolean
  /** 旧行军墙钟。新档不写；hydrate 把「已出发未领奖」迁成胜可领。 */
  marchEndsAt?: number | null
  /** 当前/最近一场战斗。未开过为 null。 */
  combat: EnemyCombat | null
  lootClaimed: boolean
  /** 杂兵 / 精英 / 首领。决定弱点条数、超时与战斗倍率。 */
  enemyRank: EnemyRank
  /** 本章主线 Boss。领取战利品后进下一章。旧档 / 普通敌缺字段视为 false。 */
  chapterBoss?: boolean
  /** 真实弱点。卡面开战前按阶级预暴露（杂兵 2 / 精英 1 / 首领 0），命中未暴露项再揭示。 */
  weaknesses: CombatAttrId[]
  /** 已揭示弱点（含阶级初始暴露）。同一单增援 / 超时后再开战仍保留；换新敌 / 刷掉本单清空。 */
  revealedWeaknesses: CombatAttrId[]
  /**
   * 钉死本单选目标规则。缺省则每次出手按阶级 + 品质权重表抽。
   * 旧档缺字段不补，开战现抽。
   */
  targetRuleId?: EnemyTargetRuleId
  /** 地牢单：下次轮转选目标规则的墙钟。 */
  targetRuleUntil?: number | null
  /** 主线地牢独立战，不进战场板。 */
  dungeon?: boolean
  dungeonPhase?: number
  dungeonPhaseReached?: number
  dungeonMechanic?: 'cleave' | 'workshopSmash' | 'enrage'
  dungeonPendingPhase?: boolean
  dungeonShieldBonus?: number
  /**
   * 战场敌人格词缀（与地牢共用词缀池，每卡 1 条）。商场单不写。
   * 探索刷新该格时重掷。旧档缺字段：非进行中的战斗卡 hydrate 补 1 条。
   */
  affixId?: DungeonAffixId
}

export type DungeonAffixId =
  | 'thickHide'
  | 'quickened'
  | 'heavyHands'
  | 'ironShield'
  | 'jagged'
  | 'richVein'
  | 'shortStun'
  | 'workshopRage'
  | 'slowReinforce'
  | 'dullEdge'

export type DungeonState = {
  day: number
  /** 日切刷新时锁定的主线章节。当日不随章节上涨重算。 */
  chapter: number
  affixIds: DungeonAffixId[]
  attemptsUsed: number
  encounter: EnemyEncounter
}

export type BlackMerchantEncounter = EncounterBase & {
  kind: 'blackMerchant'
  buyGold: number
  buyOffers: EncounterNeedMap
  completed: boolean
}

/** 旧存档 kind。hydrate 会迁成 blackMerchant。 */
export type ShadyEncounter = BlackMerchantEncounter

export type PasserbyEncounter = EncounterBase & {
  kind: 'passerby'
  wants: EncounterNeedMap
  offers: EncounterNeedMap
  completed: boolean
}

export type PawnEncounter = EncounterBase & {
  kind: 'pawn'
  /** 可典当：玩家交出的物资。 */
  pawnWants: EncounterNeedMap
  /** 品质加成后的成交金。与 rewardDiamonds 互斥；钻石单为 0。 */
  rewardGold?: number
  /** 成交钻石。与 rewardGold 互斥；金币单或缺字段为 0。 */
  rewardDiamonds?: number
  completed: boolean
}

/** 旧存档 kind。hydrate 会迁成 pawn。 */
export type PawnshopEncounter = PawnEncounter

export type ArtisanEncounter = EncounterBase & {
  kind: 'artisan'
  wants: EncounterNeedMap
  /** 委托货币：与 rewardDiamonds 互斥。旧单多为 0（只给 buff）。 */
  rewardGold: number
  rewardDiamonds?: number
  buffMul: number
  buffDurationS: number
  completed: boolean
}

export type BulkBuyEncounter = EncounterBase & {
  kind: 'bulkBuy'
  wants: EncounterNeedMap
  rewardGold: number
  rewardDiamonds?: number
  completed: boolean
}

export type TradeEncounter =
  | BlackMerchantEncounter
  | PasserbyEncounter
  | PawnEncounter
  | ArtisanEncounter
  | BulkBuyEncounter

export type MerchantEncounter = BlackMerchantEncounter | PasserbyEncounter | PawnEncounter

export type Encounter = EnemyEncounter | TradeEncounter

export type Hint = {
  kind: 'bottleneck' | 'progress'
  text: string
}
