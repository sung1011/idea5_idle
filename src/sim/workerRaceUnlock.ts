import { workerQualityDef } from './tables'
import { WORKER_RACE_IDS, type QualityTier, type Save, type WorkerRaceId } from './types'
import {
  STARTER_WORKER_RACES,
  WORKER_RACE_LABEL,
  isWorkerRaceId,
  isWorkerRaceUnlocked,
} from './workerRace'

/** 合出金色苦工后按这次序解锁。 */
export const GOLD_RACE_UNLOCK_ORDER = ['ogre', 'centaur', 'naga', 'murloc', 'kobold'] as const satisfies readonly WorkerRaceId[]

export type RaceFuseUnlockRule = {
  minQuality: QualityTier
  race: WorkerRaceId
  unlocks: WorkerRaceId
}

/** 合出达到该品质且该种族时解锁下一族。 */
export const RACE_FUSE_UNLOCK_RULES: readonly RaceFuseUnlockRule[] = [
  { minQuality: 6, race: 'orc', unlocks: 'bloodElf' },
  { minQuality: 6, race: 'troll', unlocks: 'goblin' },
  { minQuality: 6, race: 'tauren', unlocks: 'forsaken' },
  { minQuality: 6, race: 'bloodElf', unlocks: 'pandaren' },
  { minQuality: 6, race: 'goblin', unlocks: 'nightborne' },
  { minQuality: 6, race: 'forsaken', unlocks: 'vulpera' },
  { minQuality: 7, race: 'orc', unlocks: 'magharOrc' },
  { minQuality: 7, race: 'troll', unlocks: 'zandalariTroll' },
  { minQuality: 7, race: 'tauren', unlocks: 'highmountainTauren' },
  { minQuality: 8, race: 'bloodElf', unlocks: 'voidElf' },
  { minQuality: 8, race: 'pandaren', unlocks: 'earthen' },
  { minQuality: 8, race: 'nightborne', unlocks: 'dracthyr' },
]

const GOLD_RACE_UNLOCK_HINTS = [
  '合出金色苦工解锁',
  '再合出金色苦工解锁',
  '第3次合出金色苦工解锁',
  '第4次合出金色苦工解锁',
  '第5次合出金色苦工解锁',
] as const

export type RaceCodexEntry = {
  id: WorkerRaceId
  label: string
  unlocked: boolean
  hint: string
}

export function starterUnlockedRaces(): WorkerRaceId[] {
  return [...STARTER_WORKER_RACES]
}

function grantRace(save: Save, race: WorkerRaceId): boolean {
  if (save.unlockedWorkerRaces.includes(race)) return false
  save.unlockedWorkerRaces = WORKER_RACE_IDS.filter((id) => id === race || save.unlockedWorkerRaces.includes(id))
  return true
}

function clampGoldStep(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return -1
  return Math.max(0, Math.min(GOLD_RACE_UNLOCK_ORDER.length, Math.floor(value)))
}

function consecutiveGoldStep(unlocked: ReadonlySet<WorkerRaceId>): number {
  let step = 0
  for (const id of GOLD_RACE_UNLOCK_ORDER) {
    if (!unlocked.has(id)) break
    step += 1
  }
  return step
}

function collectOwnedRaces(save: Save): Set<WorkerRaceId> {
  const owned = new Set<WorkerRaceId>()
  for (const id of STARTER_WORKER_RACES) owned.add(id)
  if (Array.isArray(save.unlockedWorkerRaces)) {
    for (const id of save.unlockedWorkerRaces) {
      if (isWorkerRaceId(id)) owned.add(id)
    }
  }
  for (const worker of save.workers) {
    if (isWorkerRaceId(worker.race)) owned.add(worker.race)
  }
  return owned
}

/** 开局三族始终解锁；名册已有的族视为已解锁；金链进度与已点亮前缀取较大值。 */
export function hydrateWorkerRaceUnlocks(save: Save): void {
  const owned = collectOwnedRaces(save)
  const stored = clampGoldStep(save.goldRaceUnlockStep)
  const derived = consecutiveGoldStep(owned)
  const step = Math.max(stored < 0 ? 0 : stored, derived)
  for (let i = 0; i < step; i++) {
    const id = GOLD_RACE_UNLOCK_ORDER[i]
    if (id) owned.add(id)
  }
  save.unlockedWorkerRaces = WORKER_RACE_IDS.filter((id) => owned.has(id))
  save.goldRaceUnlockStep = step
}

/**
 * 合出结果达到指定品质且该种族时解锁下一族。
 * 金色（含彩）且产物已解锁时，按存档进度解锁金链下一个。
 */
export function applyFuseRaceUnlocks(save: Save, race: WorkerRaceId, quality: QualityTier): WorkerRaceId[] {
  hydrateWorkerRaceUnlocks(save)
  const newly: WorkerRaceId[] = []
  if (grantRace(save, race)) newly.push(race)
  for (const rule of RACE_FUSE_UNLOCK_RULES) {
    if (quality >= rule.minQuality && race === rule.race && grantRace(save, rule.unlocks)) {
      newly.push(rule.unlocks)
    }
  }
  if (quality >= 9 && isWorkerRaceUnlocked(save, race) && save.goldRaceUnlockStep < GOLD_RACE_UNLOCK_ORDER.length) {
    const next = GOLD_RACE_UNLOCK_ORDER[save.goldRaceUnlockStep]
    save.goldRaceUnlockStep += 1
    if (next && grantRace(save, next)) newly.push(next)
  }
  return newly
}

export function raceUnlockHint(id: WorkerRaceId): string {
  if ((STARTER_WORKER_RACES as readonly WorkerRaceId[]).includes(id)) return '开局可招募'
  const fuse = RACE_FUSE_UNLOCK_RULES.find((rule) => rule.unlocks === id)
  if (fuse) {
    return `合出${workerQualityDef(fuse.minQuality).label}色${WORKER_RACE_LABEL[fuse.race]}解锁`
  }
  const goldAt = (GOLD_RACE_UNLOCK_ORDER as readonly WorkerRaceId[]).indexOf(id)
  if (goldAt >= 0) return GOLD_RACE_UNLOCK_HINTS[goldAt] ?? '合出金色苦工解锁'
  return '合出指定苦工解锁'
}

export function raceCodexEntries(save: Save): RaceCodexEntry[] {
  hydrateWorkerRaceUnlocks(save)
  return WORKER_RACE_IDS.map((id) => ({
    id,
    label: WORKER_RACE_LABEL[id],
    unlocked: isWorkerRaceUnlocked(save, id),
    hint: raceUnlockHint(id),
  }))
}
