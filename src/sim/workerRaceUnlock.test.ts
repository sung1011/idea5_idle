import { afterEach, describe, expect, it } from 'vitest'
import { createSave } from './createSave'
import { fuseWorkers } from './fuse'
import { hydrateLoadedSave } from '../ui/saveGame'
import { mainlineStepOf } from './mainlineQuest'
import { recruitWorker, spawnWorker, spawnWorkerWith } from './recruit'
import { setRollOverride } from './rng'
import { keepStationsOpen } from './stationUnlock'
import { WORKER_RACE_IDS, type QualityTier, type Save, type WorkerRaceId } from './types'
import { STARTER_WORKER_RACES, unlockedWorkerRacePool } from './workerRace'
import {
  GOLD_RACE_UNLOCK_ORDER,
  RACE_FUSE_UNLOCK_RULES,
  applyFuseRaceUnlocks,
  hydrateWorkerRaceUnlocks,
  raceCodexEntries,
  raceUnlockHint,
} from './workerRaceUnlock'

function withoutUnlockFields(save: Save): Record<string, unknown> {
  const raw = JSON.parse(JSON.stringify(save)) as Record<string, unknown>
  delete raw.unlockedWorkerRaces
  delete raw.goldRaceUnlockStep
  return raw
}

function recruitRaces(save: Save, n: number): WorkerRaceId[] {
  const start = save.workers.length
  for (let i = 0; i < n; i++) {
    save.diamonds += 20
    expect(recruitWorker(save).ok).toBe(true)
  }
  return save.workers.slice(start).map((worker) => worker.race as WorkerRaceId)
}

function fusePair(save: Save, tier: QualityTier) {
  save.guideQuestStep = mainlineStepOf('fuse')
  const a = spawnWorkerWith(save, tier, 'laborer')
  const b = spawnWorkerWith(save, tier, 'laborer')
  return fuseWorkers(save, a.id, b.id)
}

describe('worker race unlock', () => {
  it('starts with orc, troll and tauren unlocked, and keeps locked races out of recruit', () => {
    const save = keepStationsOpen(createSave())
    expect(save.unlockedWorkerRaces).toEqual([...STARTER_WORKER_RACES])
    expect(save.goldRaceUnlockStep).toBe(0)
    expect(unlockedWorkerRacePool(save)).toEqual([...STARTER_WORKER_RACES])

    setRollOverride(() => 0.99)
    const races = recruitRaces(save, 12)
    expect(races.every((race) => (STARTER_WORKER_RACES as readonly string[]).includes(race))).toBe(true)
    expect(races.every((race) => race === 'tauren')).toBe(true)
    expect(races).not.toContain('kobold')
    expect(races).not.toContain('bloodElf')

    setRollOverride(() => 0)
    expect(recruitRaces(save, 1)[0]).toBe('orc')
  })

  it('unlocks the next race when a fuse result reaches that quality and race', () => {
    const save = createSave()
    expect(applyFuseRaceUnlocks(save, 'orc', 5)).toEqual([])
    expect(save.unlockedWorkerRaces).toEqual([...STARTER_WORKER_RACES])

    expect(applyFuseRaceUnlocks(save, 'orc', 6)).toEqual(['bloodElf'])
    expect(save.unlockedWorkerRaces).toContain('bloodElf')
    expect(save.unlockedWorkerRaces).not.toContain('magharOrc')
    expect(applyFuseRaceUnlocks(save, 'orc', 6)).toEqual([])

    expect(applyFuseRaceUnlocks(save, 'troll', 6)).toEqual(['goblin'])
    expect(applyFuseRaceUnlocks(save, 'tauren', 6)).toEqual(['forsaken'])
    expect(applyFuseRaceUnlocks(save, 'bloodElf', 6)).toEqual(['pandaren'])
    expect(applyFuseRaceUnlocks(save, 'goblin', 6)).toEqual(['nightborne'])
    expect(applyFuseRaceUnlocks(save, 'forsaken', 6)).toEqual(['vulpera'])

    expect(applyFuseRaceUnlocks(save, 'orc', 7)).toEqual(['magharOrc'])
    expect(applyFuseRaceUnlocks(save, 'troll', 7)).toEqual(['zandalariTroll'])
    expect(applyFuseRaceUnlocks(save, 'tauren', 7)).toEqual(['highmountainTauren'])
    expect(applyFuseRaceUnlocks(save, 'bloodElf', 8)).toEqual(['voidElf'])
    expect(applyFuseRaceUnlocks(save, 'pandaren', 8)).toEqual(['earthen'])
    expect(applyFuseRaceUnlocks(save, 'nightborne', 8)).toEqual(['dracthyr'])

    expect(unlockedWorkerRacePool(save)).toEqual(
      WORKER_RACE_IDS.filter((id) => !(GOLD_RACE_UNLOCK_ORDER as readonly string[]).includes(id)),
    )
  })

  it('unlocks gold-chain races in order and stores the step', () => {
    const save = createSave()
    expect(GOLD_RACE_UNLOCK_ORDER).toEqual(['ogre', 'centaur', 'naga', 'murloc', 'kobold'])
    for (const rule of RACE_FUSE_UNLOCK_RULES) {
      applyFuseRaceUnlocks(save, rule.race, rule.minQuality)
    }
    for (let i = 0; i < GOLD_RACE_UNLOCK_ORDER.length; i++) {
      expect(applyFuseRaceUnlocks(save, 'orc', 9)).toEqual([GOLD_RACE_UNLOCK_ORDER[i]])
      expect(save.goldRaceUnlockStep).toBe(i + 1)
      expect(save.unlockedWorkerRaces).toContain(GOLD_RACE_UNLOCK_ORDER[i])
    }
    expect(applyFuseRaceUnlocks(save, 'troll', 10)).toEqual([])
    expect(save.goldRaceUnlockStep).toBe(5)
    expect(unlockedWorkerRacePool(save)).toEqual(expect.arrayContaining([...GOLD_RACE_UNLOCK_ORDER]))
  })

  it('does not let fuse roll a locked race even when rng would have picked one', () => {
    const save = keepStationsOpen(createSave())
    setRollOverride(() => 0.99)
    expect(fusePair(save, 1).ok).toBe(true)
    expect(save.workers[0].race).toBe('tauren')
    expect(save.unlockedWorkerRaces).toEqual([...STARTER_WORKER_RACES])
  })

  it('unlocks from a real fuse result of orange orc', () => {
    const save = keepStationsOpen(createSave())
    setRollOverride(() => 0)
    expect(fusePair(save, 5).ok).toBe(true)
    expect(save.workers[0].qualityTier).toBe(7)
    expect(save.workers[0].race).toBe('orc')
    expect(save.unlockedWorkerRaces).toContain('bloodElf')
    expect(save.unlockedWorkerRaces).toContain('magharOrc')
  })

  it('writes codex hints in player language', () => {
    const save = createSave()
    const rows = raceCodexEntries(save)
    expect(rows).toHaveLength(WORKER_RACE_IDS.length)
    expect(rows.filter((row) => row.unlocked).map((row) => row.id)).toEqual([...STARTER_WORKER_RACES])
    expect(raceUnlockHint('bloodElf')).toBe('合出橙色兽人解锁')
    expect(raceUnlockHint('goblin')).toBe('合出橙色巨魔解锁')
    expect(raceUnlockHint('forsaken')).toBe('合出橙色牛头人解锁')
    expect(raceUnlockHint('pandaren')).toBe('合出橙色血精灵解锁')
    expect(raceUnlockHint('nightborne')).toBe('合出橙色地精解锁')
    expect(raceUnlockHint('vulpera')).toBe('合出橙色被遗忘者解锁')
    expect(raceUnlockHint('magharOrc')).toBe('合出粉色兽人解锁')
    expect(raceUnlockHint('zandalariTroll')).toBe('合出粉色巨魔解锁')
    expect(raceUnlockHint('highmountainTauren')).toBe('合出粉色牛头人解锁')
    expect(raceUnlockHint('voidElf')).toBe('合出红色血精灵解锁')
    expect(raceUnlockHint('earthen')).toBe('合出红色熊猫人解锁')
    expect(raceUnlockHint('dracthyr')).toBe('合出红色夜之子解锁')
    expect(raceUnlockHint('ogre')).toBe('合出金色苦工解锁')
    expect(raceUnlockHint('centaur')).toBe('再合出金色苦工解锁')
    expect(raceUnlockHint('naga')).toBe('第3次合出金色苦工解锁')
    expect(raceUnlockHint('murloc')).toBe('第4次合出金色苦工解锁')
    expect(raceUnlockHint('kobold')).toBe('第5次合出金色苦工解锁')
    const locked = rows.find((row) => row.id === 'bloodElf')
    expect(locked?.unlocked).toBe(false)
    expect(locked?.hint).toBe('合出橙色兽人解锁')
    expect(locked?.hint).not.toContain('fuse')
    expect(locked?.hint).not.toContain('quality')
    expect(RACE_FUSE_UNLOCK_RULES).toHaveLength(12)
  })

  it('treats owned rare races on an old save as unlocked', () => {
    const raw = keepStationsOpen(createSave())
    const owned = spawnWorker(raw)
    owned.race = 'bloodElf'
    const extra = spawnWorker(raw)
    extra.race = 'naga'
    const loaded = hydrateLoadedSave(withoutUnlockFields(raw))
    expect(loaded).not.toBeNull()
    if (!loaded) return
    expect(loaded.unlockedWorkerRaces).toEqual(expect.arrayContaining(['orc', 'troll', 'tauren', 'bloodElf', 'naga']))
    expect(loaded.unlockedWorkerRaces).not.toContain('goblin')
    expect(loaded.unlockedWorkerRaces).not.toContain('ogre')
    expect(loaded.goldRaceUnlockStep).toBe(0)
    expect(raceCodexEntries(loaded).find((row) => row.id === 'bloodElf')?.unlocked).toBe(true)
  })

  it('raises gold-chain progress when an old save already owns the prefix races', () => {
    const raw = keepStationsOpen(createSave())
    const ogre = spawnWorker(raw)
    ogre.race = 'ogre'
    const centaur = spawnWorker(raw)
    centaur.race = 'centaur'
    const loaded = hydrateLoadedSave(withoutUnlockFields(raw))
    expect(loaded).not.toBeNull()
    if (!loaded) return
    expect(loaded.unlockedWorkerRaces).toEqual(expect.arrayContaining(['ogre', 'centaur']))
    expect(loaded.goldRaceUnlockStep).toBe(2)
    const newly = applyFuseRaceUnlocks(loaded, 'orc', 9)
    expect(newly).toContain('naga')
    expect(loaded.goldRaceUnlockStep).toBe(3)
  })

  it('fills gold-chain progress from consecutive owned races on an old save', () => {
    const save = createSave()
    const ogre = spawnWorker(save)
    ogre.race = 'ogre'
    const centaur = spawnWorker(save)
    centaur.race = 'centaur'
    save.goldRaceUnlockStep = undefined as unknown as number
    save.unlockedWorkerRaces = [...STARTER_WORKER_RACES]
    hydrateWorkerRaceUnlocks(save)
    expect(save.unlockedWorkerRaces).toEqual(expect.arrayContaining(['ogre', 'centaur']))
    expect(save.goldRaceUnlockStep).toBe(2)
    const newly = applyFuseRaceUnlocks(save, 'orc', 9)
    expect(newly).toContain('naga')
    expect(save.goldRaceUnlockStep).toBe(3)
  })
})
