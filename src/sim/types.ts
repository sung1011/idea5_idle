export type StationId =
  | 'woodcutting'
  | 'mining'
  | 'alchemy'
  | 'fishing'
  | 'cooking'
  | 'forging'

export type ItemId = 'wood' | 'ore' | 'slag' | 'fish' | 'meal' | 'potion' | 'weapon' | 'blueprint'

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
  kind: 'bottleneck' | 'resonance'
  text: string
}
