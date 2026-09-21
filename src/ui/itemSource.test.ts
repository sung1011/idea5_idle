import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSave } from '../sim/createSave'
import {
  beginItemSourceFlash,
  clearItemSourceFlash,
  formatItemSource,
  ITEM_SOURCE_FLASH_MS,
  itemSourceFlash,
  itemSourceFlashCategories,
  itemSourceHint,
  itemSourceTip,
  isItemSourceStationFlash,
} from './itemSource'

afterEach(() => {
  clearItemSourceFlash()
  vi.useRealTimers()
})

describe('itemSourceHint', () => {
  it('maps unique outputs to station + category', () => {
    expect(itemSourceHint('tooth')).toEqual({ stationId: 'hunting', categoryIds: ['iron'] })
    expect(itemSourceHint('blood')).toEqual({ stationId: 'hunting', categoryIds: ['mithril'] })
    expect(itemSourceHint('eye')).toEqual({ stationId: 'hunting', categoryIds: ['mithril'] })
    expect(itemSourceHint('roast')).toEqual({ stationId: 'cooking', categoryIds: ['iron'] })
    expect(itemSourceHint('meal')).toEqual({ stationId: 'cooking', categoryIds: ['copper'] })
    expect(itemSourceHint('stew')).toEqual({ stationId: 'cooking', categoryIds: ['mithril'] })
    expect(itemSourceHint('ore')).toEqual({ stationId: 'mining', categoryIds: ['copper'] })
    expect(itemSourceHint('ironOre')).toEqual({ stationId: 'mining', categoryIds: ['iron'] })
    expect(itemSourceHint('mithrilOre')).toEqual({ stationId: 'mining', categoryIds: ['mithril'] })
    expect(formatItemSource(itemSourceHint('tooth')!)).toBe('狩猎·狼')
    expect(formatItemSource(itemSourceHint('roast')!)).toBe('烹饪·烤肉')
    expect(itemSourceTip('tooth', itemSourceHint('tooth')!)).toBe('牙来自狩猎·狼')
  })

  it('flashes the station for potions, runes, wildcards and single-category gathers', () => {
    expect(itemSourceHint('anyPotion')).toEqual({ stationId: 'alchemy', categoryIds: [] })
    expect(itemSourceHint('stim')).toEqual({ stationId: 'alchemy', categoryIds: [] })
    expect(itemSourceHint('potion')).toEqual({ stationId: 'alchemy', categoryIds: [] })
    expect(itemSourceHint('anyRune')).toEqual({ stationId: 'inscription', categoryIds: [] })
    expect(itemSourceHint('runeSharp')).toEqual({ stationId: 'inscription', categoryIds: [] })
    expect(itemSourceHint('herb')).toEqual({ stationId: 'herbalism', categoryIds: [] })
    expect(itemSourceHint('spice')).toEqual({ stationId: 'herbalism', categoryIds: [] })
    expect(itemSourceHint('junk')).toEqual({ stationId: 'hunting', categoryIds: [] })
    expect(itemSourceHint('wood')).toBeNull()
    expect(formatItemSource(itemSourceHint('anyPotion')!)).toBe('炼金')
  })

  it('lists every matching category when the output is shared', () => {
    expect(itemSourceHint('meat')).toEqual({
      stationId: 'hunting',
      categoryIds: ['copper', 'iron', 'mithril'],
    })
    expect(itemSourceHint('fish')).toEqual({
      stationId: 'hunting',
      categoryIds: ['copper', 'iron', 'mithril'],
    })
    expect(itemSourceHint('wildCrystal')).toEqual({
      stationId: 'mining',
      categoryIds: ['copper', 'iron', 'mithril'],
    })
  })
})

describe('beginItemSourceFlash', () => {
  it('flashes unlocked category rows and never writes selectedCategory', () => {
    const save = createSave()
    save.knightLevel = 10
    save.stations.hunting.selectedCategory = 'copper'
    save.stations.cooking.selectedCategory = 'copper'
    save.stations.mining.selectedCategory = 'iron'
    expect(beginItemSourceFlash('tooth', save)).toEqual({ stationId: 'hunting', categoryIds: ['iron'] })
    expect(itemSourceFlashCategories('hunting')).toEqual(['iron'])
    expect(isItemSourceStationFlash('hunting')).toBe(false)
    expect(save.stations.hunting.selectedCategory).toBe('copper')
    expect(beginItemSourceFlash('roast', save)).toEqual({ stationId: 'cooking', categoryIds: ['iron'] })
    expect(itemSourceFlashCategories('cooking')).toEqual(['iron'])
    expect(itemSourceFlashCategories('hunting')).toEqual([])
    expect(save.stations.cooking.selectedCategory).toBe('copper')
    expect(beginItemSourceFlash('anyPotion', save)).toEqual({ stationId: 'alchemy', categoryIds: [] })
    expect(isItemSourceStationFlash('alchemy')).toBe(true)
    expect(itemSourceFlashCategories('alchemy')).toEqual([])
  })

  it('skips the flash when the producer station is still locked', () => {
    const save = createSave()
    expect(save.knightLevel).toBe(1)
    expect(beginItemSourceFlash('tooth', save)).toEqual({ stationId: 'hunting', categoryIds: ['iron'] })
    expect(itemSourceFlash.value).toBeNull()
    expect(save.stations.hunting.selectedCategory).toBe('copper')
  })

  it('clears after ITEM_SOURCE_FLASH_MS and leaves recipes untouched', () => {
    vi.useFakeTimers()
    const save = createSave()
    save.knightLevel = 10
    save.stations.cooking.selectedCategory = 'mithril'
    beginItemSourceFlash('meal', save)
    expect(itemSourceFlash.value?.categoryIds).toEqual(['copper'])
    vi.advanceTimersByTime(ITEM_SOURCE_FLASH_MS)
    expect(itemSourceFlash.value).toBeNull()
    expect(save.stations.cooking.selectedCategory).toBe('mithril')
  })
})
