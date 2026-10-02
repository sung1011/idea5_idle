import { describe, expect, it } from 'vitest'
import { createSave } from './createSave'
import {
  RACE_PROGRESS,
  RACE_TITLE_CHIEF,
  RACE_TITLE_KIN,
  claimRaceProgress,
  equippedRaceTitle,
  hydrateRaceCodex,
  raceProgressView,
  unlockedRaceCount,
} from './raceCodex'
import { hydrateLoadedSave } from '../ui/saveGame'
import { WORKER_RACE_IDS, type Save, type WorkerRaceId } from './types'
import { STARTER_WORKER_RACES } from './workerRace'
import { hydrateWorkerRaceUnlocks } from './workerRaceUnlock'

function unlockRaces(save: Save, n: number): void {
  save.unlockedWorkerRaces = WORKER_RACE_IDS.slice(0, n)
  hydrateWorkerRaceUnlocks(save)
}

describe('race progress rewards', () => {
  it('does not let a new save claim the first tier with only starter races', () => {
    const save = createSave()
    expect(save.unlockedWorkerRaces).toEqual([...STARTER_WORKER_RACES])
    expect(unlockedRaceCount(save)).toBe(3)
    expect(WORKER_RACE_IDS).toHaveLength(20)
    expect(RACE_PROGRESS.map((row) => row.id)).toEqual(['t6', 't12', 'all'])
    expect(RACE_PROGRESS[2]?.need).toBe(WORKER_RACE_IDS.length)
    const view = raceProgressView(save)
    expect(view.every((row) => !row.ready && !row.claimed)).toBe(true)
    const blocked = claimRaceProgress(save, 't6')
    expect(blocked.ok).toBe(false)
    expect(blocked.ok === false && blocked.reason).toContain('还差')
    expect(save.diamonds).toBe(0)
    expect(save.raceCodex.claimedProgress).toEqual([])
    expect(save.raceCodex.titles).toEqual([])
  })

  it('lets the player claim each tier once after unlocking enough races', () => {
    const save = createSave()
    unlockRaces(save, 6)
    expect(unlockedRaceCount(save)).toBe(6)
    expect(raceProgressView(save).find((row) => row.id === 't6')?.ready).toBe(true)
    expect(claimRaceProgress(save, 't12').ok).toBe(false)
    const first = claimRaceProgress(save, 't6')
    expect(first.ok).toBe(true)
    expect(save.diamonds).toBe(5)
    expect(save.raceCodex.titles).toContain(RACE_TITLE_KIN)
    expect(equippedRaceTitle(save)).toBe(RACE_TITLE_KIN)
    expect(claimRaceProgress(save, 't6').ok).toBe(false)
    expect(save.diamonds).toBe(5)
    unlockRaces(save, 12)
    expect(claimRaceProgress(save, 't12').ok).toBe(true)
    expect(save.diamonds).toBe(17)
    unlockRaces(save, WORKER_RACE_IDS.length)
    expect(claimRaceProgress(save, 'all').ok).toBe(true)
    expect(save.diamonds).toBe(42)
    expect(save.raceCodex.titles).toContain(RACE_TITLE_CHIEF)
    expect(equippedRaceTitle(save)).toBe(RACE_TITLE_CHIEF)
    expect(claimRaceProgress(save, 'all').ok).toBe(false)
    expect(save.raceCodex.claimedProgress).toEqual(['t6', 't12', 'all'])
  })
})

describe('race old save hydrate', () => {
  it('fills missing raceCodex and lets an old save claim reached tiers', () => {
    const raw = createSave()
    raw.diamonds = 11
    raw.unlockedWorkerRaces = WORKER_RACE_IDS.slice(0, 6) as WorkerRaceId[]
    delete (raw as { raceCodex?: unknown }).raceCodex
    const loaded = hydrateLoadedSave(JSON.parse(JSON.stringify(raw)) as Save)
    expect(loaded).toBeTruthy()
    expect(loaded?.diamonds).toBe(11)
    expect(loaded?.raceCodex.claimedProgress).toEqual([])
    expect(loaded?.raceCodex.titles).toEqual([])
    expect(unlockedRaceCount(loaded!)).toBe(6)
    const before = loaded!.diamonds
    expect(claimRaceProgress(loaded!, 't6').ok).toBe(true)
    expect(loaded!.diamonds).toBe(before + 5)
    expect(loaded!.raceCodex.titles).toContain(RACE_TITLE_KIN)
    expect(claimRaceProgress(loaded!, 't6').ok).toBe(false)
    hydrateRaceCodex(loaded!)
    expect(loaded!.raceCodex.claimedProgress).toEqual(['t6'])
  })
})
