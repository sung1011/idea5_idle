import { describe, expect, it } from 'vitest'
import { assignWorker } from './assign'
import { bankQty } from './bank'
import { createSave } from './createSave'
import { collectHints } from './query'
import { recruitWorker } from './recruit'
import {
  grantStationXp,
  hydrateStationState,
  hydrateStations,
  selectStationCategory,
} from './stationProgress'
import { STATION_DEF, xpToNextLevel, xpToReachLevel } from './tables'
import { ticks } from './tick'
import type { Save } from './types'

function roster(n: number): Save {
  const save = createSave()
  save.gold = 15 * n
  for (let i = 0; i < n; i++) {
    expect(recruitWorker(save).ok).toBe(true)
  }
  return save
}

function unlockTo(save: Save, stationId: 'mining' | 'forging', level: number) {
  const station = save.stations[stationId]
  while (station.stationLevel < level) {
    grantStationXp(save, stationId, xpToNextLevel(station.stationLevel))
  }
}

describe('station XP curve', () => {
  it('uses round(100 * 1.45^(L-1)) and 760 XP to reach Lv5', () => {
    expect(xpToNextLevel(1)).toBe(100)
    expect(xpToNextLevel(2)).toBe(145)
    expect(xpToNextLevel(3)).toBe(210)
    expect(xpToNextLevel(4)).toBe(305)
    expect(xpToReachLevel(5)).toBe(760)
    expect(STATION_DEF.mining.categories.map((c) => c.xpPerCycle)).toEqual([1, 2, 3])
    expect(STATION_DEF.forging.categories.map((c) => c.xpPerCycle)).toEqual([1, 2, 3])
    expect(STATION_DEF.fishing.categories[0].xpPerCycle).toBe(1)
    expect(STATION_DEF.cooking.categories[0].xpPerCycle).toBe(1)
    expect(STATION_DEF.woodcutting.categories[0].xpPerCycle).toBe(1)
    expect(STATION_DEF.alchemy.categories[0].xpPerCycle).toBe(1)
  })
})

describe('station XP / level', () => {
  it('gives XP on a finished cycle and levels when XP is full', () => {
    const save = roster(1)
    assignWorker(save, save.workers[0].id, 'mining')
    const next = ticks(save, 5)
    expect(next.stations.mining.completed).toBe(1)
    expect(next.stations.mining.stationXp).toBe(1)
    expect(next.stations.mining.stationLevel).toBe(1)

    grantStationXp(next, 'mining', xpToNextLevel(1) - next.stations.mining.stationXp)
    expect(next.stations.mining.stationLevel).toBe(2)
    expect(next.stations.mining.stationXp).toBe(0)
    expect(next.stations.mining.progressNotice).toContain('升到 Lv2')
    expect(collectHints(next).some((h) => h.kind === 'progress' && h.text.includes('采矿'))).toBe(true)
  })

  it('reaches Lv5 after 760 copper-cycle XP', () => {
    const save = createSave()
    grantStationXp(save, 'mining', xpToReachLevel(5))
    expect(save.stations.mining.stationLevel).toBe(5)
    expect(save.stations.mining.stationXp).toBe(0)
    expect(save.stations.mining.unlockedCategories).toEqual(['copper', 'iron'])
  })

  it('unlocks the second mining category at Lv5', () => {
    const save = createSave()
    expect(save.stations.mining.unlockedCategories).toEqual(['copper'])
    unlockTo(save, 'mining', 5)
    expect(save.stations.mining.stationLevel).toBe(5)
    expect(save.stations.mining.unlockedCategories).toEqual(['copper', 'iron'])
    expect(save.stations.mining.progressNotice).toContain('解锁铁矿')
  })

  it('unlocks the third mining category at Lv10', () => {
    const save = createSave()
    unlockTo(save, 'mining', 10)
    expect(save.stations.mining.unlockedCategories).toEqual(['copper', 'iron', 'mithril'])
    expect(save.stations.mining.progressNotice).toContain('秘银矿')
  })
})

describe('selectStationCategory', () => {
  it('rejects a locked category and keeps the current one', () => {
    const save = createSave()
    const result = selectStationCategory(save, 'mining', 'iron')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('Lv5')
    expect(save.stations.mining.selectedCategory).toBe('copper')
  })

  it('selects an unlocked category', () => {
    const save = createSave()
    unlockTo(save, 'mining', 5)
    const result = selectStationCategory(save, 'mining', 'iron')
    expect(result.ok).toBe(true)
    expect(save.stations.mining.selectedCategory).toBe('iron')
  })
})

describe('stack current category', () => {
  it('three miners on iron produce 3x ironOre in the same time', () => {
    const one = roster(1)
    unlockTo(one, 'mining', 5)
    expect(selectStationCategory(one, 'mining', 'iron').ok).toBe(true)
    assignWorker(one, one.workers[0].id, 'mining')

    const three = roster(3)
    unlockTo(three, 'mining', 5)
    expect(selectStationCategory(three, 'mining', 'iron').ok).toBe(true)
    for (const w of three.workers) assignWorker(three, w.id, 'mining')

    const a = ticks(one, 6)
    const b = ticks(three, 6)
    expect(bankQty(a, 'ironOre')).toBe(1)
    expect(bankQty(a, 'ore')).toBe(0)
    expect(bankQty(b, 'ironOre')).toBe(3)
    expect(b.stations.mining.completed).toBe(3)
  })
})

describe('forging matching ore', () => {
  it('iron forging consumes ironOre and deposits ironWeapon', () => {
    const save = roster(1)
    unlockTo(save, 'forging', 5)
    expect(selectStationCategory(save, 'forging', 'iron').ok).toBe(true)
    save.bank.ironOre = 1
    save.bank.wood = 1
    save.bank.ore = 2
    assignWorker(save, save.workers[0].id, 'forging')
    const next = ticks(save, 9)
    expect(bankQty(next, 'ironOre')).toBe(0)
    expect(bankQty(next, 'ore')).toBe(2)
    expect(bankQty(next, 'ironWeapon')).toBe(1)
    expect(bankQty(next, 'weapon')).toBe(0)
    expect(next.stations.forging.completed).toBe(1)
  })

  it('idles when iron is selected but only copper ore is in the bank', () => {
    const save = roster(1)
    unlockTo(save, 'forging', 5)
    expect(selectStationCategory(save, 'forging', 'iron').ok).toBe(true)
    save.bank.ore = 4
    assignWorker(save, save.workers[0].id, 'forging')
    const next = ticks(save, 9)
    expect(bankQty(next, 'ironWeapon')).toBe(0)
    expect(bankQty(next, 'weapon')).toBe(0)
    expect(next.stations.forging.completed).toBe(0)
    expect(next.stations.forging.stallReason).toBe('emptyInput')
    expect(collectHints(next).some((h) => h.text.includes('铁矿') && h.text.includes('见底'))).toBe(true)
  })
})

describe('hydrate old station save', () => {
  it('fills XP, level and the default category', () => {
    const station = hydrateStationState('mining', {
      progress: 0.4,
      stallReason: null,
      completed: 3,
      resonanceStreak: 1,
    })
    expect(station.stationXp).toBe(0)
    expect(station.stationLevel).toBe(1)
    expect(station.selectedCategory).toBe('copper')
    expect(station.unlockedCategories).toEqual(['copper'])
    expect(station.completed).toBe(3)
    expect(station.progress).toBeCloseTo(0.4)
  })

  it('repairs a selected category that is no longer unlocked', () => {
    const stations = hydrateStations({
      mining: {
        progress: 0,
        stallReason: null,
        completed: 0,
        resonanceStreak: 0,
        stationLevel: 1,
        stationXp: 0,
        selectedCategory: 'iron',
        unlockedCategories: ['iron'],
        progressNotice: null,
      },
    })
    expect(stations.mining.selectedCategory).toBe('copper')
    expect(stations.mining.unlockedCategories).toEqual(['copper'])
  })
})
