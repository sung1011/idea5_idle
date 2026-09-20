import { afterEach, describe, expect, it } from 'vitest'
import { assignWorker } from './assign'
import { bankQty } from './bank'
import { createSave } from './createSave'
import { collectHints } from './query'
import { recruitWorker } from './recruit'
import { setRollOverride } from './rng'
import {
  categoryPickOptions,
  grantStationXp,
  hydrateStationState,
  hydrateStations,
  selectStationCategory,
} from './stationProgress'
import { STATION_DEF, xpToNextLevel, xpToReachLevel } from './tables'
import { ticks } from './tick'
import { selectForgeOutput } from './tools'
import type { Save } from './types'

function roster(n: number): Save {
  const save = createSave()
  save.gold = 15 * n
  for (let i = 0; i < n; i++) {
    expect(recruitWorker(save).ok).toBe(true)
  }
  return save
}

function unlockTo(save: Save, stationId: 'mining' | 'forging' | 'hunting', level: number) {
  const station = save.stations[stationId]
  while (station.stationLevel < level) {
    grantStationXp(save, stationId, xpToNextLevel(station.stationLevel))
  }
}

afterEach(() => {
  setRollOverride(null)
})

describe('station XP curve', () => {
  it('uses early XP steps then the scaled curve; 50 XP to reach Lv5', () => {
    expect(xpToNextLevel(1)).toBe(5)
    expect(xpToNextLevel(2)).toBe(10)
    expect(xpToNextLevel(3)).toBe(15)
    expect(xpToNextLevel(4)).toBe(20)
    expect(xpToNextLevel(5)).toBe(77)
    expect(xpToReachLevel(5)).toBe(50)
    expect(STATION_DEF.mining.categories.map((c) => c.xpPerCycle)).toEqual([1, 2, 3])
    expect(STATION_DEF.forging.categories.map((c) => c.xpPerCycle)).toEqual([1])
    expect(STATION_DEF.cooking.categories.map((c) => c.xpPerCycle)).toEqual([1, 1, 2])
    expect(STATION_DEF.hunting.categories.map((c) => c.xpPerCycle)).toEqual([1, 2, 3])
    expect(STATION_DEF.herbalism.categories[0].xpPerCycle).toBe(1)
    expect(STATION_DEF.alchemy.categories[0].xpPerCycle).toBe(1)
  })
})

describe('station XP / level', () => {
  it('gives XP on a finished cycle and levels when XP is full', () => {
    const save = roster(1)
    assignWorker(save, save.workers[0].id, 'mining')
    const next = ticks(save, 20)
    expect(next.stations.mining.completed).toBe(1)
    expect(next.stations.mining.stationXp).toBe(1)
    expect(next.stations.mining.stationLevel).toBe(1)

    grantStationXp(next, 'mining', xpToNextLevel(1) - next.stations.mining.stationXp)
    expect(next.stations.mining.stationLevel).toBe(2)
    expect(next.stations.mining.stationXp).toBe(0)
    expect(next.stations.mining.progressNotice).toContain('升到 Lv2')
    expect(collectHints(next).some((h) => h.kind === 'progress' && h.text.includes('采矿'))).toBe(true)
  })

  it('reaches Lv5 after 50 copper-cycle XP', () => {
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

describe('categoryPickOptions', () => {
  it('lists unlocked plus only the next locked category', () => {
    const save = createSave()
    const lv1 = categoryPickOptions(save, 'mining')
    expect(lv1.map((c) => c.id)).toEqual(['copper', 'iron'])
    expect(lv1.find((c) => c.id === 'copper')?.unlocked).toBe(true)
    expect(lv1.find((c) => c.id === 'iron')?.unlocked).toBe(false)
    expect(lv1.some((c) => c.id === 'mithril')).toBe(false)

    unlockTo(save, 'mining', 5)
    const lv5 = categoryPickOptions(save, 'mining')
    expect(lv5.map((c) => c.id)).toEqual(['copper', 'iron', 'mithril'])
    expect(lv5.filter((c) => c.unlocked).map((c) => c.id)).toEqual(['copper', 'iron'])
    expect(lv5.find((c) => c.id === 'mithril')?.unlocked).toBe(false)

    unlockTo(save, 'mining', 10)
    const lv10 = categoryPickOptions(save, 'mining')
    expect(lv10.map((c) => c.id)).toEqual(['copper', 'iron', 'mithril'])
    expect(lv10.every((c) => c.unlocked)).toBe(true)
  })

  it('hides the picker list for single-category stations', () => {
    const save = createSave()
    expect(categoryPickOptions(save, 'herbalism')).toEqual([
      { id: 'default', label: '草', unlocked: true, unlockLevel: 1 },
    ])
  })

  it('lists cooking recipes: roast unlocked at start, stew locked until Lv5', () => {
    const save = createSave()
    const lv1 = categoryPickOptions(save, 'cooking')
    expect(lv1.map((c) => c.label)).toEqual(['烤鱼', '烤肉', '香料炖'])
    expect(lv1.filter((c) => c.unlocked).map((c) => c.id)).toEqual(['copper', 'iron'])
    expect(lv1.find((c) => c.id === 'mithril')?.unlocked).toBe(false)

    const station = save.stations.cooking
    while (station.stationLevel < 5) {
      grantStationXp(save, 'cooking', xpToNextLevel(station.stationLevel))
    }
    expect(categoryPickOptions(save, 'cooking').every((c) => c.unlocked)).toBe(true)
  })

  it('lists hunting prey like mining categories', () => {
    const save = createSave()
    expect(categoryPickOptions(save, 'hunting').map((c) => c.label)).toEqual(['野猪', '狼'])
    unlockTo(save, 'hunting', 5)
    expect(categoryPickOptions(save, 'hunting').filter((c) => c.unlocked).map((c) => c.id)).toEqual([
      'copper',
      'iron',
    ])
  })
})

describe('stack current category', () => {
  it('two miners on iron without conflict tech produce like one miner', () => {
    const one = roster(1)
    unlockTo(one, 'mining', 5)
    expect(selectStationCategory(one, 'mining', 'iron').ok).toBe(true)
    assignWorker(one, one.workers[0].id, 'mining')

    const two = roster(2)
    unlockTo(two, 'mining', 5)
    expect(selectStationCategory(two, 'mining', 'iron').ok).toBe(true)
    for (const w of two.workers) assignWorker(two, w.id, 'mining')

    const a = ticks(one, 24)
    const b = ticks(two, 24)
    expect(bankQty(a, 'ironOre')).toBe(1)
    expect(bankQty(a, 'ore')).toBe(0)
    expect(bankQty(b, 'ironOre')).toBe(1)
    expect(b.stations.mining.completed).toBe(1)
  })
})

describe('forging matching ore', () => {
  it('mid-tier exclusive tool consumes ironOre and deposits that tool', () => {
    setRollOverride(() => 0.99)
    const save = roster(1)
    save.stations.forging.stationLevel = 6
    expect(selectForgeOutput(save, 'miningTool06').ok).toBe(true)
    save.bank.ironOre = 1
    save.bank.wood = 1
    save.bank.ore = 2
    assignWorker(save, save.workers[0].id, 'forging')
    const next = ticks(save, 36)
    expect(bankQty(next, 'ironOre')).toBe(0)
    expect(bankQty(next, 'wood')).toBe(1)
    expect(bankQty(next, 'ore')).toBe(2)
    expect(bankQty(next, 'miningTool06')).toBe(1)
    expect(bankQty(next, 'ironTool')).toBe(0)
    expect(bankQty(next, 'weapon')).toBe(0)
    expect(next.stations.forging.completed).toBe(1)
  })

  it('idles when a mid-tier tool is selected but only copper ore is in the bank', () => {
    const save = roster(1)
    save.stations.forging.stationLevel = 6
    expect(selectForgeOutput(save, 'miningTool06').ok).toBe(true)
    save.bank.ore = 4
    assignWorker(save, save.workers[0].id, 'forging')
    const next = ticks(save, 36)
    expect(bankQty(next, 'miningTool06')).toBe(0)
    expect(bankQty(next, 'ironTool')).toBe(0)
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
    expect(station.miningNode?.nodeHpMax).toBe(20)
    expect(station.miningNode?.recoverAt).toBeNull()
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
