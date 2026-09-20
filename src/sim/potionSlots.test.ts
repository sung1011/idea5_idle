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
  it('hydrates missing or dirty slots to four empties and maps old potion to salve', () => {
    expect(blankPotionSlots()).toEqual([null, null, null, null])
    expect(hydratePotionSlots(undefined)).toEqual([null, null, null, null])
    expect(hydratePotionSlots(['potion', 'meal', 'potion', 'salve', 'stim'])).toEqual([
      'salve',
      null,
      null,
      null,
    ])
  })

  it('installs a unique potion type from inventory and can clear the slot', () => {
    const save = createSave()
    expect(installPotionSlot(save, 0, 'salve').ok).toBe(false)
    save.bank.salve = 3
    expect(availablePotionInstallIds(save)).toEqual(['salve'])
    expect(installPotionSlot(save, 0, 'salve').ok).toBe(true)
    expect(save.potionSlots).toEqual(['salve', null, null, null])
    expect(potionSlotItem(save, 0)).toBe('salve')
    expect(save.bank.salve).toBe(3)
    expect(availablePotionInstallIds(save)).toEqual([])
    expect(installPotionSlot(save, 1, 'salve').ok).toBe(false)
    expect(clearPotionSlot(save, 0).ok).toBe(true)
    expect(save.potionSlots).toEqual([null, null, null, null])
    expect(availablePotionInstallIds(save)).toEqual(['salve'])
  })

  it('keeps potion slots through persist / load', () => {
    const raw = {
      ...createSave(),
      potionSlots: ['salve', null, null, null],
      bank: { salve: 2 },
    }
    const save = hydrateLoadedSave(raw)
    expect(save?.potionSlots).toEqual(['salve', null, null, null])
    const again = hydrateLoadedSave({
      ...createSave(),
      potionSlots: undefined,
    })
    expect(again?.potionSlots).toEqual([null, null, null, null])
  })
})
