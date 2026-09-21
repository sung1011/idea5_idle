import { DUNGEON_AFFIX_DEFS, type DungeonAffixId } from '../sim/dungeon'

export type DungeonAffixHelpCopy = {
  title: string
  effect: string
}

/** 再点同一词缀关闭；换一个则打开新气泡。 */
export function nextDungeonAffixHelp(current: DungeonAffixId | null, next: DungeonAffixId): DungeonAffixId | null {
  return current === next ? null : next
}

export function dungeonAffixHelpCopy(id: DungeonAffixId): DungeonAffixHelpCopy {
  const def = DUNGEON_AFFIX_DEFS[id]
  return { title: def.label, effect: def.effect }
}

export function isDungeonAffixHelpOpen(current: DungeonAffixId | null, id: DungeonAffixId): boolean {
  return current === id
}
