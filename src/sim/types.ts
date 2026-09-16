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
  /** 偶遇板，固定 5 格。 */
  encounters: Encounter[]
  /** 成功探索次数，驱动探索费用与下一板种子。 */
  exploreCount: number
  departCount: number
  lastDepartAt: number | null
}

export type MerchantKind = 'shady' | 'passerby' | 'pawnshop'
export type EncounterKind = 'enemy' | MerchantKind
export type EncounterDistance = 'near' | 'far'
export type EncounterPower = 'weak' | 'strong'

export type EncounterNeedMap = Partial<Record<ItemId, number>>

export type EnemyEncounter = {
  kind: 'enemy'
  id: string
  label: string
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

export type ShadyEncounter = {
  kind: 'shady'
  id: string
  label: string
  buyGold: number
  buyOffers: EncounterNeedMap
  completed: boolean
}

export type PasserbyEncounter = {
  kind: 'passerby'
  id: string
  label: string
  wants: EncounterNeedMap
  offers: EncounterNeedMap
  completed: boolean
}

export type PawnshopEncounter = {
  kind: 'pawnshop'
  id: string
  label: string
  /** 可典当：玩家交出的银行物品。 */
  pawnWants: EncounterNeedMap
  completed: boolean
}

export type MerchantEncounter = ShadyEncounter | PasserbyEncounter | PawnshopEncounter

export type Encounter = EnemyEncounter | MerchantEncounter

export type Hint = {
  kind: 'bottleneck' | 'resonance' | 'progress'
  text: string
}
