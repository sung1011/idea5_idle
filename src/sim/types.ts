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
  gold: number
  bank: Partial<Record<ItemId, number>>
  workers: Worker[]
  stations: Record<StationId, StationState>
  lastTick: number
  elapsedS: number
  nextWorkerId: number
  /** 当前出发订单。表驱动，不接战斗状态机。 */
  currentOrderId: string
  /** 接单计数，用来轮换订单（可复现）。 */
  orderIndex: number
  /** 当前单已提交，才能出发。 */
  orderSubmitted: boolean
  departCount: number
  lastDepartAt: number | null
}

export type Hint = {
  kind: 'bottleneck' | 'resonance' | 'progress'
  text: string
}
