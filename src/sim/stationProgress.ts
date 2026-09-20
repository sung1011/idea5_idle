import { syncKnightLevel } from './knightLevel'
import { stationXpMul } from './tech'
import { pushMessage } from './messages'
import {
  asMiningCategoryId,
  defaultCategory,
  findCategory,
  forgeCategoryFromRecipe,
  isToolTypeId,
  miningNodeDef,
  MINING_NODE_DEF,
  stationCategories,
  STATION_DEF,
  xpToNextLevel,
  type MiningCategoryId,
} from './tables'
import { hydrateSelectedForgeToolId, hydrateSelectedToolId, selectedForgeRecipe } from './tools'
import type { ActionResult, CategoryId, MiningNodeState, Save, StationFatigueCombo, StationId, StationState } from './types'
import { blankFatigueCombo } from './workshopHp'

function hydrateWallMs(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return null
  return raw
}

function hydrateFatigueCombo(raw: unknown): StationFatigueCombo {
  const src = raw && typeof raw === 'object' ? (raw as Partial<StationFatigueCombo>) : {}
  const num = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
  return {
    streak: Math.floor(num(src.streak)),
    key: typeof src.key === 'string' && src.key ? src.key : null,
    frustration: Math.floor(num(src.frustration)),
    fog: num(src.fog),
  }
}

export function blankMiningNode(categoryId: CategoryId = 'copper'): MiningNodeState {
  const def = miningNodeDef(categoryId)
  return {
    categoryId: def.categoryId,
    nodeHp: def.nodeHpMax,
    nodeHpMax: def.nodeHpMax,
    recoverAt: null,
  }
}

function hydrateMiningNode(incoming: unknown, categoryId: CategoryId): MiningNodeState {
  const fallback = blankMiningNode(categoryId)
  if (!incoming || typeof incoming !== 'object') return fallback
  const raw = incoming as Partial<MiningNodeState>
  const nodeHpMax =
    typeof raw.nodeHpMax === 'number' && Number.isFinite(raw.nodeHpMax) && raw.nodeHpMax > 0
      ? Math.floor(raw.nodeHpMax)
      : fallback.nodeHpMax
  const nodeHp =
    typeof raw.nodeHp === 'number' && Number.isFinite(raw.nodeHp)
      ? Math.max(0, Math.min(nodeHpMax, Math.floor(raw.nodeHp)))
      : nodeHpMax
  const recoverAt =
    typeof raw.recoverAt === 'number' && Number.isFinite(raw.recoverAt) && raw.recoverAt > 0
      ? raw.recoverAt
      : null
  return {
    categoryId:
      raw.categoryId === 'iron' || raw.categoryId === 'mithril' || raw.categoryId === 'copper'
        ? raw.categoryId
        : fallback.categoryId,
    nodeHp,
    nodeHpMax,
    recoverAt,
  }
}

function hydrateMiningNodes(
  incoming: Partial<StationState> | undefined,
  selected: CategoryId,
): { miningNode: MiningNodeState; miningNodes: NonNullable<StationState['miningNodes']> } {
  const selectedId = asMiningCategoryId(selected)
  const nodes: NonNullable<StationState['miningNodes']> = {}
  const rawMap = incoming?.miningNodes
  if (rawMap && typeof rawMap === 'object') {
    for (const id of Object.keys(MINING_NODE_DEF) as MiningCategoryId[]) {
      if (rawMap[id]) nodes[id] = hydrateMiningNode(rawMap[id], id)
    }
  }
  if (incoming?.miningNode) {
    const node = hydrateMiningNode(incoming.miningNode, incoming.miningNode.categoryId ?? selectedId)
    nodes[asMiningCategoryId(node.categoryId)] = node
  }
  if (!nodes[selectedId]) nodes[selectedId] = blankMiningNode(selectedId)
  return { miningNode: nodes[selectedId]!, miningNodes: nodes }
}

export function attachMiningCategory(station: StationState, categoryId: CategoryId): void {
  const nextId = asMiningCategoryId(categoryId)
  if (!station.miningNodes) station.miningNodes = {}
  if (station.miningNode) {
    station.miningNodes[asMiningCategoryId(station.miningNode.categoryId)] = station.miningNode
  }
  station.miningNode = station.miningNodes[nextId] ?? blankMiningNode(nextId)
  station.miningNodes[nextId] = station.miningNode
}

export function unlockedCategoriesAt(stationId: StationId, level: number): CategoryId[] {
  return stationCategories(stationId)
    .filter((c) => c.unlockLevel <= level)
    .map((c) => c.id)
}

export function isCategoryUnlocked(save: Save, stationId: StationId, categoryId: CategoryId): boolean {
  return save.stations[stationId].unlockedCategories.includes(categoryId)
}

export function selectedCategoryDef(save: Save, stationId: StationId) {
  if (stationId === 'forging') {
    const recipe = selectedForgeRecipe(save)
    if (recipe) return forgeCategoryFromRecipe(recipe)
  }
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
    gatherNotice: null,
    gatherPauseUntil: null,
    selectedToolType: stationId === 'forging' ? 'pick' : null,
    selectedForgeToolId: null,
    craftNotice: null,
    selectedToolId: null,
    enrageUntil: null,
    enrageReadyAt: null,
    fatigueCombo: blankFatigueCombo(),
    ...(stationId === 'mining'
      ? (() => {
          const bundle = hydrateMiningNodes(undefined, first.id)
          return { miningNode: bundle.miningNode, miningNodes: bundle.miningNodes }
        })()
      : {}),
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
    gatherNotice: typeof incoming.gatherNotice === 'string' ? incoming.gatherNotice : null,
    gatherPauseUntil:
      typeof incoming.gatherPauseUntil === 'number' && Number.isFinite(incoming.gatherPauseUntil)
        ? incoming.gatherPauseUntil
        : null,
    selectedToolType:
      stationId === 'forging'
        ? isToolTypeId(incoming.selectedToolType)
          ? incoming.selectedToolType
          : 'pick'
        : null,
    selectedForgeToolId:
      stationId === 'forging'
        ? hydrateSelectedForgeToolId((incoming as { selectedForgeToolId?: unknown }).selectedForgeToolId)
        : null,
    craftNotice: typeof incoming.craftNotice === 'string' ? incoming.craftNotice : null,
    selectedToolId: hydrateSelectedToolId(
      (incoming as { selectedToolId?: unknown }).selectedToolId,
      stationId,
    ),
    enrageUntil: hydrateWallMs(incoming.enrageUntil),
    enrageReadyAt: hydrateWallMs(incoming.enrageReadyAt),
    fatigueCombo: hydrateFatigueCombo(incoming.fatigueCombo),
    ...(stationId === 'mining'
      ? hydrateMiningNodes(incoming, incoming.selectedCategory ?? blank.selectedCategory)
      : {}),
  }
  syncUnlockedCategories(station, stationId)
  if (stationId === 'mining') attachMiningCategory(station, station.selectedCategory)
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
  const granted = xp * stationXpMul(save)
  if (granted <= 0) return
  const station = save.stations[stationId]
  station.stationXp += granted
  const unlockedNow: CategoryId[] = []
  let leveled = false
  while (station.stationXp >= xpToNextLevel(station.stationLevel)) {
    station.stationXp -= xpToNextLevel(station.stationLevel)
    station.stationLevel += 1
    leveled = true
    unlockedNow.push(...syncUnlockedCategories(station, stationId))
  }
  if (!leveled) return
  const knight = syncKnightLevel(save)
  const label = STATION_DEF[stationId].label
  const bits = [`${label}升到 Lv${station.stationLevel}`]
  if (unlockedNow.length) {
    const names = unlockedNow.map((id) => findCategory(stationId, id)?.label ?? id)
    bits.push(`解锁${names.join('、')}`)
  }
  if (knight.gained > 0) {
    bits.push(`骑士升到 Lv${knight.to}`)
    bits.push(`灵感 +${knight.gained}`)
    pushMessage(save, {
      title: '骑士升级',
      body: `骑士等级升到 ${knight.to}，灵感 +${knight.gained}`,
    })
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
  if (stationId === 'mining') attachMiningCategory(station, categoryId)
  station.selectedCategory = categoryId
  station.progress = 0
  station.stallReason = null
  return { ok: true, message: `${STATION_DEF[stationId].label}切换为${def.label}` }
}
