export type CombatLevelDef = {
  level: number
  xp: number
}

/** 战斗等级表。至少到 Lv5。生活技能不读这张表。 */
export const COMBAT_LEVEL_DEF: CombatLevelDef[] = [
  { level: 1, xp: 0 },
  { level: 2, xp: 50 },
  { level: 3, xp: 150 },
  { level: 4, xp: 320 },
  { level: 5, xp: 560 },
]

export function combatXpToLevel(xp: number): number {
  let level = 1
  for (const row of COMBAT_LEVEL_DEF) {
    if (xp >= row.xp) level = row.level
  }
  return level
}
