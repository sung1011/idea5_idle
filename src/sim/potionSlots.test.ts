import { describe, expect, it } from 'vitest'
import { createSave } from './createSave'
import { hydrateLoadedSave } from '../ui/saveGame'
import { POTION_INSTALL_GROUPS, POTION_ITEM_IDS } from './tables'
import {
  availablePotionInstallIds,
  blankPotionSlots,
  clearPotionSlot,
  hydratePotionSlots,
  installPotionSlot,
  potionInstallGroups,
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
    expect(hydratePotionSlots(['warDrum', 'salve', null, null])).toEqual([null, 'salve', null, null])
    expect(hydratePotionSlots(['focusDraft', 'wardElixir', 'salve', null])).toEqual([
      'doubleMist',
      'rushPowder',
      'salve',
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

  it('lists installable potions under 提效 then 加血 and drops empty groups', () => {
    expect(POTION_INSTALL_GROUPS.map((group) => group.label)).toEqual(['提效', '加血'])
    expect(POTION_INSTALL_GROUPS[0].ids).toEqual(['stim', 'rushPowder', 'doubleMist'])
    expect(POTION_INSTALL_GROUPS[1].ids).toEqual(['salve', 'renewSoup', 'brinkSalve', 'clearMind'])
    const members = POTION_INSTALL_GROUPS.flatMap((group) => group.ids)
    expect(members).toHaveLength(POTION_ITEM_IDS.length)
    expect(new Set(members)).toEqual(new Set(POTION_ITEM_IDS))

    const save = createSave()
    expect(potionInstallGroups(save)).toEqual([])

    save.bank.doubleMist = 1
    save.bank.stim = 2
    save.bank.clearMind = 1
    save.bank.salve = 3
    expect(potionInstallGroups(save)).toEqual([
      { label: '提效', ids: ['stim', 'doubleMist'] },
      { label: '加血', ids: ['salve', 'clearMind'] },
    ])

    save.potionSlots[0] = 'stim'
    save.bank.doubleMist = 0
    expect(potionInstallGroups(save)).toEqual([{ label: '加血', ids: ['salve', 'clearMind'] }])
    expect(potionInstallGroups(save).some((group) => group.label === '提效')).toBe(false)
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
