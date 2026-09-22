import { describe, expect, it } from 'vitest'
import { ENCOUNTER_KIND_LABEL } from '../sim/encounters'
import type { EncounterKind } from '../sim/types'
import { encounterCardKindTitle } from './encounterKindTitle'

const OTHER_KINDS = ['blackMerchant', 'passerby', 'pawn', 'artisan', 'bulkBuy'] as const satisfies readonly EncounterKind[]

describe('encounter card kind title', () => {
  it('omits the enemy type word on battlefield and dungeon cards', () => {
    expect(encounterCardKindTitle('enemy')).toBeNull()
    expect(ENCOUNTER_KIND_LABEL.enemy).toBe('敌人')
  })

  it('keeps kind titles for market and other orders', () => {
    for (const kind of OTHER_KINDS) {
      expect(encounterCardKindTitle(kind)).toBe(ENCOUNTER_KIND_LABEL[kind])
      expect(encounterCardKindTitle(kind)).not.toBe('敌人')
    }
  })
})
