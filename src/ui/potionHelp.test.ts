import { describe, expect, it } from 'vitest'
import { POTION_EFFECT_TEXT, POTION_ITEM_IDS } from '../sim/tables'
import { isPotionHelpOpen, nextPotionHelp, POTION_EQUIP_HINT, potionHelpCopy } from './potionHelp'
import workersPanelSource from './workersPanelV2.vue?raw'

describe('potion help bubble', () => {
  it('toggles the same ? closed and switches to another potion', () => {
    const first = nextPotionHelp(null, { source: 'pick', id: 'salve' })
    expect(first).toEqual({ source: 'pick', id: 'salve' })
    expect(nextPotionHelp(first, { source: 'pick', id: 'salve' })).toBeNull()
    expect(nextPotionHelp(first, { source: 'pick', id: 'stim' })).toEqual({ source: 'pick', id: 'stim' })
    expect(nextPotionHelp(first, { source: 'slot', id: 'salve', index: 0 })).toEqual({
      source: 'slot',
      id: 'salve',
      index: 0,
    })
    const slot = nextPotionHelp(null, { source: 'slot', id: 'salve', index: 1 })
    expect(nextPotionHelp(slot, { source: 'slot', id: 'salve', index: 0 })?.index).toBe(0)
    expect(nextPotionHelp(slot, { source: 'slot', id: 'salve', index: 1 })).toBeNull()
    expect(isPotionHelpOpen(slot, 'slot', 'salve', 1)).toBe(true)
    expect(isPotionHelpOpen(slot, 'slot', 'salve', 0)).toBe(false)
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
    expect(POTION_EQUIP_HINT).toContain('点 i 看效果')
    expect(POTION_EQUIP_HINT).not.toContain('按住')
    expect(POTION_EQUIP_HINT).not.toContain('问号')
    expect(POTION_EQUIP_HINT).not.toContain('？')
  })

  it('puts an info button on filled slots and unloads from the bubble', () => {
    expect(workersPanelSource).toContain('>i</span>')
    const equipAt = workersPanelSource.indexOf('aria-label="装配药剂"')
    const bubbleAt = workersPanelSource.indexOf('data-potion-bubble', equipAt)
    const equip = workersPanelSource.slice(equipAt, bubbleAt)
    expect(equip).toContain('potionPickGroups')
    expect(equip).toContain('group.label')
    expect(equip).toContain('>i</button>')
    expect(equip).toContain('没有可装的药剂')
    expect(equip).not.toContain('提效率')
    expect(equip).not.toContain('？')
    expect(workersPanelSource).toContain('aria-label="`查看 ${ITEM_DEF[itemId].label} 效果`"')
    expect(workersPanelSource).toContain('canUnequipPotionHelp')
    expect(workersPanelSource).toContain('game.clearPotionSlot(key.index)')
    expect(workersPanelSource).toContain('>卸下</button>')
    expect(workersPanelSource).not.toContain('class="unequip"')
    expect(workersPanelSource).not.toContain('>×</span>')
  })

  it('covers all seven potion effect texts', () => {
    expect(POTION_ITEM_IDS).toHaveLength(7)
    for (const id of POTION_ITEM_IDS) {
      expect(potionHelpCopy(id).effect).toBe(POTION_EFFECT_TEXT[id])
    }
  })
})
