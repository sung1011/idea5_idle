import type { ClassId, CombatSkillId } from '../types'

export type CombatSkillDef = {
  id: CombatSkillId
  classId: ClassId
  label: string
  unlockLevel: number
  goldCost: number
}

export const COMBAT_SKILL_DEF: Record<CombatSkillId, CombatSkillDef> = {
  slash: { id: 'slash', classId: 'warrior', label: '斩击', unlockLevel: 1, goldCost: 20 },
  guard: { id: 'guard', classId: 'warrior', label: '格挡', unlockLevel: 3, goldCost: 80 },
  aimedShot: { id: 'aimedShot', classId: 'ranger', label: '瞄准射击', unlockLevel: 1, goldCost: 20 },
  snare: { id: 'snare', classId: 'ranger', label: '陷阱', unlockLevel: 3, goldCost: 80 },
  firebolt: { id: 'firebolt', classId: 'sorcerer', label: '火矢', unlockLevel: 1, goldCost: 20 },
  frostShield: { id: 'frostShield', classId: 'sorcerer', label: '霜盾', unlockLevel: 3, goldCost: 80 },
}

export const COMBAT_SKILL_IDS: CombatSkillId[] = [
  'slash',
  'guard',
  'aimedShot',
  'snare',
  'firebolt',
  'frostShield',
]
