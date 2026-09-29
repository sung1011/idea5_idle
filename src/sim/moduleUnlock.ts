import { offerRestFood } from './food'
import { bindKnightUnlockQueue, xpToNextKnightLevel } from './knightLevel'
import { knightLevelOf, stationUnlockKnightLevel } from './stationUnlock'
import { isStationId, PLAYABLE_STATION_IDS } from './tables'
import type { Save, StationId } from './types'

/** 跟酋长等级走的玩法。1 级的工坊、抽人、营地、合成、药剂和战场不进这张表。 */
export const MODULE_IDS = [
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
  tech: 4,
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
  tech: '可以点亮一项科技，给工坊加一点助力。',
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
  hunting: 'hunting',
  cooking: 'cooking',
  mining: 'mining',
  inscription: 'inscription',
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
  return `酋长 ${moduleUnlockKnightLevel(id)} 级开放${moduleLabel(id)}`
}

export function isModuleUnlocked(save: Pick<Save, 'knightLevel' | 'openedModules'>, id: ModuleId): boolean {
  if (knightLevelOf(save) >= moduleUnlockKnightLevel(id)) return true
  return save.openedModules?.includes(id) === true
}

/** PVP 页在割草、困兽、夺宝任一开放后才能进。 */
export function isPvpUnlocked(save: Pick<Save, 'knightLevel' | 'openedModules'>): boolean {
  return isModuleUnlocked(save, 'herb') || isModuleUnlocked(save, 'beast') || isModuleUnlocked(save, 'treasure')
}

export function isAppTabUnlocked(
  save: Pick<Save, 'knightLevel' | 'openedModules'>,
  tab: 'workshop' | 'encounters' | 'pvp' | 'tech',
): boolean {
  if (tab === 'tech') return isModuleUnlocked(save, 'tech')
  if (tab === 'pvp') return isPvpUnlocked(save)
  return true
}

export function appTabLockedTip(save: Pick<Save, 'knightLevel' | 'openedModules'>, tab: 'pvp' | 'tech'): string {
  if (tab === 'tech') return moduleLockedTip('tech')
  return moduleLockedTip('herb')
}

/** 酋长升级跨过的门槛。已经玩过、写进 openedModules 的不再弹。 */
export function queueModuleUnlocks(save: Save, from: number | null, to: number): void {
  if (from == null || to <= from) return
  if (!Array.isArray(save.moduleUnlockQueue)) save.moduleUnlockQueue = []
  const opened = new Set(save.openedModules ?? [])
  for (const id of MODULE_IDS) {
    const need = MODULE_UNLOCK_KNIGHT[id]
    if (need <= from || need > to) continue
    if (opened.has(id)) continue
    if (save.moduleUnlockQueue.includes(id)) continue
    save.moduleUnlockQueue.push(id)
  }
}

export function dismissModuleUnlock(save: Save): ModuleId | null {
  const id = save.moduleUnlockQueue?.[0]
  if (!isModuleId(id)) {
    save.moduleUnlockQueue = []
    return null
  }
  save.moduleUnlockQueue = save.moduleUnlockQueue.slice(1)
  return id
}

function stationEvidence(save: Save, stationId: StationId): boolean {
  if (save.workers?.some((worker) => worker.assignment === stationId)) return true
  const station = save.stations?.[stationId]
  if (!station) return false
  if ((station.completed ?? 0) >= 1) return true
  return (station.stationLevel ?? 1) > 1
}

/** 老档已经玩过的模块。等级不够也保持开放。 */
export function playedModuleIds(save: Save): ModuleId[] {
  const ids: ModuleId[] = []
  const push = (id: ModuleId) => {
    if (!ids.includes(id)) ids.push(id)
  }
  if ((save.unlockedTechIds?.length ?? 0) > 0) push('tech')
  if (Object.values(save.techLevels ?? {}).some((level) => typeof level === 'number' && level > 0)) push('tech')
  if (save.starterCopperPawnDone) push('market')
  if (save.marketEncounters?.some((enc) => 'completed' in enc && enc.completed)) push('market')
  if (save.restFoodId != null) push('restFood')
  const attempts = save.dungeon?.attemptsUsedById
  if (attempts && Object.values(attempts).some((n) => typeof n === 'number' && n > 0)) push('dungeon')
  const herb = save.herbPvp
  if (herb && (herb.playerScore > 0 || !!herb.lastRewardText || (herb.offline?.score ?? 0) > 0)) push('herb')
  const beast = save.beastPvp
  if (
    beast &&
    (beast.playerDamage > 0 || !!beast.lastRewardText || (beast.offline?.damage ?? 0) > 0 || beast.fight != null)
  ) {
    push('beast')
  }
  const mines = save.treasureMines?.mines ?? []
  if (
    mines.some(
      (mine) =>
        mine.owner === 'player' ||
        (mine.dugOre ?? 0) > 0 ||
        (mine.dugCrystal ?? 0) > 0 ||
        (mine.crewIds?.length ?? 0) > 0,
    )
  ) {
    push('treasure')
  }
  if (save.guideQuestRuneOpened) push('rune')
  for (const stationId of PLAYABLE_STATION_IDS) {
    if (!stationEvidence(save, stationId)) continue
    const moduleId = STATION_MODULE[stationId]
    if (moduleId) push(moduleId)
    if (stationId === 'inscription') push('rune')
  }
  return ids
}

export function hydrateModuleUnlocks(save: Save): void {
  const prior = Array.isArray(save.openedModules) ? save.openedModules.filter(isModuleId) : []
  const set = new Set<ModuleId>([...prior, ...playedModuleIds(save)])
  save.openedModules = [...set]
  save.moduleUnlockQueue = Array.isArray(save.moduleUnlockQueue)
    ? save.moduleUnlockQueue.filter(isModuleId)
    : []
  recallCrewFromLockedStations(save)
}

/** 还关着的站上的人撤回营地。已经在岗的站会先被记成开放，不会被撤。 */
export function recallCrewFromLockedStations(save: Save): number {
  let n = 0
  for (const worker of save.workers) {
    const stationId = worker.assignment
    if (!stationId || !isStationId(stationId)) continue
    if (knightLevelOf(save) >= stationUnlockKnightLevel(stationId)) continue
    if (save.openedModules?.includes(stationId)) continue
    worker.assignment = null
    offerRestFood(save, worker.id)
    n += 1
  }
  return n
}

/** 下一个还没到的解锁门槛。同一级的名字拼在一起。满级后没有下一项。 */
export function nextModuleUnlock(level: number): { knight: number; label: string } | null {
  const current = Math.max(1, Math.floor(level))
  let best = Number.POSITIVE_INFINITY
  const names: string[] = []
  for (const id of MODULE_IDS) {
    const need = MODULE_UNLOCK_KNIGHT[id]
    if (need <= current) continue
    if (need < best) {
      best = need
      names.length = 0
    }
    if (need === best) names.push(MODULE_LABEL[id])
  }
  if (!names.length || !Number.isFinite(best)) return null
  return { knight: best, label: `酋长 ${best} 级开放${names.join('、')}` }
}

/** 当前酋长经验占下一级门槛的比例。 */
export function knightLevelProgress(save: Save): { level: number; ratio: number; percent: number } {
  const level = knightLevelOf(save)
  const need = xpToNextKnightLevel(level)
  const xp = typeof save.knightXp === 'number' && Number.isFinite(save.knightXp) ? Math.max(0, save.knightXp) : 0
  const ratio = need <= 0 ? 0 : Math.min(1, xp / need)
  return { level, ratio, percent: Math.round(ratio * 100) }
}

bindKnightUnlockQueue(queueModuleUnlocks)
