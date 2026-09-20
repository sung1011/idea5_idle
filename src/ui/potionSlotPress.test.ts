import { describe, expect, it } from 'vitest'
import {
  POTION_EMPTY_HOLD_TIP,
  POTION_EQUIP_HINT,
  POTION_SLOT_HOLD_MS,
  potionSlotHoldReached,
  potionSlotPressMoved,
  resolvePotionSlotRelease,
} from './potionSlotPress'
import { POTION_EFFECT_TEXT, POTION_ITEM_IDS } from '../sim/tables'

describe('potion slot press', () => {
  it('uses a filled slot on short tap and shows detail after hold', () => {
    expect(POTION_SLOT_HOLD_MS).toBe(400)
    expect(potionSlotHoldReached(399)).toBe(false)
    expect(potionSlotHoldReached(400)).toBe(true)
    expect(resolvePotionSlotRelease({ filled: true, held: false, moved: false })).toBe('use')
    expect(resolvePotionSlotRelease({ filled: true, held: true, moved: false })).toBe('detail')
  })

  it('opens install on empty tap and tips on empty hold', () => {
    expect(resolvePotionSlotRelease({ filled: false, held: false, moved: false })).toBe('install')
    expect(resolvePotionSlotRelease({ filled: false, held: true, moved: false })).toBe('emptyHint')
    expect(POTION_EQUIP_HINT).toContain('短按使用')
    expect(POTION_EMPTY_HOLD_TIP).toContain('点空槽')
  })

  it('ignores a press that moved too far', () => {
    expect(potionSlotPressMoved(10, 0)).toBe(true)
    expect(potionSlotPressMoved(3, 4)).toBe(false)
    expect(resolvePotionSlotRelease({ filled: true, held: false, moved: true })).toBe('ignore')
    expect(resolvePotionSlotRelease({ filled: true, held: true, moved: true })).toBe('ignore')
  })

  it('keeps effect copy off the install button and covers all seven potions', () => {
    expect(POTION_ITEM_IDS).toHaveLength(7)
    expect(POTION_ITEM_IDS).not.toContain('warDrum')
    for (const id of POTION_ITEM_IDS) {
      expect(POTION_EFFECT_TEXT[id].length).toBeGreaterThan(4)
    }
  })
})
