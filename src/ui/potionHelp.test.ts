import { describe, expect, it } from 'vitest'
import { POTION_EFFECT_TEXT, POTION_ITEM_IDS } from '../sim/tables'
import { isPotionHelpOpen, nextPotionHelp, POTION_EQUIP_HINT, potionHelpCopy } from './potionHelp'

describe('potion help bubble', () => {
  it('toggles the same ? closed and switches to another potion', () => {
    const first = nextPotionHelp(null, { source: 'pick', id: 'salve' })
    expect(first).toEqual({ source: 'pick', id: 'salve' })
    expect(nextPotionHelp(first, { source: 'pick', id: 'salve' })).toBeNull()
    expect(nextPotionHelp(first, { source: 'pick', id: 'stim' })).toEqual({ source: 'pick', id: 'stim' })
    expect(nextPotionHelp(first, { source: 'slot', id: 'salve' })).toEqual({ source: 'slot', id: 'salve' })
    expect(isPotionHelpOpen(first, 'pick', 'salve')).toBe(true)
    expect(isPotionHelpOpen(first, 'slot', 'salve')).toBe(false)
  })

  it('shows name and effect, and stock only for installed slots', () => {
    expect(potionHelpCopy('stim')).toEqual({
      title: '兴奋剂',
      effect: POTION_EFFECT_TEXT.stim,
    })
    expect(potionHelpCopy('salve', 4)).toEqual({
      title: '回春散',
      effect: POTION_EFFECT_TEXT.salve,
      stock: 4,
    })
    expect(POTION_EQUIP_HINT).toContain('点？看效果')
    expect(POTION_EQUIP_HINT).not.toContain('按住')
  })

  it('covers all seven potion effect texts', () => {
    expect(POTION_ITEM_IDS).toHaveLength(7)
    for (const id of POTION_ITEM_IDS) {
      expect(potionHelpCopy(id).effect).toBe(POTION_EFFECT_TEXT[id])
    }
  })
})
