import { describe, expect, it } from 'vitest'
import { PLAYABLE_CHAINS, PLAYABLE_STATION_IDS, STATION_ORDER } from '../sim/tables'
import {
  DEFAULT_WORKSHOP_GROUP,
  DEFAULT_WORKSHOP_TAB,
  LEGACY_WORKSHOP_LINE_KEY,
  DISPATCH_STATION_IDS,
  WORKSHOP_GROUPS,
  WORKSHOP_RAIL_ROW_COUNT,
  WORKSHOP_TAB_IDS,
  WORKSHOP_TAB_KEY,
  isWorkshopGroupId,
  isWorkshopTabId,
  loadWorkshopTab,
  saveWorkshopTab,
  WORKSHOP_GROUP_PROGRESS,
  stationProgressStyle,
  stationsOfWorkshopGroup,
  workshopGroupProgressStyle,
  workshopGroupLabel,
  workshopGroupOf,
  workshopGroupOfStation,
  workshopTabLabel,
  workshopTabOf,
} from './workshopTabs'

function memory(): Storage {
  const bag = new Map<string, string>()
  return {
    get length() {
      return bag.size
    },
    clear() {
      bag.clear()
    },
    getItem(key: string) {
      return bag.has(key) ? bag.get(key)! : null
    },
    key(index: number) {
      return [...bag.keys()][index] ?? null
    },
    removeItem(key: string) {
      bag.delete(key)
    },
    setItem(key: string, value: string) {
      bag.set(key, value)
    },
  }
}

describe('workshopTabs', () => {
  it('lists six station tabs without fishing, matching workshop groups', () => {
    expect(STATION_ORDER).toEqual([
      'herbalism',
      'alchemy',
      'hunting',
      'cooking',
      'mining',
      'forging',
    ])
    expect(WORKSHOP_TAB_IDS).toEqual(STATION_ORDER)
    expect(PLAYABLE_STATION_IDS).toEqual([...STATION_ORDER])
    expect(WORKSHOP_GROUPS.flatMap((row) => row.stations)).toEqual([...STATION_ORDER])
    expect(PLAYABLE_CHAINS.flatMap((pair) => pair)).toEqual([...STATION_ORDER])
    expect(WORKSHOP_TAB_IDS.map(workshopTabLabel)).toEqual([
      '采药',
      '炼金',
      '狩猎',
      '烹饪',
      '采矿',
      '锻造',
    ])
    expect(WORKSHOP_RAIL_ROW_COUNT).toBe(7)
  })

  it('groups workshop stations as 药剂 / 食物 / 武器', () => {
    expect(WORKSHOP_GROUPS.map((row) => [row.id, row.label, ...row.stations])).toEqual([
      ['potion', '药剂', 'herbalism', 'alchemy'],
      ['food', '食物', 'hunting', 'cooking'],
      ['weapon', '武器', 'mining', 'forging'],
    ])
    expect(WORKSHOP_GROUPS.map((row) => workshopGroupLabel(row.id))).toEqual(['药剂', '食物', '武器'])
    expect(DEFAULT_WORKSHOP_GROUP).toBe('potion')
    expect(DEFAULT_WORKSHOP_TAB).toBe('herbalism')
    expect(workshopGroupOfStation('herbalism')).toBe('potion')
    expect(workshopGroupOfStation('alchemy')).toBe('potion')
    expect(workshopGroupOfStation('hunting')).toBe('food')
    expect(workshopGroupOfStation('cooking')).toBe('food')
    expect(workshopGroupOfStation('mining')).toBe('weapon')
    expect(workshopGroupOfStation('forging')).toBe('weapon')
    expect(DISPATCH_STATION_IDS).toEqual([...STATION_ORDER])
    expect(DISPATCH_STATION_IDS).toEqual(['herbalism', 'alchemy', 'hunting', 'cooking', 'mining', 'forging'])
    expect(stationsOfWorkshopGroup('potion')).toEqual(['herbalism', 'alchemy'])
    expect(isWorkshopGroupId('potion')).toBe(true)
    expect(isWorkshopGroupId('mining')).toBe(false)
    expect(workshopGroupOf('alchemy')).toBe('potion')
    expect(workshopGroupOf('brew')).toBe('potion')
    expect(workshopGroupOf('smelt')).toBe('weapon')
    expect(workshopGroupOf('nope')).toBe(DEFAULT_WORKSHOP_GROUP)
  })

  it('colors workshop progress by group, not sidebar chrome', () => {
    expect(WORKSHOP_GROUP_PROGRESS.potion.from).toBe('#6a8f72')
    expect(WORKSHOP_GROUP_PROGRESS.food.from).toBe('#b07a52')
    expect(WORKSHOP_GROUP_PROGRESS.weapon.from).toBe('#8a6a4e')
    expect(WORKSHOP_GROUP_PROGRESS.weapon.from).not.toBe(WORKSHOP_GROUP_PROGRESS.potion.from)
    expect(workshopGroupProgressStyle('potion')).toEqual({
      '--workshop-progress-from': '#6a8f72',
      '--workshop-progress-to': '#8fb89a',
    })
    expect(stationProgressStyle('herbalism')).toEqual(workshopGroupProgressStyle('potion'))
    expect(stationProgressStyle('cooking')).toEqual(workshopGroupProgressStyle('food'))
    expect(stationProgressStyle('forging')).toEqual(workshopGroupProgressStyle('weapon'))
  })

  it('resolves unknown and legacy line ids', () => {
    expect(isWorkshopTabId('mining')).toBe(true)
    expect(isWorkshopTabId('woodcutting')).toBe(false)
    expect(isWorkshopTabId('fishing')).toBe(false)
    expect(isWorkshopTabId('smelt')).toBe(false)
    expect(workshopTabOf('nope')).toBe('herbalism')
    expect(workshopTabOf('smelt')).toBe('mining')
    expect(workshopTabOf('hunt')).toBe('hunting')
    expect(workshopTabOf('brew')).toBe('herbalism')
    expect(workshopTabOf('fish')).toBe('hunting')
    expect(workshopTabOf('fishing')).toBe('hunting')
    expect(workshopTabOf('alchemy')).toBe('alchemy')
  })

  it('persists the active station and migrates the old line key', () => {
    const store = memory()
    expect(loadWorkshopTab(store)).toBe('herbalism')
    expect(saveWorkshopTab('cooking', store)).toBe('cooking')
    expect(store.getItem(WORKSHOP_TAB_KEY)).toBe('cooking')
    expect(loadWorkshopTab(store)).toBe('cooking')
    expect(saveWorkshopTab('bad', store)).toBe('herbalism')
    expect(loadWorkshopTab(store)).toBe('herbalism')

    const legacy = memory()
    legacy.setItem(LEGACY_WORKSHOP_LINE_KEY, 'brew')
    expect(loadWorkshopTab(legacy)).toBe('herbalism')
    expect(legacy.getItem(WORKSHOP_TAB_KEY)).toBe('herbalism')
    expect(legacy.getItem(LEGACY_WORKSHOP_LINE_KEY)).toBeNull()
  })
})
