import { describe, expect, it } from 'vitest'
import { DUNGEON_AFFIX_DEFS, DUNGEON_AFFIX_IDS, dungeonAffixEffect } from '../sim/dungeon'
import { dungeonAffixHelpCopy, isDungeonAffixHelpOpen, nextDungeonAffixHelp } from './dungeonAffixHelp'

describe('dungeon affix help bubble', () => {
  it('toggles the same affix closed and switches to another', () => {
    const first = nextDungeonAffixHelp(null, 'thickHide')
    expect(first).toBe('thickHide')
    expect(nextDungeonAffixHelp(first, 'thickHide')).toBeNull()
    expect(nextDungeonAffixHelp(first, 'richVein')).toBe('richVein')
    expect(isDungeonAffixHelpOpen(first, 'thickHide')).toBe(true)
    expect(isDungeonAffixHelpOpen(first, 'jagged')).toBe(false)
  })

  it('shows full effect text with numbers for every affix', () => {
    for (const id of DUNGEON_AFFIX_IDS) {
      const copy = dungeonAffixHelpCopy(id)
      expect(copy.title).toBe(DUNGEON_AFFIX_DEFS[id].label)
      expect(copy.effect).toBe(dungeonAffixEffect(id))
      expect(copy.effect).toMatch(/\d/)
    }
  })
})
