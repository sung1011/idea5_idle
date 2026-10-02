import type { ActionResult, Save } from './types'
import { WORKER_RACE_IDS } from './types'
import { hydrateWorkerRaceUnlocks } from './workerRaceUnlock'

export const RACE_TITLE_KIN = '族亲'
export const RACE_TITLE_CHIEF = '百族酋长'

export type RaceProgressId = 't6' | 't12' | 'all'

export type RaceProgressDef = {
  id: RaceProgressId
  need: number
  diamonds: number
  title?: string
}

export type RaceCodexState = {
  claimedProgress: RaceProgressId[]
  titles: string[]
}

export const RACE_PROGRESS: readonly RaceProgressDef[] = [
  { id: 't6', need: 6, diamonds: 5, title: RACE_TITLE_KIN },
  { id: 't12', need: 12, diamonds: 12 },
  { id: 'all', need: WORKER_RACE_IDS.length, diamonds: 25, title: RACE_TITLE_CHIEF },
]

const PROGRESS_IDS = new Set<string>(RACE_PROGRESS.map((row) => row.id))

export function blankRaceCodex(): RaceCodexState {
  return {
    claimedProgress: [],
    titles: [],
  }
}

function uniqueIds(raw: unknown, allow: (id: string) => boolean): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string' || !allow(item) || seen.has(item)) continue
    seen.add(item)
    out.push(item)
  }
  return out
}

function isProgressId(id: string): id is RaceProgressId {
  return PROGRESS_IDS.has(id)
}

function isRaceTitle(id: string): boolean {
  return id === RACE_TITLE_KIN || id === RACE_TITLE_CHIEF
}

function pushUnique(list: string[], id: string): boolean {
  if (list.includes(id)) return false
  list.push(id)
  return true
}

function grantTitle(bag: RaceCodexState, title: string): void {
  pushUnique(bag.titles, title)
}

export function ensureRaceCodex(save: Save): RaceCodexState {
  const current = (save as { raceCodex?: unknown }).raceCodex
  if (current && typeof current === 'object' && Array.isArray((current as RaceCodexState).claimedProgress)) {
    return current as RaceCodexState
  }
  save.raceCodex = blankRaceCodex()
  return save.raceCodex
}

export function normalizeRaceCodex(raw: unknown): RaceCodexState {
  const blank = blankRaceCodex()
  if (!raw || typeof raw !== 'object') return blank
  const src = raw as Partial<RaceCodexState>
  return {
    claimedProgress: uniqueIds(src.claimedProgress, isProgressId) as RaceProgressId[],
    titles: uniqueIds(src.titles, isRaceTitle),
  }
}

export function unlockedRaceCount(save: Save): number {
  hydrateWorkerRaceUnlocks(save)
  return save.unlockedWorkerRaces.length
}

export function hydrateRaceCodex(save: Save): void {
  save.raceCodex = normalizeRaceCodex((save as { raceCodex?: unknown }).raceCodex)
  hydrateWorkerRaceUnlocks(save)
}

export function raceProgressView(save: Save): Array<
  RaceProgressDef & { lit: number; claimed: boolean; ready: boolean }
> {
  const bag = ensureRaceCodex(save)
  const lit = unlockedRaceCount(save)
  return RACE_PROGRESS.map((row) => {
    const claimed = bag.claimedProgress.includes(row.id)
    return { ...row, lit, claimed, ready: !claimed && lit >= row.need }
  })
}

export function claimRaceProgress(save: Save, id: RaceProgressId): ActionResult {
  const row = RACE_PROGRESS.find((item) => item.id === id)
  if (!row) return { ok: false, reason: '没有这项进度奖' }
  const bag = ensureRaceCodex(save)
  if (bag.claimedProgress.includes(id)) return { ok: false, reason: '已经领过了' }
  const lit = unlockedRaceCount(save)
  if (lit < row.need) return { ok: false, reason: `还差 ${row.need - lit} 种` }
  bag.claimedProgress.push(id)
  save.diamonds += row.diamonds
  if (row.title) grantTitle(bag, row.title)
  const titleNote = row.title ? `，称号「${row.title}」` : ''
  return { ok: true, message: `图鉴进度奖：钻石 +${row.diamonds}${titleNote}` }
}

export function equippedRaceTitle(save: Save): string | null {
  const titles = ensureRaceCodex(save).titles
  if (titles.includes(RACE_TITLE_CHIEF)) return RACE_TITLE_CHIEF
  if (titles.includes(RACE_TITLE_KIN)) return RACE_TITLE_KIN
  return titles[0] ?? null
}
