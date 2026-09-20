import { describe, expect, it } from 'vitest'
import { createSave } from './createSave'
import { hydrateLoadedSave } from '../ui/saveGame'
import {
  availablePotionInstallIds,
  blankPotionSlots,
  clearPotionSlot,
  hydratePotionSlots,
  installPotionSlot,
  potionSlotItem,
} from './potionSlots'

describe('potion skill slots', () => {
  it('hydrates missing or dirty slots to four empties', () => {
    expect(blankPotionSlots()).toEqual([null, null, null, null])
    expect(hydratePotionSlots(undefined)).toEqual([null, null, null, null])
    expect(hydratePotionSlots(['potion', 'meal', 'potion', 'potion', 'potion'])).toEqual([
      'potion',
      null,
      null,
      null,
    ])
  })

  it('installs a unique potion type from inventory and can clear the slot', () => {
    const save = createSave()
    expect(installPotionSlot(save, 0, 'potion').ok).toBe(false)
    save.bank.potion = 3
    expect(availablePotionInstallIds(save)).toEqual(['potion'])
    expect(installPotionSlot(save, 0, 'potion').ok).toBe(true)
    expect(save.potionSlots).toEqual(['potion', null, null, null])
    expect(potionSlotItem(save, 0)).toBe('potion')
    expect(save.bank.potion).toBe(3)
    expect(availablePotionInstallIds(save)).toEqual([])
    expect(installPotionSlot(save, 1, 'potion').ok).toBe(false)
    expect(clearPotionSlot(save, 0).ok).toBe(true)
    expect(save.potionSlots).toEqual([null, null, null, null])
    expect(availablePotionInstallIds(save)).toEqual(['potion'])
  })

  it('keeps potion slots through persist / load', () => {
    const raw = {
      ...createSave(),
      potionSlots: ['potion', null, null, null],
      bank: { potion: 2 },
    }
    const save = hydrateLoadedSave(raw)
    expect(save?.potionSlots).toEqual(['potion', null, null, null])
    const again = hydrateLoadedSave({
      ...createSave(),
      potionSlots: undefined,
    })
    expect(again?.potionSlots).toEqual([null, null, null, null])
  })
})
