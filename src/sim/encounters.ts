import { addToBank, bankQty } from './bank'
import {
  beginEnemyCombat,
  combatPartyBlockReason,
  combatStatus,
  grantWorkerCombatXp,
  isCombatLost,
  isCombatWon,
  isEnemyCombat,
  isFighting,
  legacyMarchAsWin,
  selectableCombatWorkers,
  type CombatLogSink,
} from './combat'
import { isEnemyTargetRuleId } from './combatTarget'
import { findCombatPartyWorker } from './combatAssist'
import { workerLootXp } from './workerLevel'
import { ensureEnemyIntel, isEnemyRank, pickEnemyWeaknesses, seedInitialRevealedWeaknesses } from './combatAttrs'
import {
  MAIN_CHAPTER_START,
  MAIN_LOOT_CLAIMS_GOAL,
  hasLiveChapterBoss,
  hydrateMainChapterFields,
  isChapterBoss,
  mainlineEnemyRank,
  normalizeMainChapter,
  normalizeMainLootClaims,
  shouldForceChapterBoss,
} from './mainChapter'
import { canAffordCosts, missingCostLabels, takeCosts } from './costs'
import { normalizeRngState, roll01 } from './rng'
import {
  ITEM_DEF,
  STATION_IDS,
  STATION_TOOL_COUNT,
  STATION_TOOL_IDS,
  bulkUnitGold,
  isStationToolId,
  isToolItemId,
  pawnUnitGold,
  stationToolItemId,
  type IoRule,
} from './tables'
import {
  ENCOUNTER_SLOT_MAX,
  ENCOUNTER_SLOT_MIN,
  encounterSlotCount,
  exploreCostMul,
  lootGoldMul,
  rematchSupplyCut,
  tradeGoldMul,
} from './tech'
import type {
  ActionResult,
  ArtisanEncounter,
  BlackMerchantEncounter,
  BulkBuyEncounter,
  Encounter,
  EncounterKind,
  EncounterNeedMap,
  EncounterQuality,
  EnemyEncounter,
  ItemId,
  MerchantEncounter,
  MerchantKind,
  PasserbyEncounter,
  PawnEncounter,
  Save,
  TradeEncounter,
  Worker,
  WorkshopBuff,
} from './types'

/** 主线订单板上限。当前格数用 encounterSlotCount(save)，初始 4。 */
export const ENCOUNTER_SLOT_COUNT = ENCOUNTER_SLOT_MAX

/** 探索费用。随探索次数略涨，超出表长后钉在末档。 */
export const EXPLORE_COST_TABLE: readonly number[] = [8, 10, 12, 14, 16]

export const ENCOUNTER_KIND_LABEL: Record<EncounterKind, string> = {
  enemy: '敌人',
  blackMerchant: '黑心商人',
  passerby: '路人',
  pawn: '当铺',
  artisan: '工匠委托',
  bulkBuy: '收购',
}

export const MERCHANT_KIND_LABEL: Record<MerchantKind, string> = {
  blackMerchant: ENCOUNTER_KIND_LABEL.blackMerchant,
  passerby: ENCOUNTER_KIND_LABEL.passerby,
  pawn: ENCOUNTER_KIND_LABEL.pawn,
}

export const QUALITY_IDS: readonly EncounterQuality[] = ['gray', 'green', 'blue', 'purple', 'orange']

export type QualityDef = {
  id: EncounterQuality
  label: string
  /** 相对绿档的需求倍率。 */
  demandMul: number
  /** 相对绿档的产出倍率。产出/需求随品质上升。 */
  outputMul: number
  /** 探索刷出权重。灰为 0，永不生成。 */
  weight: number
}

/**
 * 品质倍率。绿=基准 1.0。
 * 性价比 = outputMul / demandMul：灰 0.875 → 绿 1.00 → 蓝 1.12 → 紫 1.25 → 橙 1.364。
 */
export const QUALITY_TABLE: Readonly<Record<EncounterQuality, QualityDef>> = {
  gray: { id: 'gray', label: '灰', demandMul: 0.8, outputMul: 0.7, weight: 0 },
  green: { id: 'green', label: '绿', demandMul: 1, outputMul: 1, weight: 60 },
  blue: { id: 'blue', label: '蓝', demandMul: 1.25, outputMul: 1.4, weight: 25 },
  purple: { id: 'purple', label: '紫', demandMul: 1.6, outputMul: 2, weight: 10 },
  orange: { id: 'orange', label: '橙', demandMul: 2.2, outputMul: 3, weight: 5 },
}

export const QUALITY_LABEL: Record<EncounterQuality, string> = {
  gray: QUALITY_TABLE.gray.label,
  green: QUALITY_TABLE.green.label,
  blue: QUALITY_TABLE.blue.label,
  purple: QUALITY_TABLE.purple.label,
  orange: QUALITY_TABLE.orange.label,
}

/** 本章 Boss 品质下限：低于橙抬到橙，橙及以上按原表保留。 */
export const CHAPTER_BOSS_MIN_QUALITY: EncounterQuality = 'orange'

export function qualityRank(quality: EncounterQuality): number {
  const idx = QUALITY_IDS.indexOf(quality)
  return idx >= 0 ? idx : 0
}

export function clampChapterBossQuality(quality: EncounterQuality): EncounterQuality {
  return qualityRank(quality) < qualityRank(CHAPTER_BOSS_MIN_QUALITY) ? CHAPTER_BOSS_MIN_QUALITY : quality
}

/** 旧档低于橙的本章 Boss 抬到橙；小兵 / 精英不改。 */
export function ensureChapterBossQuality(enc: Encounter): Encounter {
  if (!isChapterBoss(enc)) return enc
  enc.quality = clampChapterBossQuality(enc.quality)
  return enc
}

/** 六种订单刷出权重。槽位仍是 5，类型按此袋抽。 */
export const ENCOUNTER_KIND_WEIGHTS: Readonly<Record<EncounterKind, number>> = {
  enemy: 4,
  blackMerchant: 2,
  passerby: 2,
  pawn: 2,
  artisan: 2,
  bulkBuy: 2,
}

export const ENCOUNTER_KINDS: readonly EncounterKind[] = [
  'enemy',
  'blackMerchant',
  'passerby',
  'pawn',
  'artisan',
  'bulkBuy',
]

export const TRADE_KINDS: readonly EncounterKind[] = [
  'blackMerchant',
  'passerby',
  'pawn',
  'artisan',
  'bulkBuy',
]

export const MERCHANT_KINDS: readonly MerchantKind[] = ['blackMerchant', 'passerby', 'pawn']

/** 原商人格按此权重抽三种之一。 */
export const MERCHANT_KIND_WEIGHTS: Readonly<Record<MerchantKind, number>> = {
  blackMerchant: 2,
  passerby: 2,
  pawn: 2,
}

/** 战利品只发金币。绿档基准，品质再乘产出倍率。 */
export const LOOT_GOLD_BASE = 6
/** 本章 Boss 战利品相对同品质普通敌人。 */
export const CHAPTER_BOSS_LOOT_MUL = 1.5

export type EncounterLine = {
  itemId: ItemId
  label: string
  need: number
  have: number
  missing: number
  gold?: number
}

export type EnemyNameDef = { id: string; label: string }

export const ENEMY_NAME_DEFS: readonly EnemyNameDef[] = [
  { id: 'wolfScout', label: '狼群斥候' },
  { id: 'banditCamp', label: '匪帮营地' },
  { id: 'wildBoar', label: '山猪' },
  { id: 'riverRaider', label: '河盗' },
  { id: 'hillBrigand', label: '山贼' },
]

export type BlackMerchantDef = {
  id: string
  label: string
  buyGold: number
  buyOffers: EncounterNeedMap
}

export type ShadyDef = BlackMerchantDef

export type PasserbyDef = {
  id: string
  label: string
  wants: EncounterNeedMap
  offers: EncounterNeedMap
}

export type PawnDef = {
  id: string
  label: string
  pawnWants: EncounterNeedMap
}

export type ArtisanDef = {
  id: string
  label: string
  wants: EncounterNeedMap
  buffMul: number
  buffDurationS: number
}

export type BulkBuyDef = {
  id: string
  label: string
  wants: EncounterNeedMap
}

export const BLACK_MERCHANT_DEFS: readonly BlackMerchantDef[] = [
  { id: 'merchantBuy', label: '干粮贩', buyGold: 8, buyOffers: { meal: 1 } },
  { id: 'merchantBuyOre', label: '矿石掮客', buyGold: 6, buyOffers: { ore: 2 } },
  { id: 'merchantBuyBlade', label: '工具贩', buyGold: 12, buyOffers: { tool: 1 } },
  { id: 'merchantBuyCook', label: '行脚厨子', buyGold: 14, buyOffers: { meal: 2 } },
  { id: 'merchantBuyRoast', label: '烤肉贩', buyGold: 16, buyOffers: { roast: 1 } },
]

export const SHADY_DEFS = BLACK_MERCHANT_DEFS

export const PASSERBY_DEFS: readonly PasserbyDef[] = [
  { id: 'merchantBarter', label: '换货路人', wants: { ore: 3 }, offers: { meal: 1 } },
  { id: 'merchantBarterOre', label: '矿换路人', wants: { fish: 3 }, offers: { ore: 2 } },
  { id: 'merchantBarterBlade', label: '工具路人', wants: { ore: 3 }, offers: { tool: 1 } },
  { id: 'merchantBarterCook', label: '干粮路人', wants: { meal: 1 }, offers: { ore: 2 } },
  { id: 'merchantBarterStew', label: '香料炖路人', wants: { stew: 1 }, offers: { spice: 2 } },
]

export const PAWN_DEFS: readonly PawnDef[] = [
  { id: 'merchantPawn', label: '工具当', pawnWants: { tool: 1 } },
  { id: 'merchantPawnMeal', label: '干粮当', pawnWants: { meal: 1 } },
  { id: 'merchantPawnRoast', label: '烤肉当', pawnWants: { roast: 1 } },
  { id: 'merchantPawnWood', label: '矿料当', pawnWants: { ore: 3 } },
  { id: 'merchantPawnOre', label: '矿石当', pawnWants: { ore: 2 } },
]

export const PAWNSHOP_DEFS = PAWN_DEFS

export const ARTISAN_DEFS: readonly ArtisanDef[] = [
  { id: 'artisanBlade', label: '修工具委托', wants: { tool: 1 }, buffMul: 1.15, buffDurationS: 180 },
  { id: 'artisanMeal', label: '灶头加餐', wants: { meal: 2 }, buffMul: 1.12, buffDurationS: 150 },
  { id: 'artisanStew', label: '炖锅加餐', wants: { stew: 1 }, buffMul: 1.16, buffDurationS: 180 },
  { id: 'artisanPotion', label: '药剂试制', wants: { potion: 1 }, buffMul: 1.18, buffDurationS: 210 },
]

export const BULK_BUY_DEFS: readonly BulkBuyDef[] = [
  { id: 'bulkBlade', label: '工具收购', wants: { tool: 1 } },
  { id: 'bulkMeal', label: '熟食收购', wants: { meal: 2 } },
  { id: 'bulkRoast', label: '烤肉收购', wants: { roast: 2 } },
  { id: 'bulkPotion', label: '药剂收购', wants: { potion: 1 } },
  { id: 'bulkCooked', label: '干粮收购', wants: { meal: 1 } },
]

/** 旧单格出发存档迁进偶遇敌人用。 */
const LEGACY_ORDER_DEFS: ReadonlyArray<{
  id: string
  label: string
  needs: EncounterNeedMap
  lootGold: number
}> = [
  { id: 'scoutRation', label: '斥候干粮', needs: { meal: 2, ore: 1 }, lootGold: 8 },
  { id: 'caravanGuard', label: '商队护卫', needs: { meal: 1, ore: 2, fish: 2 }, lootGold: 12 },
  { id: 'campKitchen', label: '营地开伙', needs: { meal: 3, roast: 1, fish: 2 }, lootGold: 10 },
  { id: 'bladeTrial', label: '备工具出征', needs: { tool: 2, ore: 1 }, lootGold: 14 },
  { id: 'riverWatch', label: '河岸巡守', needs: { meal: 1, fish: 2, ore: 1 }, lootGold: 9 },
  { id: 'timberPost', label: '矿营补给', needs: { ore: 3, meal: 1 }, lootGold: 7 },
]

/**
 * 主线消耗种类池。新刷交物单先从这里掷 1 种。
 * `tool` 只是种类标记：落地时改抽 `MAIN_NEED_TOOL_POOL`（锻造可造的各站专属工具）。
 */
export const MAIN_NEED_ITEM_POOL: readonly ItemId[] = ['meal', 'ore', 'fish', 'tool', 'roast', 'stew', 'potion']

/** 订单要工具时的 id 池，与 `STATION_TOOL_DEF` / 锻造配方同一套。 */
export const MAIN_NEED_TOOL_POOL: readonly ItemId[] = STATION_TOOL_IDS

/** 档位中心随 demandMul × 章节倍率抬高，对齐数量缩放。 */
export const MAIN_NEED_TOOL_TIER_STEP = 1.8
/** 离中心越远权越低，风格接近品质权重（绿高、高档少）。 */
export const MAIN_NEED_TOOL_TIER_DECAY = 0.55

/** 绿档第 1 章底数。缺表项按 MAIN_NEED_BASE_DEFAULT。专属工具走 `tool` 底数。 */
export const MAIN_NEED_BASE: Readonly<Partial<Record<ItemId, number>>> = {
  meal: 2,
  ore: 2,
  fish: 2,
  tool: 2,
  roast: 2,
  stew: 2,
  potion: 2,
}

export const MAIN_NEED_BASE_DEFAULT = 2

/** 章节需求步进。第 1 章 = 1，之后每章 +15%。不绑战斗 HP 倍率。 */
export const CHAPTER_NEED_STEP = 0.15

/** 本章 Boss 只加数量，不再叠第二种物品。 */
export const CHAPTER_BOSS_NEED_MUL = 1.25

type LegacyOrderSave = Save & {
  currentOrderId?: string
  orderIndex?: number
  orderSubmitted?: boolean
}

type LegacyMerchant = {
  kind: 'merchant'
  id: string
  label: string
  wants?: EncounterNeedMap
  offers?: EncounterNeedMap
  buyGold?: number
  buyOffers?: EncounterNeedMap
  completed?: boolean
}

type LegacyEnemy = {
  kind: 'enemy'
  id: string
  label: string
  quality?: EncounterQuality
  needs?: EncounterNeedMap
  lootGold?: number
  departGold?: number
  submitted?: boolean
  departed?: boolean
  marchEndsAt?: number | null
  combat?: unknown
  lootClaimed?: boolean
  enemyRank?: unknown
  chapterBoss?: unknown
  weaknesses?: unknown
  revealedWeaknesses?: unknown
  /** 旧档远近，hydrate 读完即丢。 */
  distance?: unknown
  /** 旧档强弱，hydrate 读完即丢。 */
  power?: unknown
  targetRuleId?: unknown
}

type LegacyTrade = {
  kind?: string
  id: string
  label?: string
  quality?: EncounterQuality
  buyGold?: number
  buyOffers?: EncounterNeedMap
  wants?: EncounterNeedMap
  offers?: EncounterNeedMap
  pawnWants?: EncounterNeedMap
  rewardGold?: number
  buffMul?: number
  buffDurationS?: number
  completed?: boolean
}

export function needEntries(map: EncounterNeedMap): Array<[ItemId, number]> {
  return (Object.entries(map) as Array<[ItemId, number]>).filter(([, qty]) => qty > 0)
}

export function needMapToRules(map: EncounterNeedMap): IoRule[] {
  return needEntries(map).map(([itemId, qty]) => ({ itemId, qty }))
}

export function mergeNeedMaps(...maps: EncounterNeedMap[]): EncounterNeedMap {
  const out: EncounterNeedMap = {}
  for (const map of maps) {
    for (const [itemId, qty] of needEntries(map)) {
      out[itemId] = (out[itemId] ?? 0) + qty
    }
  }
  return out
}

export function isEncounterQuality(value: unknown): value is EncounterQuality {
  return value === 'gray' || value === 'green' || value === 'blue' || value === 'purple' || value === 'orange'
}

export function qualityDef(quality: EncounterQuality): QualityDef {
  return QUALITY_TABLE[quality]
}

/** 产出/需求。品质越高越赚。 */
export function qualityValueRatio(quality: EncounterQuality): number {
  const q = QUALITY_TABLE[quality]
  return q.outputMul / q.demandMul
}

export function scaleQty(qty: number, mul: number): number {
  if (!Number.isFinite(qty) || qty <= 0) return 0
  return Math.max(1, Math.round(qty * mul))
}

export function scaleNeedMap(map: EncounterNeedMap, mul: number): EncounterNeedMap {
  const out: EncounterNeedMap = {}
  for (const [itemId, qty] of needEntries(map)) {
    out[itemId] = scaleQty(qty, mul)
  }
  return out
}

export function scaleGold(gold: number, mul: number): number {
  if (!Number.isFinite(gold) || gold <= 0) return 0
  return Math.max(1, Math.round(gold * mul))
}

export function itemNeedBase(itemId: ItemId): number {
  const key = isStationToolId(itemId) ? 'tool' : itemId
  const base = MAIN_NEED_BASE[key]
  return typeof base === 'number' && base > 0 ? base : MAIN_NEED_BASE_DEFAULT
}

export function isLegacyGenericToolNeed(id: unknown): boolean {
  return isToolItemId(id)
}

/** 新刷交物可落地的物品：种类池里的非通用工具，或锻造专属工具。 */
export function isMainNeedItem(id: unknown): id is ItemId {
  if (typeof id !== 'string') return false
  if (isLegacyGenericToolNeed(id)) return false
  if ((MAIN_NEED_ITEM_POOL as readonly string[]).includes(id)) return true
  return isStationToolId(id)
}

/** 档位中心：第 1 章绿≈1，随品质/章节/Boss 倍率抬高，封顶 20。 */
export function mainNeedToolTierCenter(
  quality: EncounterQuality,
  chapter: unknown,
  chapterBoss = false,
): number {
  const score =
    qualityDef(quality).demandMul * chapterNeedMul(chapter) * (chapterBoss ? CHAPTER_BOSS_NEED_MUL : 1)
  return Math.max(1, Math.min(STATION_TOOL_COUNT, 1 + (score - 1) * MAIN_NEED_TOOL_TIER_STEP))
}

export function mainNeedToolTierWeights(
  quality: EncounterQuality,
  chapter: unknown,
  chapterBoss = false,
): number[] {
  const center = mainNeedToolTierCenter(quality, chapter, chapterBoss)
  return Array.from({ length: STATION_TOOL_COUNT }, (_, i) =>
    Math.pow(MAIN_NEED_TOOL_TIER_DECAY, Math.abs(i + 1 - center)),
  )
}

function pickWeightedIndex(weights: readonly number[], roll: number): number {
  const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0)
  const t = Number.isFinite(roll) ? Math.min(0.999999, Math.max(0, roll)) : 0
  const target = t * Math.max(0, total)
  let acc = 0
  for (let i = 0; i < weights.length; i++) {
    acc += Math.max(0, weights[i])
    if (target < acc) return i
  }
  return Math.max(0, weights.length - 1)
}

function fracFromSalt(salt: number, stride: number): number {
  const n = Number.isFinite(salt) ? Math.abs(Math.floor(salt)) : 0
  return ((n * stride + 3) % 1000) / 1000
}

/** 从锻造可造的各站 tool01–20 抽一把。低章偏低档，高章/高品质偏高档。 */
export function pickMainNeedTool(
  quality: EncounterQuality,
  chapter: unknown,
  chapterBoss = false,
  rng?: { rngState: number },
  salt = 0,
): ItemId {
  const stationRoll = rng ? rollRng(rng) : fracFromSalt(salt, 1)
  const stationIdx = Math.min(STATION_IDS.length - 1, Math.floor(stationRoll * STATION_IDS.length))
  const stationId = STATION_IDS[stationIdx]
  const tierRoll = rng ? rollRng(rng) : fracFromSalt(salt, 17)
  const index = pickWeightedIndex(mainNeedToolTierWeights(quality, chapter, chapterBoss), tierRoll) + 1
  return stationToolItemId(stationId, index)
}

/** 种类池掷到通用工具时，改抽专属工具；其它物品原样。 */
export function resolveMainNeedItem(
  itemId: ItemId,
  quality: EncounterQuality,
  chapter: unknown,
  chapterBoss = false,
  rng?: { rngState: number },
  salt = 0,
): ItemId {
  if (!isLegacyGenericToolNeed(itemId)) return itemId
  return pickMainNeedTool(quality, chapter, chapterBoss, rng, salt)
}

/** 章节需求倍率：1 + (chapter-1) * CHAPTER_NEED_STEP。 */
export function chapterNeedMul(chapter: unknown): number {
  return 1 + (normalizeMainChapter(chapter) - 1) * CHAPTER_NEED_STEP
}

export function scaledDemandQty(
  itemId: ItemId,
  quality: EncounterQuality,
  chapter: unknown,
  chapterBoss = false,
): number {
  const mul =
    qualityDef(quality).demandMul * chapterNeedMul(chapter) * (chapterBoss ? CHAPTER_BOSS_NEED_MUL : 1)
  return Math.max(1, Math.round(itemNeedBase(itemId) * mul))
}

/** 只写 1 个 key 的消耗表。 */
export function scaledMainNeed(
  itemId: ItemId,
  quality: EncounterQuality,
  chapter: unknown,
  chapterBoss = false,
): EncounterNeedMap {
  return { [itemId]: scaledDemandQty(itemId, quality, chapter, chapterBoss) }
}

export function firstNeedItem(map: EncounterNeedMap, fallback: ItemId = 'meal'): ItemId {
  return needEntries(map)[0]?.[0] ?? fallback
}

export function pickMainNeedItem(
  rng: { rngState: number },
  quality: EncounterQuality,
  chapter: unknown,
  chapterBoss = false,
): ItemId {
  const pool = MAIN_NEED_ITEM_POOL
  const idx = Math.min(pool.length - 1, Math.floor(rollRng(rng) * pool.length))
  return resolveMainNeedItem(pool[idx], quality, chapter, chapterBoss, rng)
}

function singleOutputMap(map: EncounterNeedMap, mul: number): EncounterNeedMap {
  const itemId = firstNeedItem(map)
  const qty = needEntries(map)[0]?.[1] ?? 1
  return { [itemId]: scaleQty(qty, mul) }
}

/** 缺 needs 的旧敌：按品质 / 章节补一张单物品补给。 */
export function enemyNeedsFor(
  quality: EncounterQuality = 'green',
  chapter: unknown = 1,
  chapterBoss = false,
  itemId: ItemId = 'meal',
): EncounterNeedMap {
  return scaledMainNeed(itemId, quality, chapter, chapterBoss)
}

export function enemyLootGoldFor(chapterBoss = false): number {
  return chapterBoss ? scaleGold(LOOT_GOLD_BASE, CHAPTER_BOSS_LOOT_MUL) : LOOT_GOLD_BASE
}

export function pawnGoldForMap(map: EncounterNeedMap): number {
  return needEntries(map).reduce((sum, [itemId, qty]) => sum + pawnUnitGold(itemId) * qty, 0)
}

export function bulkGoldForMap(map: EncounterNeedMap): number {
  return needEntries(map).reduce((sum, [itemId, qty]) => sum + bulkUnitGold(itemId) * qty, 0)
}

export function pawnRewardGold(enc: PawnEncounter, save?: Save): number {
  const base =
    typeof enc.rewardGold === 'number' && enc.rewardGold > 0
      ? enc.rewardGold
      : scaleGold(pawnGoldForMap(enc.pawnWants), qualityDef(enc.quality).outputMul / qualityDef(enc.quality).demandMul)
  return save ? scaleGold(base, tradeGoldMul(save)) : base
}

export function bulkRewardGold(enc: BulkBuyEncounter, save?: Save): number {
  const base = typeof enc.rewardGold === 'number' && enc.rewardGold > 0 ? enc.rewardGold : 0
  return save ? scaleGold(base, tradeGoldMul(save)) : base
}

export function enemyLootPayout(enc: EnemyEncounter, save?: Save): number {
  const base = typeof enc.lootGold === 'number' && enc.lootGold > 0 ? enc.lootGold : 0
  return save ? scaleGold(base, lootGoldMul(save)) : base
}

/** 再战补给：败后再开时每项需求 −N，下限 0。 */
export function combatSupplyNeeds(save: Save, enc: EnemyEncounter): EncounterNeedMap {
  const cut = isCombatLost(enc) ? rematchSupplyCut(save) : 0
  if (cut <= 0) return enc.needs
  const out: EncounterNeedMap = {}
  for (const [itemId, qty] of needEntries(enc.needs)) {
    const next = Math.max(0, qty - cut)
    if (next > 0) out[itemId] = next
  }
  return out
}

export function needLines(save: Save, map: EncounterNeedMap): EncounterLine[] {
  return needEntries(map).map(([itemId, need]) => {
    const have = bankQty(save, itemId)
    return {
      itemId,
      label: ITEM_DEF[itemId].label,
      need,
      have,
      missing: Math.max(0, need - have),
    }
  })
}

export function pawnQuoteLines(save: Save, map: EncounterNeedMap): EncounterLine[] {
  return needLines(save, map).map((line) => ({
    ...line,
    gold: pawnUnitGold(line.itemId) * line.need,
  }))
}

export function formatNeedMap(map: EncounterNeedMap): string {
  const lines = needEntries(map)
  if (!lines.length) return '—'
  return lines.map(([itemId, qty]) => `${ITEM_DEF[itemId].label}×${qty}`).join(' + ')
}

export function formatMarchClock(remainS: number): string {
  const safe = Math.max(0, Math.floor(remainS))
  const m = Math.floor(safe / 60)
  const s = safe % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function marchRemainS(enc: EnemyEncounter, now = Date.now()): number {
  const combat = enc.combat
  if (!combat || combat.outcome) {
    void now
    return 0
  }
  return Math.max(0, Math.ceil((combat.timeoutAt - now) / 1000))
}

export function isMarching(enc: EnemyEncounter, now = Date.now()): boolean {
  void now
  return isFighting(enc)
}

export function isLootReady(enc: EnemyEncounter, now = Date.now()): boolean {
  void now
  return isCombatWon(enc)
}

export function isEncounterDone(enc: Encounter, now = Date.now()): boolean {
  if (enc.kind === 'enemy') return enc.lootClaimed
  void now
  return enc.completed
}

export function stampLabel(enc: Encounter): string {
  if (enc.kind === 'enemy') return '已领'
  if (enc.kind === 'artisan') return '完成'
  return '成交'
}

export function boardSignature(encounters: readonly Encounter[]): string {
  return encounters.map((enc) => enc.id).join('|')
}

export function exploreCost(save: Save): number {
  const count = Number.isFinite(save.exploreCount) && save.exploreCount > 0 ? Math.floor(save.exploreCount) : 0
  const index = Math.min(count, EXPLORE_COST_TABLE.length - 1)
  return Math.max(1, Math.round(EXPLORE_COST_TABLE[index] * exploreCostMul(save)))
}

export function exploreBlockReason(save: Save): string | null {
  const cost = exploreCost(save)
  if (save.gold < cost) return `金币不够：探索要 ${cost}`
  return null
}

export function canExplore(save: Save): boolean {
  return exploreBlockReason(save) === null
}

export function isMerchantKind(kind: string): kind is MerchantKind {
  return kind === 'blackMerchant' || kind === 'passerby' || kind === 'pawn'
}

export function isTradeKind(kind: string): kind is TradeEncounter['kind'] {
  return (
    kind === 'blackMerchant' ||
    kind === 'passerby' ||
    kind === 'pawn' ||
    kind === 'artisan' ||
    kind === 'bulkBuy'
  )
}

export function isMerchantSlot(enc: Encounter): enc is MerchantEncounter {
  return isMerchantKind(enc.kind)
}

export function isTradeSlot(enc: Encounter): enc is TradeEncounter {
  return isTradeKind(enc.kind)
}

const QUALITY_SPAWN_WEIGHTS: Readonly<Record<Exclude<EncounterQuality, 'gray'>, number>> = {
  green: QUALITY_TABLE.green.weight,
  blue: QUALITY_TABLE.blue.weight,
  purple: QUALITY_TABLE.purple.weight,
  orange: QUALITY_TABLE.orange.weight,
}

export function pickWeighted<T extends string>(weights: Readonly<Record<T, number>>, roll: number): T {
  const keys = Object.keys(weights) as T[]
  const total = keys.reduce((sum, key) => sum + Math.max(0, weights[key]), 0)
  const t = Number.isFinite(roll) ? Math.min(0.999999, Math.max(0, roll)) : 0
  const target = t * Math.max(0, total)
  let acc = 0
  for (const key of keys) {
    acc += Math.max(0, weights[key])
    if (target < acc) return key
  }
  return keys[keys.length - 1]
}

function rollRng(rng: { rngState: number }): number {
  return roll01(rng as Save)
}

export function pickEncounterKind(rng: { rngState: number }): EncounterKind {
  return pickWeighted(ENCOUNTER_KIND_WEIGHTS, rollRng(rng))
}

export function pickQuality(rng: { rngState: number }): EncounterQuality {
  return pickWeighted(QUALITY_SPAWN_WEIGHTS, rollRng(rng))
}

export function pickMerchantKind(rng: { rngState: number }): MerchantKind {
  return pickWeighted(MERCHANT_KIND_WEIGHTS, rollRng(rng))
}

export type EncounterSpawnOpts = {
  mainLootClaims?: number
  reservedChapterBoss?: boolean
  /** 有则推进这份 rng；无则用 seed+1 开一份局部骰。 */
  rng?: { rngState: number }
  mainChapter?: number
  /** 新档 / 空板：第 0 格固定铜矿当铺，其余格走 filler。探索刷新不走此开关。 */
  starterCopperPawn?: boolean
  /** 生成弱点初始暴露时读科技。 */
  save?: Save
}

function encounterRng(seed: number, rng?: { rngState: number }): { rngState: number } {
  if (rng) return rng
  const n = Number.isFinite(seed) ? Math.floor(seed) : 0
  return { rngState: normalizeRngState(n + 1) }
}

function makeEnemy(
  seed: number,
  slot: number,
  quality: EncounterQuality,
  forceChapterBoss = false,
  chapter = 1,
  rng?: { rngState: number },
  save?: Save,
): EnemyEncounter {
  const resolvedQuality = forceChapterBoss ? clampChapterBossQuality(quality) : quality
  const name = ENEMY_NAME_DEFS[(seed + slot) % ENEMY_NAME_DEFS.length]
  const q = qualityDef(resolvedQuality)
  const enemyRank = mainlineEnemyRank(resolvedQuality, forceChapterBoss)
  const itemId = rng
    ? pickMainNeedItem(rng, resolvedQuality, chapter, forceChapterBoss)
    : resolveMainNeedItem(
        MAIN_NEED_ITEM_POOL[(seed + slot) % MAIN_NEED_ITEM_POOL.length],
        resolvedQuality,
        chapter,
        forceChapterBoss,
        undefined,
        seed + slot,
      )
  return seedInitialRevealedWeaknesses({
    kind: 'enemy',
    id: `${name.id}-${resolvedQuality}-${seed}-${slot}`,
    label: forceChapterBoss ? `${name.label}·首领` : name.label,
    quality: resolvedQuality,
    needs: scaledMainNeed(itemId, resolvedQuality, chapter, forceChapterBoss),
    lootGold: scaleGold(enemyLootGoldFor(forceChapterBoss), q.outputMul),
    departed: false,
    combat: null,
    lootClaimed: false,
    enemyRank,
    chapterBoss: forceChapterBoss,
    weaknesses: pickEnemyWeaknesses(seed, slot, enemyRank),
    revealedWeaknesses: [],
  }, save)
}

function makeBlackMerchant(
  seed: number,
  slot: number,
  quality: EncounterQuality,
  chapter = 1,
): BlackMerchantEncounter {
  void chapter
  const def = BLACK_MERCHANT_DEFS[(seed + slot) % BLACK_MERCHANT_DEFS.length]
  const q = qualityDef(quality)
  return {
    kind: 'blackMerchant',
    id: `${def.id}-${quality}-${seed}-${slot}`,
    label: def.label,
    quality,
    buyGold: scaleGold(def.buyGold, q.demandMul),
    buyOffers: singleOutputMap(def.buyOffers, q.outputMul),
    completed: false,
  }
}

function makePasserby(
  seed: number,
  slot: number,
  quality: EncounterQuality,
  chapter = 1,
  rng?: { rngState: number },
): PasserbyEncounter {
  const def = PASSERBY_DEFS[(seed + slot) % PASSERBY_DEFS.length]
  const q = qualityDef(quality)
  const wantItem = resolveMainNeedItem(firstNeedItem(def.wants), quality, chapter, false, rng, seed + slot)
  return {
    kind: 'passerby',
    id: `${def.id}-${quality}-${seed}-${slot}`,
    label: def.label,
    quality,
    wants: scaledMainNeed(wantItem, quality, chapter),
    offers: singleOutputMap(def.offers, q.outputMul),
    completed: false,
  }
}

function makePawn(
  seed: number,
  slot: number,
  quality: EncounterQuality,
  chapter = 1,
  rng?: { rngState: number },
): PawnEncounter {
  const def = PAWN_DEFS[(seed + slot) % PAWN_DEFS.length]
  const q = qualityDef(quality)
  const wantItem = resolveMainNeedItem(firstNeedItem(def.pawnWants), quality, chapter, false, rng, seed + slot)
  const pawnWants = scaledMainNeed(wantItem, quality, chapter)
  return {
    kind: 'pawn',
    id: `${def.id}-${quality}-${seed}-${slot}`,
    label: def.label,
    quality,
    pawnWants,
    rewardGold: scaleGold(pawnGoldForMap(pawnWants), q.outputMul / q.demandMul),
    completed: false,
  }
}

/** 铜矿在 ITEM_DEF 的 id。新档当铺消耗用这个。 */
export const STARTER_PAWN_ITEM_ID: ItemId = 'ore'
export const STARTER_PAWN_QTY = 2
export const STARTER_PAWN_LABEL = '铜矿当'
export const STARTER_PAWN_QUALITY: EncounterQuality = 'green'

export function isStarterCopperPawn(enc: Encounter): enc is PawnEncounter {
  return (
    enc.kind === 'pawn' &&
    (enc.id.startsWith('merchantPawnCopper-') ||
      (enc.label === STARTER_PAWN_LABEL && (enc.pawnWants.ore ?? 0) >= STARTER_PAWN_QTY))
  )
}

/** 新档 / 空板第 0 格：绿档当铺，消耗铜矿 ×2，奖励按 pawnUnitGold / rewardGold。 */
export function makeStarterCopperPawn(seed = 0, slot = 0): PawnEncounter {
  const quality = STARTER_PAWN_QUALITY
  const q = qualityDef(quality)
  const pawnWants: EncounterNeedMap = { [STARTER_PAWN_ITEM_ID]: STARTER_PAWN_QTY }
  return {
    kind: 'pawn',
    id: `merchantPawnCopper-${quality}-${seed}-${slot}`,
    label: STARTER_PAWN_LABEL,
    quality,
    pawnWants,
    rewardGold: scaleGold(pawnGoldForMap(pawnWants), q.outputMul / q.demandMul),
    completed: false,
  }
}

function makeArtisan(
  seed: number,
  slot: number,
  quality: EncounterQuality,
  chapter = 1,
  rng?: { rngState: number },
): ArtisanEncounter {
  const def = ARTISAN_DEFS[(seed + slot) % ARTISAN_DEFS.length]
  const q = qualityDef(quality)
  const wantItem = resolveMainNeedItem(firstNeedItem(def.wants), quality, chapter, false, rng, seed + slot)
  return {
    kind: 'artisan',
    id: `${def.id}-${quality}-${seed}-${slot}`,
    label: def.label,
    quality,
    wants: scaledMainNeed(wantItem, quality, chapter),
    rewardGold: 0,
    buffMul: 1 + (def.buffMul - 1) * q.outputMul,
    buffDurationS: scaleQty(def.buffDurationS, q.outputMul),
    completed: false,
  }
}

function makeBulkBuy(
  seed: number,
  slot: number,
  quality: EncounterQuality,
  chapter = 1,
  rng?: { rngState: number },
): BulkBuyEncounter {
  const def = BULK_BUY_DEFS[(seed + slot) % BULK_BUY_DEFS.length]
  const q = qualityDef(quality)
  const wantItem = resolveMainNeedItem(firstNeedItem(def.wants), quality, chapter, false, rng, seed + slot)
  const wants = scaledMainNeed(wantItem, quality, chapter)
  return {
    kind: 'bulkBuy',
    id: `${def.id}-${quality}-${seed}-${slot}`,
    label: def.label,
    quality,
    wants,
    rewardGold: scaleGold(bulkGoldForMap(wants), q.outputMul / q.demandMul),
    completed: false,
  }
}

function makeEncounter(
  seed: number,
  slot: number,
  quality: EncounterQuality,
  kind: EncounterKind,
  forceChapterBoss = false,
  chapter = 1,
  rng?: { rngState: number },
  save?: Save,
): Encounter {
  if (kind === 'enemy') return makeEnemy(seed, slot, quality, forceChapterBoss, chapter, rng, save)
  if (kind === 'blackMerchant') return makeBlackMerchant(seed, slot, quality, chapter)
  if (kind === 'passerby') return makePasserby(seed, slot, quality, chapter, rng)
  if (kind === 'pawn') return makePawn(seed, slot, quality, chapter, rng)
  if (kind === 'artisan') return makeArtisan(seed, slot, quality, chapter, rng)
  return makeBulkBuy(seed, slot, quality, chapter, rng)
}

export function encounterFiller(seed: number, opts: EncounterSpawnOpts = {}): (slot: number) => Encounter {
  const safe = Number.isFinite(seed) && seed >= 0 ? Math.floor(seed) : 0
  const claims = normalizeMainLootClaims(opts.mainLootClaims)
  const rng = encounterRng(safe, opts.rng)
  const chapter = normalizeMainChapter(opts.mainChapter)
  let reserved = opts.reservedChapterBoss === true
  return (slot: number) => {
    const quality = pickQuality(rng)
    const forceBoss = !reserved && claims >= MAIN_LOOT_CLAIMS_GOAL
    const kind = forceBoss ? 'enemy' : pickEncounterKind(rng)
    if (forceBoss) reserved = true
    return makeEncounter(safe, slot, quality, kind, forceBoss, chapter, rng, opts.save)
  }
}

export function generateEncounterBoard(
  seed: number,
  slotCount = ENCOUNTER_SLOT_MAX,
  opts: EncounterSpawnOpts = {},
): Encounter[] {
  const raw = Number.isFinite(slotCount) ? Math.floor(slotCount) : ENCOUNTER_SLOT_MIN
  const n = Math.min(ENCOUNTER_SLOT_MAX, Math.max(1, raw))
  const fill = encounterFiller(seed, opts)
  const board = Array.from({ length: n }, (_, slot) => fill(slot))
  if (opts.starterCopperPawn && n >= 1) {
    const safe = Number.isFinite(seed) && seed >= 0 ? Math.floor(seed) : 0
    board[0] = makeStarterCopperPawn(safe, 0)
  }
  return board
}

function spawnOptsFor(save: Save, reserved: readonly Encounter[]): EncounterSpawnOpts {
  return {
    mainLootClaims: normalizeMainLootClaims(save.mainLootClaims),
    reservedChapterBoss: hasLiveChapterBoss(reserved),
    rng: save,
    mainChapter: normalizeMainChapter(save.mainChapter),
    save,
  }
}

function isNeedMap(value: unknown): value is EncounterNeedMap {
  return !!value && typeof value === 'object'
}

function readQuality(value: unknown): EncounterQuality {
  return isEncounterQuality(value) ? value : 'green'
}

function isEnemyEncounter(value: unknown): value is EnemyEncounter {
  if (!value || typeof value !== 'object') return false
  const enc = value as EnemyEncounter
  return (
    enc.kind === 'enemy' &&
    typeof enc.id === 'string' &&
    typeof enc.label === 'string' &&
    isEncounterQuality(enc.quality) &&
    isNeedMap(enc.needs) &&
    typeof enc.lootGold === 'number' &&
    (enc.submitted === undefined || typeof enc.submitted === 'boolean') &&
    typeof enc.departed === 'boolean' &&
    (enc.combat === null || isEnemyCombat(enc.combat)) &&
    typeof enc.lootClaimed === 'boolean'
  )
}

function isBlackMerchantEncounter(value: unknown): value is BlackMerchantEncounter {
  if (!value || typeof value !== 'object') return false
  const enc = value as BlackMerchantEncounter
  return (
    enc.kind === 'blackMerchant' &&
    typeof enc.id === 'string' &&
    typeof enc.label === 'string' &&
    isEncounterQuality(enc.quality) &&
    typeof enc.buyGold === 'number' &&
    isNeedMap(enc.buyOffers) &&
    typeof enc.completed === 'boolean'
  )
}

function isPasserbyEncounter(value: unknown): value is PasserbyEncounter {
  if (!value || typeof value !== 'object') return false
  const enc = value as PasserbyEncounter
  return (
    enc.kind === 'passerby' &&
    typeof enc.id === 'string' &&
    typeof enc.label === 'string' &&
    isEncounterQuality(enc.quality) &&
    isNeedMap(enc.wants) &&
    isNeedMap(enc.offers) &&
    typeof enc.completed === 'boolean'
  )
}

function isPawnEncounter(value: unknown): value is PawnEncounter {
  if (!value || typeof value !== 'object') return false
  const enc = value as PawnEncounter
  return (
    enc.kind === 'pawn' &&
    typeof enc.id === 'string' &&
    typeof enc.label === 'string' &&
    isEncounterQuality(enc.quality) &&
    isNeedMap(enc.pawnWants) &&
    typeof enc.completed === 'boolean'
  )
}

function isArtisanEncounter(value: unknown): value is ArtisanEncounter {
  if (!value || typeof value !== 'object') return false
  const enc = value as ArtisanEncounter
  return (
    enc.kind === 'artisan' &&
    typeof enc.id === 'string' &&
    typeof enc.label === 'string' &&
    isEncounterQuality(enc.quality) &&
    isNeedMap(enc.wants) &&
    typeof enc.rewardGold === 'number' &&
    typeof enc.buffMul === 'number' &&
    typeof enc.buffDurationS === 'number' &&
    typeof enc.completed === 'boolean'
  )
}

function isBulkBuyEncounter(value: unknown): value is BulkBuyEncounter {
  if (!value || typeof value !== 'object') return false
  const enc = value as BulkBuyEncounter
  return (
    enc.kind === 'bulkBuy' &&
    typeof enc.id === 'string' &&
    typeof enc.label === 'string' &&
    isEncounterQuality(enc.quality) &&
    isNeedMap(enc.wants) &&
    typeof enc.rewardGold === 'number' &&
    typeof enc.completed === 'boolean'
  )
}

export function isMerchantEncounter(value: unknown): value is MerchantEncounter {
  return isBlackMerchantEncounter(value) || isPasserbyEncounter(value) || isPawnEncounter(value)
}

export function isEncounter(value: unknown): value is Encounter {
  return (
    isEnemyEncounter(value) ||
    isMerchantEncounter(value) ||
    isArtisanEncounter(value) ||
    isBulkBuyEncounter(value)
  )
}

export function isValidEncounterBoard(value: unknown, slotCount?: number): value is Encounter[] {
  if (!Array.isArray(value) || !value.every(isEncounter)) return false
  if (slotCount == null) {
    return value.length >= ENCOUNTER_SLOT_MIN && value.length <= ENCOUNTER_SLOT_MAX
  }
  return value.length === slotCount
}

function slotAt(save: Save, index: number): Encounter | undefined {
  if (!Number.isInteger(index) || index < 0 || index >= save.encounters.length) return undefined
  return save.encounters[index]
}

function keptEncounters(encounters: readonly Encounter[], now: number): Encounter[] {
  return encounters.filter((enc) => shouldKeepOnExplore(enc, now))
}

function boardSizeFor(save: Save, now = Date.now()): number {
  const current = Array.isArray(save.encounters) ? save.encounters.filter(isEncounter) : []
  return Math.min(ENCOUNTER_SLOT_MAX, Math.max(encounterSlotCount(save), keptEncounters(current, now).length))
}

function placeKeptThenFill(
  size: number,
  previous: readonly Encounter[],
  kept: readonly Encounter[],
  fill: (index: number) => Encounter,
  reuseIdle: boolean,
): Encounter[] {
  const out: Array<Encounter | undefined> = Array.from({ length: size })
  const used = new Set<Encounter>()
  for (let i = 0; i < previous.length && i < size; i++) {
    const enc = previous[i]
    if (shouldKeepOnExplore(enc)) {
      out[i] = enc
      used.add(enc)
    }
  }
  let cursor = 0
  const place = (enc: Encounter) => {
    while (cursor < size && out[cursor]) cursor += 1
    if (cursor < size) {
      out[cursor] = enc
      used.add(enc)
    }
  }
  for (const enc of kept) {
    if (!used.has(enc)) place(enc)
  }
  if (reuseIdle) {
    for (const enc of previous) {
      if (used.has(enc) || shouldKeepOnExplore(enc)) continue
      place(enc)
    }
  }
  const seedFill = fill
  return Array.from({ length: size }, (_, i) => out[i] ?? seedFill(i))
}

/** 按当前格数补齐或收板；战斗中 / 胜可领 / 败可再战优先保留，可暂超目标格数、仍封顶 6。 */
export function resizeEncounterBoard(save: Save, now = Date.now()): Encounter[] {
  const previous = Array.isArray(save.encounters) ? save.encounters.filter(isEncounter) : []
  const size = boardSizeFor(save, now)
  const seed = Number.isFinite(save.exploreCount) && save.exploreCount > 0 ? Math.floor(save.exploreCount) : 0
  const kept = keptEncounters(previous, now)
  const fill = encounterFiller(seed, spawnOptsFor(save, previous))
  save.encounters = placeKeptThenFill(size, previous, kept, fill, true)
  return save.encounters
}

function canRecycleForChapterBoss(enc: Encounter): boolean {
  return isEncounterDone(enc)
}

/**
 * 战利品已满 10 且板上没有未领本章 Boss 时，尽快落下 Boss：
 * 先补空位；没空则回收已领敌人格 / 已完成交易格。
 * 不改战斗中 / 胜可领 / 败可再战，也不把未完成交易单直接改成 Boss。
 */
export function ensureChapterBossSpawn(save: Save, now = Date.now()): void {
  if (Array.isArray(save.encounters)) {
    for (const enc of save.encounters) ensureChapterBossQuality(enc)
  }
  if (!shouldForceChapterBoss(save, save.encounters)) return
  const current = Array.isArray(save.encounters) ? save.encounters.filter(isEncounter) : []
  const size = boardSizeFor(save, now)
  if (current.length < size) {
    resizeEncounterBoard(save, now)
    if (!shouldForceChapterBoss(save, save.encounters)) return
  }
  const idx = save.encounters.findIndex(canRecycleForChapterBoss)
  if (idx < 0) return
  const reserved = save.encounters.filter((_, i) => i !== idx)
  const seed = Number.isFinite(save.exploreCount) && save.exploreCount > 0 ? Math.floor(save.exploreCount) : 0
  const fill = encounterFiller(seed, spawnOptsFor(save, reserved))
  save.encounters[idx] = fill(idx)
}

function missingLabels(save: Save, map: EncounterNeedMap): string[] {
  return needLines(save, map)
    .filter((line) => line.missing > 0)
    .map((line) => `${line.label}差 ${line.missing}`)
}

function addNeedMap(save: Save, map: EncounterNeedMap): ActionResult {
  for (const [itemId, qty] of needEntries(map)) {
    const added = addToBank(save, itemId, qty)
    if (!added.ok) return added
  }
  return { ok: true }
}

export function enemyAt(save: Save, index: number): EnemyEncounter | undefined {
  const enc = slotAt(save, index)
  return enc?.kind === 'enemy' ? enc : undefined
}

export function merchantAt(save: Save, index: number): MerchantEncounter | undefined {
  const enc = slotAt(save, index)
  return enc && isMerchantSlot(enc) ? enc : undefined
}

export function blackMerchantAt(save: Save, index: number): BlackMerchantEncounter | undefined {
  const enc = slotAt(save, index)
  return enc?.kind === 'blackMerchant' ? enc : undefined
}

export function shadyAt(save: Save, index: number): BlackMerchantEncounter | undefined {
  return blackMerchantAt(save, index)
}

export function passerbyAt(save: Save, index: number): PasserbyEncounter | undefined {
  const enc = slotAt(save, index)
  return enc?.kind === 'passerby' ? enc : undefined
}

export function pawnAt(save: Save, index: number): PawnEncounter | undefined {
  const enc = slotAt(save, index)
  return enc?.kind === 'pawn' ? enc : undefined
}

export function pawnshopAt(save: Save, index: number): PawnEncounter | undefined {
  return pawnAt(save, index)
}

export function artisanAt(save: Save, index: number): ArtisanEncounter | undefined {
  const enc = slotAt(save, index)
  return enc?.kind === 'artisan' ? enc : undefined
}

export function bulkBuyAt(save: Save, index: number): BulkBuyEncounter | undefined {
  const enc = slotAt(save, index)
  return enc?.kind === 'bulkBuy' ? enc : undefined
}

function enemyStatusReason(enc: EnemyEncounter): string | null {
  const status = combatStatus(enc)
  if (status === 'claimed') return '战利品已领取'
  if (status === 'fighting') return '战斗中'
  if (status === 'win') return '先领取战利品'
  return null
}

function suppliesAlreadyTaken(enc: EnemyEncounter): boolean {
  return enc.submitted === true && !enc.combat
}

export function combatSupplyBlockReason(save: Save, index: number): string | null {
  const enc = enemyAt(save, index)
  if (!enc) return '不是敌人偶遇'
  const status = enemyStatusReason(enc)
  if (status) return status
  if (suppliesAlreadyTaken(enc)) return null
  const missing = missingLabels(save, combatSupplyNeeds(save, enc))
  if (missing.length) return `货不够：${missing.join('、')}`
  return null
}

/** 开战：货不够则失败；货够（或旧档已扣过补给且尚未开过）则扣货并进入战斗。 */
export function startCombatBlockReason(
  save: Save,
  index: number,
  workerIds: readonly string[],
  guests: readonly Worker[] = [],
): string | null {
  const supply = combatSupplyBlockReason(save, index)
  if (supply) return supply
  return combatPartyBlockReason(save, workerIds, guests)
}

export function departBlockReason(
  save: Save,
  index: number,
  workerIds: readonly string[] = [],
  guests: readonly Worker[] = [],
): string | null {
  return startCombatBlockReason(save, index, workerIds, guests)
}

export function canStartCombat(
  save: Save,
  index: number,
  workerIds: readonly string[] = [],
  guests: readonly Worker[] = [],
): boolean {
  return startCombatBlockReason(save, index, workerIds, guests) === null
}

export function canDepartEncounter(
  save: Save,
  index: number,
  workerIds: readonly string[] = [],
  guests: readonly Worker[] = [],
): boolean {
  return canStartCombat(save, index, workerIds, guests)
}

/** 扣光补给、选人开战。不发金币。出战工人保持休息（assignment 仍为 null）。 */
export function startCombat(
  save: Save,
  index: number,
  workerIds: readonly string[],
  now = Date.now(),
  onLog?: CombatLogSink,
  guests: readonly Worker[] = [],
): ActionResult {
  const blocked = startCombatBlockReason(save, index, workerIds, guests)
  if (blocked) return { ok: false, reason: blocked }
  const enc = enemyAt(save, index)
  if (!enc) return { ok: false, reason: '不是敌人偶遇' }
  const party = workerIds
    .map((id) => findCombatPartyWorker(save, id, guests))
    .filter((w): w is Worker => !!w)
  if (!party.length) return { ok: false, reason: '请选择出战工人' }
  if (!suppliesAlreadyTaken(enc)) {
    const took = takeCosts(save, needMapToRules(combatSupplyNeeds(save, enc)))
    if (!took.ok) return took
  }
  save.departCount += 1
  save.lastDepartAt = now
  delete enc.submitted
  beginEnemyCombat(enc, party, now, normalizeMainChapter(save.mainChapter), onLog, save)
  return { ok: true }
}

/** @deprecated 改走 startCombat。无工人时只报「请选择出战工人」。 */
export function departEncounter(save: Save, index: number, now = Date.now()): ActionResult {
  const idle = selectableCombatWorkers(save).slice(0, 2).map((w) => w.id)
  if (!idle.length) return { ok: false, reason: startCombatBlockReason(save, index, []) ?? '请选择出战工人' }
  return startCombat(save, index, idle, now)
}

export function claimLootBlockReason(save: Save, index: number, now = Date.now()): string | null {
  const enc = enemyAt(save, index)
  if (!enc) return '不是敌人偶遇'
  void now
  if (enc.lootClaimed) return '战利品已领取'
  if (isFighting(enc)) return '战斗尚未结束'
  if (!isCombatWon(enc)) return '战胜后才能领战利品'
  return null
}

export function canClaimLoot(save: Save, index: number, now = Date.now()): boolean {
  return claimLootBlockReason(save, index, now) === null
}

/** 领本章 Boss 战后进下一章：计数清零，场上其它订单保持不动。 */
export function advanceMainChapter(save: Save, _now = Date.now()): void {
  save.mainChapter = normalizeMainChapter(save.mainChapter) + 1
  save.mainLootClaims = 0
}

function grantCombatLootXp(save: Save, enc: EnemyEncounter): boolean {
  const combat = enc.combat
  if (!combat) return false
  const chapter = normalizeMainChapter(save.mainChapter)
  const amount = workerLootXp(enc.enemyRank, chapter)
  let granted = false
  for (const id of combat.workerIds) {
    const worker = findCombatPartyWorker(save, id)
    if (!worker) continue
    grantWorkerCombatXp(worker, amount)
    granted = true
  }
  return granted
}

function lootClaimMessage(lootGold: number, grantedXp: boolean, chapterNote?: string): string {
  const xpNote = grantedXp ? '。工人获得经验' : ''
  const tail = chapterNote ? `。${chapterNote}` : ''
  return `战利品：金币 +${lootGold}${xpNote}${tail}`
}

/** 战胜后领金币。败不发金。不加物资。成功领取计入本章战利品；Boss 领取后进下一章。 */
export function claimLoot(save: Save, index: number, now = Date.now()): ActionResult {
  const blocked = claimLootBlockReason(save, index, now)
  if (blocked) return { ok: false, reason: blocked }
  const enc = enemyAt(save, index)
  if (!enc || enc.kind !== 'enemy') return { ok: false, reason: '不是敌人偶遇' }
  const lootGold = enemyLootPayout(enc, save)
  const grantedXp = grantCombatLootXp(save, enc)
  enc.lootClaimed = true
  save.starterCopperPawnDone = true
  save.gold += lootGold
  save.mainLootClaims = normalizeMainLootClaims(save.mainLootClaims) + 1
  if (isChapterBoss(enc)) {
    advanceMainChapter(save, now)
    return { ok: true, message: lootClaimMessage(lootGold, grantedXp, `进入第 ${save.mainChapter} 章`) }
  }
  ensureChapterBossSpawn(save, now)
  return { ok: true, message: lootClaimMessage(lootGold, grantedXp) }
}

export function barterBlockReason(save: Save, index: number): string | null {
  const enc = slotAt(save, index)
  if (!enc) return '不是路人偶遇'
  if (enc.kind === 'blackMerchant') return '黑心商人不能以物易物'
  if (enc.kind === 'pawn') return '当铺不能以物易物'
  if (enc.kind === 'artisan') return '工匠委托不能以物易物'
  if (enc.kind === 'bulkBuy') return '收购不能以物易物'
  if (enc.kind !== 'passerby') return '不是路人偶遇'
  if (enc.completed) return '这笔买卖已完成'
  if (!canAffordCosts(save, needMapToRules(enc.wants))) {
    return `货不够：${missingCostLabels(save, needMapToRules(enc.wants)).join('、')}`
  }
  return null
}

export function buyMerchantBlockReason(save: Save, index: number): string | null {
  const enc = slotAt(save, index)
  if (!enc) return '不是黑心商人偶遇'
  if (enc.kind === 'passerby') return '路人不能购买'
  if (enc.kind === 'pawn') return '当铺不能购买'
  if (enc.kind === 'artisan') return '工匠委托不能购买'
  if (enc.kind === 'bulkBuy') return '收购不能购买'
  if (enc.kind !== 'blackMerchant') return '不是黑心商人偶遇'
  if (enc.completed) return '这笔买卖已完成'
  if (save.gold < enc.buyGold) return `金币不够：购买要 ${enc.buyGold}`
  return null
}

export function pawnBlockReason(save: Save, index: number): string | null {
  const enc = slotAt(save, index)
  if (!enc) return '不是当铺偶遇'
  if (enc.kind === 'blackMerchant') return '黑心商人不能典当'
  if (enc.kind === 'passerby') return '路人不能典当'
  if (enc.kind === 'artisan') return '工匠委托不能典当'
  if (enc.kind === 'bulkBuy') return '收购不能典当'
  if (enc.kind !== 'pawn') return '不是当铺偶遇'
  if (enc.completed) return '这笔买卖已完成'
  if (!needEntries(enc.pawnWants).length) return '没有可典当物品'
  if (!canAffordCosts(save, needMapToRules(enc.pawnWants))) {
    return `货不够：${missingCostLabels(save, needMapToRules(enc.pawnWants)).join('、')}`
  }
  return null
}

export function artisanBlockReason(save: Save, index: number): string | null {
  const enc = slotAt(save, index)
  if (!enc || enc.kind !== 'artisan') return '不是工匠委托'
  if (enc.completed) return '这笔委托已完成'
  if (!needEntries(enc.wants).length) return '没有要交的成品'
  if (!canAffordCosts(save, needMapToRules(enc.wants))) {
    return `成品不够：${missingCostLabels(save, needMapToRules(enc.wants)).join('、')}`
  }
  return null
}

export function bulkBuyBlockReason(save: Save, index: number): string | null {
  const enc = slotAt(save, index)
  if (!enc || enc.kind !== 'bulkBuy') return '不是收购订单'
  if (enc.completed) return '这笔收购已完成'
  if (!needEntries(enc.wants).length) return '没有要收的成品'
  if (!canAffordCosts(save, needMapToRules(enc.wants))) {
    return `成品不够：${missingCostLabels(save, needMapToRules(enc.wants)).join('、')}`
  }
  return null
}

export function canBarter(save: Save, index: number): boolean {
  return barterBlockReason(save, index) === null
}

export function canBuyMerchant(save: Save, index: number): boolean {
  return buyMerchantBlockReason(save, index) === null
}

export function canPawn(save: Save, index: number): boolean {
  return pawnBlockReason(save, index) === null
}

export function canSubmitArtisan(save: Save, index: number): boolean {
  return artisanBlockReason(save, index) === null
}

export function canBulkBuy(save: Save, index: number): boolean {
  return bulkBuyBlockReason(save, index) === null
}

export function barterMerchant(save: Save, index: number): ActionResult {
  const blocked = barterBlockReason(save, index)
  if (blocked) return { ok: false, reason: blocked }
  const enc = passerbyAt(save, index)
  if (!enc) return { ok: false, reason: '不是路人偶遇' }
  const took = takeCosts(save, needMapToRules(enc.wants))
  if (!took.ok) return took
  const added = addNeedMap(save, enc.offers)
  if (!added.ok) return added
  enc.completed = true
  save.starterCopperPawnDone = true
  return { ok: true, message: '以物易物成交' }
}

export function buyMerchant(save: Save, index: number): ActionResult {
  const blocked = buyMerchantBlockReason(save, index)
  if (blocked) return { ok: false, reason: blocked }
  const enc = blackMerchantAt(save, index)
  if (!enc) return { ok: false, reason: '不是黑心商人偶遇' }
  save.gold -= enc.buyGold
  const added = addNeedMap(save, enc.buyOffers)
  if (!added.ok) return added
  enc.completed = true
  save.starterCopperPawnDone = true
  return { ok: true, message: '金币购买成交' }
}

export function pawnMerchant(save: Save, index: number): ActionResult {
  const blocked = pawnBlockReason(save, index)
  if (blocked) return { ok: false, reason: blocked }
  const enc = pawnAt(save, index)
  if (!enc) return { ok: false, reason: '不是当铺偶遇' }
  const gold = pawnRewardGold(enc, save)
  const took = takeCosts(save, needMapToRules(enc.pawnWants))
  if (!took.ok) return took
  save.gold += gold
  enc.completed = true
  save.starterCopperPawnDone = true
  return { ok: true, message: `以物换钱成交。金币 +${gold}` }
}

export function applyWorkshopBuff(save: Save, mul: number, durationS: number, now = Date.now()): WorkshopBuff {
  const endsAt = now + Math.max(1, durationS) * 1000
  const next: WorkshopBuff = { mul, endsAt }
  save.workshopBuff = next
  return next
}

export function workshopBuffRemainS(save: Save, now = Date.now()): number {
  const buff = save.workshopBuff
  if (!buff) return 0
  return Math.max(0, Math.ceil((buff.endsAt - now) / 1000))
}

export function isWorkshopBuffActive(save: Save, now = Date.now()): boolean {
  return workshopBuffRemainS(save, now) > 0
}

export function workshopBuffMul(save: Save, now = Date.now()): number {
  const buff = save.workshopBuff
  if (!buff || now >= buff.endsAt || !Number.isFinite(buff.mul) || buff.mul <= 0) return 1
  return buff.mul
}

export function submitArtisan(save: Save, index: number, now = Date.now()): ActionResult {
  const blocked = artisanBlockReason(save, index)
  if (blocked) return { ok: false, reason: blocked }
  const enc = artisanAt(save, index)
  if (!enc) return { ok: false, reason: '不是工匠委托' }
  const took = takeCosts(save, needMapToRules(enc.wants))
  if (!took.ok) return took
  applyWorkshopBuff(save, enc.buffMul, enc.buffDurationS, now)
  enc.completed = true
  save.starterCopperPawnDone = true
  const pct = Math.round((enc.buffMul - 1) * 100)
  return {
    ok: true,
    message: `委托完成。工坊产量 +${pct}% · ${formatMarchClock(enc.buffDurationS)}`,
  }
}

export function sellBulk(save: Save, index: number): ActionResult {
  const blocked = bulkBuyBlockReason(save, index)
  if (blocked) return { ok: false, reason: blocked }
  const enc = bulkBuyAt(save, index)
  if (!enc) return { ok: false, reason: '不是收购订单' }
  const took = takeCosts(save, needMapToRules(enc.wants))
  if (!took.ok) return took
  const gold = bulkRewardGold(enc, save)
  save.gold += gold
  enc.completed = true
  save.starterCopperPawnDone = true
  return { ok: true, message: `收购成交。金币 +${gold}` }
}

/** 战斗中 / 胜可领 / 败可再战，以及未领的本章 Boss（含待战）占位保留；普通未开打 / 已领奖 / 其它格可换。 */
export function shouldKeepOnExplore(enc: Encounter, now = Date.now()): boolean {
  if (enc.kind !== 'enemy') return false
  void now
  if (isChapterBoss(enc) && !enc.lootClaimed) return true
  return isFighting(enc) || isCombatWon(enc) || combatStatus(enc) === 'lose'
}

/** 探索：扣金币，只替换可刷新格，保留格占位，板子按当前格数（战斗 / 未领本章 Boss 保留可暂超目标）。 */
export function exploreBoard(save: Save, now = Date.now()): ActionResult {
  const blocked = exploreBlockReason(save)
  if (blocked) return { ok: false, reason: blocked }
  const cost = exploreCost(save)
  const previous = save.encounters.filter(isEncounter)
  const kept = keptEncounters(previous, now)
  save.gold -= cost
  save.exploreCount += 1
  const size = Math.min(ENCOUNTER_SLOT_MAX, Math.max(encounterSlotCount(save), kept.length))
  const fill = encounterFiller(save.exploreCount, spawnOptsFor(save, previous))
  save.encounters = placeKeptThenFill(size, previous, kept, fill, false)
  return { ok: true, message: `探索完成。花费 ${cost} 金币` }
}

function findLegacyOrder(id: string | undefined, index: number) {
  const fromId = id ? LEGACY_ORDER_DEFS.find((o) => o.id === id) : undefined
  if (fromId) return fromId
  const safe = Number.isFinite(index) && index >= 0 ? Math.floor(index) : 0
  return LEGACY_ORDER_DEFS[safe % LEGACY_ORDER_DEFS.length]
}

function migrateLegacyOrder(save: LegacyOrderSave): void {
  const hasLegacy =
    typeof save.currentOrderId === 'string' ||
    (typeof save.orderIndex === 'number' && Number.isFinite(save.orderIndex))
  if (!hasLegacy) return
  const old = findLegacyOrder(save.currentOrderId, save.orderIndex ?? 0)
  save.encounters[0] = ensureEnemyIntel({
    kind: 'enemy',
    id: old.id,
    label: old.label,
    quality: 'green',
    needs: { ...old.needs },
    lootGold: old.lootGold,
    departed: false,
    combat: null,
    lootClaimed: false,
    enemyRank: 'minion',
    chapterBoss: false,
    weaknesses: [],
    revealedWeaknesses: [],
    ...(save.orderSubmitted === true ? { submitted: true } : {}),
  })
}

function inferMerchantKind(raw: LegacyMerchant): MerchantKind {
  const hasBarter = isNeedMap(raw.wants) && needEntries(raw.wants).length > 0 && isNeedMap(raw.offers)
  const hasBuy = typeof raw.buyGold === 'number' && raw.buyGold > 0 && isNeedMap(raw.buyOffers)
  if (hasBarter) return 'passerby'
  if (hasBuy) return 'blackMerchant'
  return 'passerby'
}

function migrateLegacyMerchant(raw: LegacyMerchant): MerchantEncounter {
  const kind = inferMerchantKind(raw)
  const completed = raw.completed === true
  const label = typeof raw.label === 'string' ? raw.label : MERCHANT_KIND_LABEL[kind]
  const quality = readQuality((raw as { quality?: unknown }).quality)
  if (kind === 'blackMerchant') {
    return {
      kind: 'blackMerchant',
      id: raw.id.startsWith('merchantBuy') ? raw.id : `merchantBuy-${raw.id}`,
      label,
      quality,
      buyGold: typeof raw.buyGold === 'number' ? raw.buyGold : 8,
      buyOffers: isNeedMap(raw.buyOffers) ? { ...raw.buyOffers } : { meal: 1 },
      completed,
    }
  }
  if (kind === 'pawn') {
    const pawnWants = isNeedMap(raw.wants) && needEntries(raw.wants).length ? { ...raw.wants } : { wood: 2 }
    return {
      kind: 'pawn',
      id: raw.id.startsWith('merchantPawn') ? raw.id : `merchantPawn-${raw.id}`,
      label,
      quality,
      pawnWants,
      rewardGold: pawnGoldForMap(pawnWants),
      completed,
    }
  }
  return {
    kind: 'passerby',
    id: raw.id.startsWith('merchantBarter') ? raw.id : `merchantBarter-${raw.id}`,
    label,
    quality,
    wants: isNeedMap(raw.wants) ? { ...raw.wants } : {},
    offers: isNeedMap(raw.offers) ? { ...raw.offers } : {},
    completed,
  }
}

function migrateEnemy(raw: LegacyEnemy): EnemyEncounter {
  // 旧档远近 / 强弱只读一遍：有 loot/needs 则原样留下，缺字段按品质表补。随后不再写入。
  void raw.distance
  void raw.power
  const chapterBoss = raw.chapterBoss === true
  const quality = chapterBoss ? clampChapterBossQuality(readQuality(raw.quality)) : readQuality(raw.quality)
  const lootGold =
    typeof raw.lootGold === 'number'
      ? raw.lootGold
      : typeof raw.departGold === 'number'
        ? raw.departGold
        : scaleGold(enemyLootGoldFor(chapterBoss), qualityDef(quality).outputMul)
  const needs =
    isNeedMap(raw.needs) && needEntries(raw.needs).length
      ? { ...raw.needs }
      : scaledMainNeed('meal', quality, MAIN_CHAPTER_START, chapterBoss)
  const departed = raw.departed === true
  const hasMarch = typeof raw.marchEndsAt === 'number'
  const existingCombat = isEnemyCombat(raw.combat) ? raw.combat : null
  // 旧存档出发当时已发补给金：视为已领取，避免再发。
  const lootClaimed = raw.lootClaimed === true || (departed && !hasMarch && !existingCombat)
  const enemyRank = isEnemyRank(raw.enemyRank) ? raw.enemyRank : mainlineEnemyRank(quality, chapterBoss)
  let combat = existingCombat
  if (lootClaimed) {
    combat = existingCombat && existingCombat.outcome === 'win' ? existingCombat : null
  } else if (!combat && departed && hasMarch) {
    combat = legacyMarchAsWin(
      {
        kind: 'enemy',
        id: raw.id,
        label: raw.label,
        quality,
        needs,
        lootGold,
        departed: true,
        combat: null,
        lootClaimed: false,
        enemyRank,
        chapterBoss,
        weaknesses: [],
        revealedWeaknesses: [],
      },
      typeof raw.marchEndsAt === 'number' ? raw.marchEndsAt : 0,
    )
  }
  return ensureEnemyIntel({
    kind: 'enemy',
    id: raw.id,
    label: raw.label,
    quality,
    needs,
    lootGold,
    departed,
    combat,
    lootClaimed,
    enemyRank,
    chapterBoss,
    weaknesses: Array.isArray(raw.weaknesses)
      ? (raw.weaknesses as EnemyEncounter['weaknesses'])
      : [],
    revealedWeaknesses: Array.isArray(raw.revealedWeaknesses)
      ? (raw.revealedWeaknesses as EnemyEncounter['revealedWeaknesses'])
      : [],
    ...(isEnemyTargetRuleId(raw.targetRuleId) ? { targetRuleId: raw.targetRuleId } : {}),
    ...(raw.submitted === true && !departed && !combat ? { submitted: true } : {}),
  })
}

function migrateTrade(raw: LegacyTrade): Encounter | unknown {
  const quality = readQuality(raw.quality)
  const completed = raw.completed === true
  const label = typeof raw.label === 'string' ? raw.label : ENCOUNTER_KIND_LABEL.passerby
  const kind = raw.kind === 'shady' ? 'blackMerchant' : raw.kind === 'pawnshop' ? 'pawn' : raw.kind
  if (kind === 'blackMerchant') {
    return {
      kind: 'blackMerchant',
      id: raw.id,
      label,
      quality,
      buyGold: typeof raw.buyGold === 'number' ? raw.buyGold : 8,
      buyOffers: isNeedMap(raw.buyOffers) ? { ...raw.buyOffers } : { meal: 1 },
      completed,
    } satisfies BlackMerchantEncounter
  }
  if (kind === 'passerby') {
    return {
      kind: 'passerby',
      id: raw.id,
      label,
      quality,
      wants: isNeedMap(raw.wants) ? { ...raw.wants } : {},
      offers: isNeedMap(raw.offers) ? { ...raw.offers } : {},
      completed,
    } satisfies PasserbyEncounter
  }
  if (kind === 'pawn') {
    const pawnWants = isNeedMap(raw.pawnWants)
      ? { ...raw.pawnWants }
      : isNeedMap(raw.wants) && needEntries(raw.wants).length
        ? { ...raw.wants }
        : { wood: 2 }
    return {
      kind: 'pawn',
      id: raw.id,
      label,
      quality,
      pawnWants,
      rewardGold: typeof raw.rewardGold === 'number' ? raw.rewardGold : pawnGoldForMap(pawnWants),
      completed,
    } satisfies PawnEncounter
  }
  if (kind === 'artisan') {
    return {
      kind: 'artisan',
      id: raw.id,
      label,
      quality,
      wants: isNeedMap(raw.wants) ? { ...raw.wants } : { weapon: 1 },
      rewardGold: 0,
      buffMul: typeof raw.buffMul === 'number' && raw.buffMul > 1 ? raw.buffMul : 1.15,
      buffDurationS: typeof raw.buffDurationS === 'number' && raw.buffDurationS > 0 ? raw.buffDurationS : 180,
      completed,
    } satisfies ArtisanEncounter
  }
  if (kind === 'bulkBuy') {
    const wants = isNeedMap(raw.wants) ? { ...raw.wants } : { meal: 1 }
    return {
      kind: 'bulkBuy',
      id: raw.id,
      label,
      quality,
      wants,
      rewardGold: typeof raw.rewardGold === 'number' ? raw.rewardGold : bulkGoldForMap(wants),
      completed,
    } satisfies BulkBuyEncounter
  }
  return raw
}

function migrateEncounterSlot(value: unknown): Encounter | unknown {
  if (!value || typeof value !== 'object') return value
  const raw = value as { kind?: string }
  if (raw.kind === 'enemy') return migrateEnemy(raw as LegacyEnemy)
  if (raw.kind === 'merchant') return migrateLegacyMerchant(raw as LegacyMerchant)
  if (
    raw.kind === 'shady' ||
    raw.kind === 'blackMerchant' ||
    raw.kind === 'passerby' ||
    raw.kind === 'pawnshop' ||
    raw.kind === 'pawn' ||
    raw.kind === 'artisan' ||
    raw.kind === 'bulkBuy'
  ) {
    return migrateTrade(raw as LegacyTrade)
  }
  return value
}

function hydrateWorkshopBuff(save: Save): void {
  const raw = save as Save & { workshopBuff?: unknown }
  const buff = raw.workshopBuff
  if (!buff || typeof buff !== 'object') {
    raw.workshopBuff = null
    return
  }
  const rec = buff as { mul?: unknown; endsAt?: unknown }
  if (typeof rec.mul === 'number' && rec.mul > 0 && typeof rec.endsAt === 'number' && Number.isFinite(rec.endsAt)) {
    raw.workshopBuff = { mul: rec.mul, endsAt: rec.endsAt }
    return
  }
  raw.workshopBuff = null
}

/** 旧存档补主线订单板；单格出发字段迁进第 0 格敌人；通用商人拆成六种之一。按当前科技格数收/补。 */
export function hydrateEncounterFields(save: Save): Save {
  const raw = save as LegacyOrderSave
  raw.exploreCount =
    Number.isFinite(raw.exploreCount) && raw.exploreCount > 0 ? Math.floor(raw.exploreCount) : 0
  raw.departCount =
    Number.isFinite(raw.departCount) && raw.departCount > 0 ? Math.floor(raw.departCount) : 0
  raw.lastDepartAt =
    typeof raw.lastDepartAt === 'number' && Number.isFinite(raw.lastDepartAt) ? raw.lastDepartAt : null
  hydrateMainChapterFields(raw)
  hydrateWorkshopBuff(raw)

  if (Array.isArray(raw.encounters)) {
    raw.encounters = raw.encounters.map((slot) => migrateEncounterSlot(slot) as Encounter)
  }

  const migrated = Array.isArray(raw.encounters) ? raw.encounters.filter(isEncounter) : []
  if (migrated.length === 0) {
    raw.encounters = generateEncounterBoard(raw.exploreCount, encounterSlotCount(raw), {
      ...spawnOptsFor(raw, []),
      starterCopperPawn: true,
    })
    migrateLegacyOrder(raw)
  } else {
    raw.encounters = migrated
  }

  resizeEncounterBoard(raw)
  ensureChapterBossSpawn(raw)
  for (const enc of raw.encounters) {
    if (enc.kind === 'enemy') ensureEnemyIntel(enc, 0, 0, raw)
  }
  delete raw.currentOrderId
  delete raw.orderIndex
  delete raw.orderSubmitted
  return raw
}
