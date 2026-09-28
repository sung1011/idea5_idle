/** 夺宝三个动作：16×16 单色 path，与工坊六站、底栏同一套填色。孔洞用 evenodd。 */
export const TREASURE_ACT_ICON_IDS = ['scout', 'raid', 'dig'] as const

export type TreasureActIconId = (typeof TREASURE_ACT_ICON_IDS)[number]

export const TREASURE_ACT_ICON_PATHS: Record<TreasureActIconId, readonly string[]> = {
  scout: [
    'M1.1 8C3.4 4.35 5.55 3.15 8 3.15C10.45 3.15 12.6 4.35 14.9 8C12.6 11.65 10.45 12.85 8 12.85C5.55 12.85 3.4 11.65 1.1 8Z'
      + 'M8 6.05A1.95 1.95 0 1 0 8.01 6.05Z',
    'M8 7.05A0.95 0.95 0 1 0 8.01 7.05Z',
  ],
  raid: [
    'M0.95 3.15L4.55 0.95L6.05 2.55L3.25 4.35Z',
    'M3.85 4.85L5.85 3.15L14.65 13.45L12.65 15.05Z',
    'M1.35 12.55L2.95 14.35L14.55 3.15L12.95 1.35Z',
    'M4.35 10.15L6.45 12.25L5.4 13.3L3.3 11.2Z',
  ],
  dig: [
    'M1.15 6.15C2.55 3.15 4.55 2.35 6.05 3.85L7.35 5.15L5.85 6.45C4.75 5.55 3.65 5.75 2.55 7.05Z',
    'M14.85 6.15C13.45 3.15 11.45 2.35 9.95 3.85L8.65 5.15L10.15 6.45C11.25 5.55 12.35 5.75 13.45 7.05Z',
    'M7.2 6.35H8.8V14.85H7.2Z',
  ],
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
