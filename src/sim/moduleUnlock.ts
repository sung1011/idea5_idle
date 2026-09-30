import { normalizeKnightLevel, xpToNextKnightLevel } from './knightLevel'
import { isStationId } from './tables'
import type { Save, StationId } from './types'

function knightLevelOf(save: Pick<Save, 'knightLevel'>): number {
  return normalizeKnightLevel(save.knightLevel)
}

/** 撤回锁定工位时的休息回血。由 food.ts 晚绑定，避免和工位解锁绕成环。 */
let recallRestFood: ((save: Save, workerId: string) => void) | null = null

export function bindRecallRestFood(fn: (save: Save, workerId: string) => void): void {
  recallRestFood = fn
}

/** 跟主线等级任务走的玩法。1 级的工坊、抽人、营地、合成、药剂和悬赏不进这张表。 */
export const MODULE_IDS = [
  'alchemy',
  'tech',
  'hunting',
  'market',
  'cooking',
  'restFood',
  'dungeon',
  'herb',
  'beast',
  'mining',
  'inscription',
  'rune',
  'treasure',
] as const

export type ModuleId = (typeof MODULE_IDS)[number]

export const MODULE_UNLOCK_KNIGHT: Record<ModuleId, number> = {
  alchemy: 2,
  tech: 11,
  hunting: 6,
  market: 6,
  cooking: 8,
  restFood: 8,
  dungeon: 8,
  herb: 10,
  beast: 13,
  mining: 16,
  inscription: 18,
  rune: 18,
  treasure: 20,
}

const MODULE_LABEL: Record<ModuleId, string> = {
  alchemy: '炼金',
  tech: '科技',
  hunting: '狩猎',
  market: '集市',
  cooking: '烹饪',
  restFood: '营地伙食',
  dungeon: '地牢',
  herb: '割草',
  beast: '困兽',
  mining: '采矿',
  inscription: '铭刻',
  rune: '符文槽',
  treasure: '夺宝',
}

const MODULE_BLURB: Record<ModuleId, string> = {
  alchemy: '炼金站开了，可以熬药，也能挂上第一条自动线。',
  tech: '可以点亮一项科技，给工坊加一点助力。自动线名额变成 2。',
  hunting: '狩猎站开了，可以派人去打肉。',
  market: '集市开了，可以交一单换赏金。',
  cooking: '烹饪站开了，可以给营地做饭。',
  restFood: '营地可以选定一份伙食，残血回来就吃。',
  dungeon: '地牢开了，可以下去打一场。',
  herb: '割草开了，可以去收一块草地。',
  beast: '困兽开了，可以组队挑战今天这头。',
  mining: '采矿站开了，可以派人挖矿。',
  inscription: '铭刻站开了，可以做符文。',
  rune: '出战选人时可以打开符文槽。',
  treasure: '夺宝开了，可以去开采一座矿洞。',
}

const STATION_MODULE: Partial<Record<StationId, ModuleId>> = {
  alchemy: 'alchemy',
  hunting: 'hunting',
  cooking: 'cooking',
  mining: 'mining',
  inscription: 'inscription',
}

/** 跟主线「升到酋长 N 级」同一句里的开放名单。 */
export const MODULE_GATE_NAMES: Partial<Record<number, string>> = {
  2: '炼金',
  6: '狩猎、集市',
  8: '烹饪、伙食、地牢',
  10: '割草',
  11: '科技',
  13: '困兽',
  16: '采矿',
  18: '铭刻、符文槽',
  20: '夺宝',
}

type GateSave = {
  guideQuestStep?: number
  guideQuestSkipped?: readonly string[] | null
}

type GateFn = (save: GateSave, level: number) => boolean
let gateFn: GateFn | null = null

/** 由主线模块挂上，避免和任务表互相引用。 */
export function bindMainlineModuleGate(fn: GateFn): void {
  gateFn = fn
}

export function levelGateTitle(level: number): string {
  const names = MODULE_GATE_NAMES[level]
  if (!names) return `升到酋长 ${level} 级`
  return `升到酋长 ${level} 级（开放${names}）`
}

/** 领到「升到酋长 11 级」时给的一句提示。第二条自动线跟着科技模块走。 */
export const SECOND_AUTO_LINE_TIP = '自动线名额变成 2，可以再挂一条'

export function levelGateUnlockNote(level: number): string | null {
  const names = MODULE_GATE_NAMES[level]
  if (!names) return null
  if (level === 11) return `完成后开启：${names}。${SECOND_AUTO_LINE_TIP}`
  return `完成后开启：${names}`
}

export function modulesAtGate(level: number): ModuleId[] {
  return MODULE_IDS.filter((id) => MODULE_UNLOCK_KNIGHT[id] === level)
}

export function modulesUpToKnight(level: number): ModuleId[] {
  const cap = Math.max(1, Math.floor(level))
  return MODULE_IDS.filter((id) => MODULE_UNLOCK_KNIGHT[id] <= cap)
}

export function isModuleId(id: unknown): id is ModuleId {
  return typeof id === 'string' && (MODULE_IDS as readonly string[]).includes(id)
}

export function moduleUnlockKnightLevel(id: ModuleId): number {
  return MODULE_UNLOCK_KNIGHT[id]
}

export function moduleLabel(id: ModuleId): string {
  return MODULE_LABEL[id]
}

export function moduleBlurb(id: ModuleId): string {
  return MODULE_BLURB[id]
}

export function moduleLockedTip(id: ModuleId): string {
  return `完成主线「${levelGateTitle(moduleUnlockKnightLevel(id))}」后开启`
}

function gateOpen(save: GateSave, level: number): boolean {
  return gateFn?.(save, level) === true
}

export function isModuleUnlocked(
  save: { openedModules?: readonly string[] | null } & GateSave,
  id: ModuleId,
): boolean {
  if (save.openedModules?.includes(id)) return true
  return gateOpen(save, moduleUnlockKnightLevel(id))
}

/** PVP 页在割草、困兽、夺宝任一开放后才能进。 */
export function isPvpUnlocked(save: { openedModules?: readonly string[] | null } & GateSave): boolean {
  return isModuleUnlocked(save, 'herb') || isModuleUnlocked(save, 'beast') || isModuleUnlocked(save, 'treasure')
}

export function isAppTabUnlocked(
  save: { openedModules?: readonly string[] | null } & GateSave,
  tab: 'workshop' | 'encounters' | 'pvp' | 'tech',
): boolean {
  if (tab === 'tech') return isModuleUnlocked(save, 'tech')
  if (tab === 'pvp') return isPvpUnlocked(save)
  return true
}

export function appTabLockedTip(
  _save: { openedModules?: readonly string[] | null } & GateSave,
  tab: 'pvp' | 'tech',
): string {
  if (tab === 'tech') return moduleLockedTip('tech')
  return moduleLockedTip('herb')
}

export function grantOpenedModules(save: Save, ids: readonly string[]): void {
  const set = new Set<ModuleId>(Array.isArray(save.openedModules) ? save.openedModules.filter(isModuleId) : [])
  let changed = false
  for (const id of ids) {
    if (!isModuleId(id) || set.has(id)) continue
    set.add(id)
    changed = true
  }
  if (!Array.isArray(save.openedModules) || changed) save.openedModules = [...set]
}

/** 新开的入口还没点进去。 */
export function moduleNoticeOn(
  save: { openedModules?: readonly string[] | null; seenModules?: readonly string[] | null } & GateSave,
  id: ModuleId,
): boolean {
  if (!isModuleUnlocked(save, id)) return false
  return save.seenModules?.includes(id) !== true
}

export function markModuleSeen(save: Save, id: ModuleId): boolean {
  if (!isModuleId(id) || !isModuleUnlocked(save, id)) return false
  if (save.seenModules?.includes(id)) return false
  save.seenModules = [...(save.seenModules ?? []), id]
  return true
}

export function hydrateModuleUnlocks(save: Save): void {
  const prior = Array.isArray(save.openedModules) ? save.openedModules.filter(isModuleId) : []
  save.openedModules = [...new Set(prior)]
  const seen = Array.isArray(save.seenModules) ? save.seenModules.filter(isModuleId) : []
  save.seenModules = [...new Set(seen)]
  save.moduleUnlockQueue = []
  recallCrewFromLockedStations(save)
}

/** 还关着的站上的人撤回营地。已经在岗的站会先被记成开放，不会被撤。 */
export function recallCrewFromLockedStations(save: Save): number {
  let n = 0
  for (const worker of save.workers) {
    const stationId = worker.assignment
    if (!stationId || !isStationId(stationId)) continue
    const moduleId = STATION_MODULE[stationId]
    if (!moduleId || isModuleUnlocked(save, moduleId)) continue
    worker.assignment = null
    recallRestFood?.(save, worker.id)
    n += 1
  }
  return n
}

/** 下一个还没由主线领奖打开的门槛。满了就没有下一项。 */
export function nextModuleUnlock(
  level: number,
  save?: { openedModules?: readonly string[] | null } & GateSave,
): { knight: number; label: string } | null {
  const current = Math.max(1, Math.floor(level))
  let best = Number.POSITIVE_INFINITY
  for (const gate of Object.keys(MODULE_GATE_NAMES)) {
    const knight = Number(gate)
    const ids = modulesAtGate(knight)
    const stillLocked = save ? ids.some((id) => !isModuleUnlocked(save, id)) : knight > current
    if (!stillLocked) continue
    if (knight < best) best = knight
  }
  if (!Number.isFinite(best)) return null
  return { knight: best, label: `完成主线「${levelGateTitle(best)}」后开启` }
}

/** 当前酋长经验占下一级门槛的比例。 */
export function knightLevelProgress(save: Save): { level: number; ratio: number; percent: number } {
  const level = knightLevelOf(save)
  const need = xpToNextKnightLevel(level)
  const xp = typeof save.knightXp === 'number' && Number.isFinite(save.knightXp) ? Math.max(0, save.knightXp) : 0
  const ratio = need <= 0 ? 0 : Math.min(1, xp / need)
  return { level, ratio, percent: Math.round(ratio * 100) }
}
