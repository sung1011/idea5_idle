export type ClassId = 'warrior' | 'ranger' | 'sorcerer'

export type CombatSkillId =
  | 'slash'
  | 'guard'
  | 'aimedShot'
  | 'snare'
  | 'firebolt'
  | 'frostShield'

export type LifeId = 'mining' | 'woodcutting' | 'alchemy'

export type ItemId = 'log' | 'oakLog' | 'herb' | 'minorPotion' | 'copperOre'

export type TreeId = 'normalTree' | 'oakTree'

export type MineNodeId = 'copperNode'

export type AlchemyRecipeId = 'brewMinor'

export type ActionResult = { ok: true } | { ok: false; reason: string }

export type LifeTrack = {
  lifeLevel: number
  lifeXp: number
}

export type WoodcuttingAssignment = {
  type: 'life'
  lifeId: 'woodcutting'
  treeId: TreeId
  progressS: number
}

export type AlchemyAssignment = {
  type: 'life'
  lifeId: 'alchemy'
  recipeId: AlchemyRecipeId
  batchQty: number
  batchRemainS: number
}

export type MiningAssignment = {
  type: 'life'
  lifeId: 'mining'
  nodeId: MineNodeId
  progressS: number
}

export type CombatAssignment = {
  type: 'combat'
  target: 'dummy'
  progressS: number
}

export type Assignment =
  | WoodcuttingAssignment
  | AlchemyAssignment
  | MiningAssignment
  | CombatAssignment
  | null

export type Worker = {
  id: string
  name?: string
  classId: ClassId
  combatLevel: number
  combatXp: number
  knownCombatSkills: CombatSkillId[]
  assignment: Assignment
}

export type Save = {
  gold: number
  bank: Partial<Record<ItemId, number>>
  workers: Worker[]
  life: {
    woodcutting: LifeTrack
    alchemy: LifeTrack
    mining: LifeTrack
  }
  lastTick: number
  elapsedS: number
  nextWorkerId: number
}
