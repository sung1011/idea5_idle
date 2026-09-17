import { enemyRankFor } from './combatAttrs'
import type { Encounter, EncounterPower, EncounterQuality, EnemyEncounter, EnemyRank, Save } from './types'

/** 新档 / 旧档缺字段从第 1 章开始。 */
export const MAIN_CHAPTER_START = 1
/** 本章成功领取这么多次敌人格战利品后，下一张新刷出的敌人是本章 Boss。 */
export const MAIN_LOOT_CLAIMS_GOAL = 10

/**
 * 章节战斗倍率（HP / ATK）。下标 0 不用，第 1 章 = 1。
 * 每章大约 +8%～+10%，温和成长；超出表长后按末档 ×1.08^(额外章) 延。
 */
export const MAIN_CHAPTER_COMBAT_MUL: readonly number[] = [
  1, 1, 1.08, 1.16, 1.25, 1.35, 1.46, 1.58, 1.71, 1.85, 2,
]

export function normalizeMainChapter(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) return MAIN_CHAPTER_START
  return Math.floor(value)
}

export function normalizeMainLootClaims(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0
  return Math.floor(value)
}

export function chapterCombatMul(chapter: unknown): number {
  const ch = normalizeMainChapter(chapter)
  if (ch < MAIN_CHAPTER_COMBAT_MUL.length) return MAIN_CHAPTER_COMBAT_MUL[ch]
  const last = MAIN_CHAPTER_COMBAT_MUL[MAIN_CHAPTER_COMBAT_MUL.length - 1]
  return last * Math.pow(1.08, ch - (MAIN_CHAPTER_COMBAT_MUL.length - 1))
}

export function hydrateMainChapterFields(save: Save): Save {
  save.mainChapter = normalizeMainChapter((save as { mainChapter?: unknown }).mainChapter)
  save.mainLootClaims = normalizeMainLootClaims((save as { mainLootClaims?: unknown }).mainLootClaims)
  return save
}

export function mainChapterHeader(save: Pick<Save, 'mainChapter' | 'mainLootClaims'>): string {
  const chapter = normalizeMainChapter(save.mainChapter)
  const claims = normalizeMainLootClaims(save.mainLootClaims)
  if (claims >= MAIN_LOOT_CLAIMS_GOAL) return `第 ${chapter} 章 · 本章 Boss`
  return `第 ${chapter} 章 · 本章战利品 ${claims}/${MAIN_LOOT_CLAIMS_GOAL}`
}

export function isChapterBoss(enc: Encounter): enc is EnemyEncounter {
  return enc.kind === 'enemy' && enc.chapterBoss === true
}

/** 板上还有未领奖的本章 Boss（含战斗中 / 胜可领 / 败可再战 / 未开打）。 */
export function hasLiveChapterBoss(encounters: readonly Encounter[]): boolean {
  return encounters.some((enc) => isChapterBoss(enc) && !enc.lootClaimed)
}

/** claims≥10 且板上还没有未领的本章 Boss 时，下一张新刷的敌人强制为 Boss。 */
export function shouldForceChapterBoss(save: Pick<Save, 'mainLootClaims'>, encounters: readonly Encounter[]): boolean {
  return normalizeMainLootClaims(save.mainLootClaims) >= MAIN_LOOT_CLAIMS_GOAL && !hasLiveChapterBoss(encounters)
}

/**
 * 主线杂兵池：远近强弱 / 品质仍走 enemyRankFor，但橙档首领压成精英。
 * 本章 Boss 只由战利品计数强制刷出。
 */
export function mainlineEnemyRank(
  power: EncounterPower,
  quality: EncounterQuality,
  forceChapterBoss: boolean,
): EnemyRank {
  if (forceChapterBoss) return 'boss'
  const rank = enemyRankFor(power, quality)
  return rank === 'boss' ? 'elite' : rank
}
