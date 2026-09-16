import { defaultCategory, findCategory, stationCategories, STATION_DEF, xpToNextLevel } from './tables'
import type { ActionResult, CategoryId, Save, StationId, StationState } from './types'

export function unlockedCategoriesAt(stationId: StationId, level: number): CategoryId[] {
  return stationCategories(stationId)
    .filter((c) => c.unlockLevel <= level)
    .map((c) => c.id)
}

export function isCategoryUnlocked(save: Save, stationId: StationId, categoryId: CategoryId): boolean {
  return save.stations[stationId].unlockedCategories.includes(categoryId)
}

export function selectedCategoryDef(save: Save, stationId: StationId) {
  const selected = save.stations[stationId].selectedCategory
  return findCategory(stationId, selected) ?? defaultCategory(stationId)
}

export function categoryUnlockNeed(stationId: StationId, categoryId: CategoryId): number {
  return findCategory(stationId, categoryId)?.unlockLevel ?? 1
}

export type CategoryPickOption = {
  id: CategoryId
  label: string
  unlocked: boolean
  unlockLevel: number
}

/** 下拉：全部已解锁 + 最多 1 个「下一档」未解锁（置灰）。 */
export function categoryPickOptions(save: Save, stationId: StationId): CategoryPickOption[] {
  const unlocked = new Set(save.stations[stationId].unlockedCategories)
  const open: CategoryPickOption[] = []
  let nextLocked: CategoryPickOption | null = null
  for (const cat of stationCategories(stationId)) {
    const row: CategoryPickOption = {
      id: cat.id,
      label: cat.label,
      unlocked: unlocked.has(cat.id),
      unlockLevel: cat.unlockLevel,
    }
    if (row.unlocked) open.push(row)
    else if (!nextLocked) nextLocked = row
  }
  return nextLocked ? [...open, nextLocked] : open
}

export function syncUnlockedCategories(station: StationState, stationId: StationId): CategoryId[] {
  const fromLevel = unlockedCategoriesAt(stationId, station.stationLevel)
  const added = fromLevel.filter((id) => !station.unlockedCategories.includes(id))
  station.unlockedCategories = fromLevel
  const selected = findCategory(stationId, station.selectedCategory)
  if (!selected || !station.unlockedCategories.includes(station.selectedCategory)) {
    station.selectedCategory = station.unlockedCategories[0] ?? defaultCategory(stationId).id
  }
  return added
}

export function blankStation(stationId: StationId): StationState {
  const first = defaultCategory(stationId)
  return {
    progress: 0,
    stallReason: null,
    completed: 0,
    resonanceStreak: 0,
    stationXp: 0,
    stationLevel: 1,
    selectedCategory: first.id,
    unlockedCategories: unlockedCategoriesAt(stationId, 1),
    progressNotice: null,
  }
}

/** 旧存档补等级 / 品类；非法 selected 回落到已解锁的第一档。 */
export function hydrateStationState(stationId: StationId, incoming?: Partial<StationState>): StationState {
  const blank = blankStation(stationId)
  if (!incoming) return blank
  const levelRaw = incoming.stationLevel
  const xpRaw = incoming.stationXp
  const station: StationState = {
    progress: Number.isFinite(incoming.progress) ? Number(incoming.progress) : 0,
    stallReason: incoming.stallReason === 'emptyInput' ? 'emptyInput' : null,
    completed: Number.isFinite(incoming.completed) ? Math.max(0, Math.floor(Number(incoming.completed))) : 0,
    resonanceStreak: Number.isFinite(incoming.resonanceStreak)
      ? Math.max(0, Math.floor(Number(incoming.resonanceStreak)))
      : 0,
    stationXp: Number.isFinite(xpRaw) ? Math.max(0, Number(xpRaw)) : 0,
    stationLevel: Number.isFinite(levelRaw) && Number(levelRaw) >= 1 ? Math.floor(Number(levelRaw)) : 1,
    selectedCategory: incoming.selectedCategory ?? blank.selectedCategory,
    unlockedCategories: Array.isArray(incoming.unlockedCategories)
      ? incoming.unlockedCategories.filter((id): id is CategoryId => Boolean(findCategory(stationId, id)))
      : [],
    progressNotice: incoming.progressNotice ?? null,
  }
  syncUnlockedCategories(station, stationId)
  return station
}

export function hydrateStations(raw?: Partial<Record<StationId, Partial<StationState>>>): Save['stations'] {
  const next = {} as Save['stations']
  for (const id of Object.keys(STATION_DEF) as StationId[]) {
    next[id] = hydrateStationState(id, raw?.[id])
  }
  return next
}

export function grantStationXp(save: Save, stationId: StationId, xp: number): void {
  if (xp <= 0) return
  const station = save.stations[stationId]
  station.stationXp += xp
  const unlockedNow: CategoryId[] = []
  let leveled = false
  while (station.stationXp >= xpToNextLevel(station.stationLevel)) {
    station.stationXp -= xpToNextLevel(station.stationLevel)
    station.stationLevel += 1
    leveled = true
    unlockedNow.push(...syncUnlockedCategories(station, stationId))
  }
  if (!leveled) return
  const label = STATION_DEF[stationId].label
  const bits = [`${label}升到 Lv${station.stationLevel}`]
  if (unlockedNow.length) {
    const names = unlockedNow.map((id) => findCategory(stationId, id)?.label ?? id)
    bits.push(`解锁${names.join('、')}`)
  }
  station.progressNotice = bits.join('，')
}

export function selectStationCategory(
  save: Save,
  stationId: StationId,
  categoryId: CategoryId,
): ActionResult {
  const def = findCategory(stationId, categoryId)
  if (!def) return { ok: false, reason: '没有这个品类' }
  if (!isCategoryUnlocked(save, stationId, categoryId)) {
    return { ok: false, reason: `未解锁（需 Lv${def.unlockLevel}）` }
  }
  const station = save.stations[stationId]
  if (station.selectedCategory === categoryId) return { ok: true }
  station.selectedCategory = categoryId
  station.progress = 0
  station.stallReason = null
  return { ok: true, message: `${STATION_DEF[stationId].label}切换为${def.label}` }
}
