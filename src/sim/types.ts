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
  /** 抽人 / 探索 / 商人购买扣金；卖货 / 出发补给金加金。 */
  gold: number
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

export type EncounterKind = 'enemy' | 'merchant'
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
  departGold: number
  submitted: boolean
  departed: boolean
}

export type MerchantEncounter = {
  kind: 'merchant'
  id: string
  label: string
  /** 收购：玩家付出的银行物品。 */
  wants: EncounterNeedMap
  /** 以物易物换得。 */
  offers: EncounterNeedMap
  buyGold: number
  /** 金币购买换得。 */
  buyOffers: EncounterNeedMap
  completed: boolean
}

export type Encounter = EnemyEncounter | MerchantEncounter

export type Hint = {
  kind: 'bottleneck' | 'resonance' | 'progress'
  text: string
}
