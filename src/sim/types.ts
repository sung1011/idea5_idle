export type StationId =
  | 'woodcutting'
  | 'mining'
  | 'alchemy'
  | 'fishing'
  | 'cooking'
  | 'forging'

/** 站内品类。采矿 / 锻造第一期多档；其它站单一品类兼容。 */
export type CategoryId = 'copper' | 'iron' | 'mithril' | 'default'

export type ItemId =
  | 'wood'
  | 'ore'
  | 'ironOre'
  | 'mithrilOre'
  | 'slag'
  | 'fish'
  | 'meal'
  | 'potion'
  | 'weapon'
  | 'ironWeapon'
  | 'mithrilWeapon'
  | 'blueprint'

export type ClassId = 'laborer' | 'artisan' | 'wanderer'

export type StallReason = 'emptyInput' | 'fullOutput'

export type ActionResult = { ok: true; message?: string } | { ok: false; reason: string }

export type Worker = {
  id: string
  name?: string
  /** 占位。第一期不当战斗成长用。 */
  classId?: ClassId
  assignment: StationId | null
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
}

export type GameMessage = {
  id: string
  createdAt: number
  title: string
  body: string
  read: boolean
}

export type Save = {
  /** 抽人 / 探索 / 黑心商人购买扣金；卖货 / 当铺典当 / 敌人战利品加金。不接战斗。 */
  gold: number
  /** 高级代币占位。默认 0，本轮没有获得途径。 */
  diamonds: number
  bank: Partial<Record<ItemId, number>>
  workers: Worker[]
  stations: Record<StationId, StationState>
  lastTick: number
  elapsedS: number
  nextWorkerId: number
  /** 偶遇板，固定 6 格。 */
  encounters: Encounter[]
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
export type EncounterDistance = 'near' | 'far'
export type EncounterPower = 'weak' | 'strong'

export type EncounterNeedMap = Partial<Record<ItemId, number>>

type EncounterBase = {
  id: string
  label: string
  quality: EncounterQuality
}

export type EnemyEncounter = EncounterBase & {
  kind: 'enemy'
  distance: EncounterDistance
  power: EncounterPower
  needs: EncounterNeedMap
  /** 行军结束后点「战利品」只发这笔金币，不进银行物资。 */
  lootGold: number
  /** 旧两步流程残留。新档不写；仅 hydrate 用来让「已扣货未出发」免再扣。 */
  submitted?: boolean
  departed: boolean
  /** 行军结束墙钟；未出发为 null。 */
  marchEndsAt: number | null
  lootClaimed: boolean
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
  /** 可典当：玩家交出的银行物品。 */
  pawnWants: EncounterNeedMap
  /** 品质加成后的成交金。缺省则按当铺价表现算。 */
  rewardGold?: number
  completed: boolean
}

/** 旧存档 kind。hydrate 会迁成 pawn。 */
export type PawnshopEncounter = PawnEncounter

export type ArtisanEncounter = EncounterBase & {
  kind: 'artisan'
  wants: EncounterNeedMap
  rewardGold: number
  buffMul: number
  buffDurationS: number
  completed: boolean
}

export type BulkBuyEncounter = EncounterBase & {
  kind: 'bulkBuy'
  wants: EncounterNeedMap
  rewardGold: number
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
  kind: 'bottleneck' | 'resonance' | 'progress'
  text: string
}
