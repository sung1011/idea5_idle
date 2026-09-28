import { ACT_ICON_PATHS, type ActIconId } from './actIcons'

/** 夺宝三个动作，路径与全局操作图标同一套。 */
export const TREASURE_ACT_ICON_IDS = ['scout', 'raid', 'dig'] as const satisfies readonly ActIconId[]

export type TreasureActIconId = (typeof TREASURE_ACT_ICON_IDS)[number]

export const TREASURE_ACT_ICON_PATHS: Record<TreasureActIconId, readonly string[]> = {
  scout: ACT_ICON_PATHS.scout,
  raid: ACT_ICON_PATHS.raid,
  dig: ACT_ICON_PATHS.dig,
}

export function treasureActIconPaths(id: TreasureActIconId): readonly string[] {
  return TREASURE_ACT_ICON_PATHS[id]
}

export function allTreasureActIconsReady(): boolean {
  const seen = new Set<string>()
  for (const id of TREASURE_ACT_ICON_IDS) {
    const paths = TREASURE_ACT_ICON_PATHS[id]
    if (!paths?.some((d) => d.length > 0)) return false
    const sig = paths.join('\n')
    if (seen.has(sig)) return false
    seen.add(sig)
  }
  return seen.size === TREASURE_ACT_ICON_IDS.length
}
