import { DUNGEON_BROKER_ID, DUNGEON_JAILER_ID } from './dungeonTables'
import { isTimedMarketOrder } from './marketTimed'
import type { Encounter, EncounterNeedMap, Save } from './types'

/** 不随日切、换板、矿洞消失清掉的主线累计。 */
export type GuideQuestStats = {
  marketDeals: number
  marketPawn: number
  marketTimed: number
  marketHigh: number
  marketOre: number
  dungeonRuns: number
  dungeonChests: number
  dungeonGoldChests: number
  dungeonBoth: boolean
  dungeonDay: number
  dungeonFought: string[]
  herbAssigns: number
  herbPrecious: number
  herbCounter: number
  herbPayouts: number
  beastChallenges: number
  beastManual: number
  /** 带着符文打过战场或地牢，不论胜负。 */
  runeFights: number
  runeWins: number
  treasureRaids: number
  treasureScouted: number
  treasureGuarded: number
  feast: boolean
}

const ORE_IDS = new Set(['ore', 'ironOre', 'mithrilOre'])

export function blankGuideQuestStats(): GuideQuestStats {
  return {
    marketDeals: 0,
    marketPawn: 0,
    marketTimed: 0,
    marketHigh: 0,
    marketOre: 0,
    dungeonRuns: 0,
    dungeonChests: 0,
    dungeonGoldChests: 0,
    dungeonBoth: false,
    dungeonDay: 0,
    dungeonFought: [],
    herbAssigns: 0,
    herbPrecious: 0,
    herbCounter: 0,
    herbPayouts: 0,
    beastChallenges: 0,
    beastManual: 0,
    runeFights: 0,
    runeWins: 0,
    treasureRaids: 0,
    treasureScouted: 0,
    treasureGuarded: 0,
    feast: false,
  }
}

function countOf(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0
  return Math.floor(value)
}

export function normalizeGuideQuestStats(raw: unknown): GuideQuestStats {
  const blank = blankGuideQuestStats()
  if (!raw || typeof raw !== 'object') return blank
  const src = raw as Partial<GuideQuestStats>
  const fought = Array.isArray(src.dungeonFought)
    ? src.dungeonFought.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : []
  return {
    marketDeals: countOf(src.marketDeals),
    marketPawn: countOf(src.marketPawn),
    marketTimed: countOf(src.marketTimed),
    marketHigh: countOf(src.marketHigh),
    marketOre: countOf(src.marketOre),
    dungeonRuns: countOf(src.dungeonRuns),
    dungeonChests: countOf(src.dungeonChests),
    dungeonGoldChests: countOf(src.dungeonGoldChests),
    dungeonBoth: src.dungeonBoth === true,
    dungeonDay: countOf(src.dungeonDay),
    dungeonFought: fought,
    herbAssigns: countOf(src.herbAssigns),
    herbPrecious: countOf(src.herbPrecious),
    herbCounter: countOf(src.herbCounter),
    herbPayouts: countOf(src.herbPayouts),
    beastChallenges: countOf(src.beastChallenges),
    beastManual: countOf(src.beastManual),
    runeFights: countOf(src.runeFights),
    runeWins: countOf(src.runeWins),
    treasureRaids: countOf(src.treasureRaids),
    treasureScouted: countOf(src.treasureScouted),
    treasureGuarded: countOf(src.treasureGuarded),
    feast: src.feast === true,
  }
}

export function ensureGuideQuestStats(save: Save): GuideQuestStats {
  const current = save.guideQuestStats
  if (
    current &&
    typeof current.marketDeals === 'number' &&
    Array.isArray(current.dungeonFought) &&
    typeof current.feast === 'boolean' &&
    typeof current.runeFights === 'number'
  ) {
    return current
  }
  save.guideQuestStats = normalizeGuideQuestStats(current)
  return save.guideQuestStats
}

function needMapOf(enc: Encounter): EncounterNeedMap | null {
  if (enc.kind === 'passerby' || enc.kind === 'artisan' || enc.kind === 'bulkBuy') return enc.wants
  if (enc.kind === 'pawn') return enc.pawnWants
  return null
}

function wantsOre(enc: Encounter): boolean {
  const map = needMapOf(enc)
  if (!map) return false
  return Object.entries(map).some(([id, qty]) => ORE_IDS.has(id) && typeof qty === 'number' && qty > 0)
}

/** 集市板成交。战场领战利品不要走这里。 */
export function noteMarketDeal(save: Save, enc: Encounter): void {
  const stats = ensureGuideQuestStats(save)
  stats.marketDeals += 1
  if (enc.kind === 'pawn') stats.marketPawn += 1
  if (isTimedMarketOrder(enc)) stats.marketTimed += 1
  if (enc.quality === 'purple' || enc.quality === 'orange') stats.marketHigh += 1
  if (wantsOre(enc)) stats.marketOre += 1
}

export function noteDungeonRun(save: Save, encounterId: string): void {
  const stats = ensureGuideQuestStats(save)
  const day = save.dungeon?.day ?? 0
  if (stats.dungeonDay !== day) {
    stats.dungeonDay = day
    stats.dungeonFought = []
  }
  if (!stats.dungeonFought.includes(encounterId)) stats.dungeonFought.push(encounterId)
  const fought = new Set(stats.dungeonFought)
  if (fought.has(DUNGEON_JAILER_ID) && fought.has(DUNGEON_BROKER_ID)) stats.dungeonBoth = true
  stats.dungeonRuns += 1
}

export function noteDungeonChest(save: Save, tier: string): void {
  const stats = ensureGuideQuestStats(save)
  stats.dungeonChests += 1
  if (tier === 'gold') stats.dungeonGoldChests += 1
}

export function noteHerbAssign(save: Save, countered: boolean): void {
  const stats = ensureGuideQuestStats(save)
  stats.herbAssigns += 1
  if (countered) stats.herbCounter += 1
}

export function noteHerbPrecious(save: Save, qty = 1): void {
  const gain = Math.max(1, Math.floor(qty))
  ensureGuideQuestStats(save).herbPrecious += gain
}

export function noteHerbPayout(save: Save): void {
  ensureGuideQuestStats(save).herbPayouts += 1
}

export function noteBeastChallenge(save: Save): void {
  ensureGuideQuestStats(save).beastChallenges += 1
}

export function noteBeastManual(save: Save): void {
  ensureGuideQuestStats(save).beastManual += 1
}

function loadoutHasRune(loadout: Partial<Record<string, string>> | undefined): boolean {
  return !!loadout && Object.values(loadout).some((id) => typeof id === 'string' && id.length > 0)
}

/** 带着符文开打就算，不要求打赢。抢洞胜利另记在 treasureRaids。 */
export function noteRuneFight(save: Save, loadout: Partial<Record<string, string>> | undefined): void {
  if (!loadoutHasRune(loadout)) return
  ensureGuideQuestStats(save).runeFights += 1
}

export function noteRuneWin(save: Save, loadout: Partial<Record<string, string>> | undefined): void {
  if (!loadoutHasRune(loadout)) return
  const stats = ensureGuideQuestStats(save)
  stats.runeWins += 1
  stats.runeFights += 1
}

export function noteTreasureRaid(save: Save): void {
  ensureGuideQuestStats(save).treasureRaids += 1
}

export function noteTreasureScouted(save: Save): void {
  ensureGuideQuestStats(save).treasureScouted += 1
}

export function noteTreasureGuarded(save: Save): void {
  ensureGuideQuestStats(save).treasureGuarded += 1
}

export function noteFeast(save: Save): void {
  ensureGuideQuestStats(save).feast = true
}
