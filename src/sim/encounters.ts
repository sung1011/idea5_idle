import { addToBank, bankQty } from './bank'
import { canAffordCosts, missingCostLabels, takeCosts } from './costs'
import { ITEM_DEF, bulkUnitGold, pawnUnitGold, type IoRule } from './tables'
import type {
  ActionResult,
  ArtisanEncounter,
  BlackMerchantEncounter,
  BulkBuyEncounter,
  Encounter,
  EncounterDistance,
  EncounterKind,
  EncounterNeedMap,
  EncounterPower,
  EncounterQuality,
  EnemyEncounter,
  ItemId,
  MerchantEncounter,
  MerchantKind,
  PasserbyEncounter,
  PawnEncounter,
  Save,
  TradeEncounter,
  WorkshopBuff,
} from './types'

export const ENCOUNTER_SLOT_COUNT = 6

/** 探索费用。随探索次数略涨，超出表长后钉在末档。 */
export const EXPLORE_COST_TABLE: readonly number[] = [8, 10, 12, 14, 16]

export const DISTANCE_LABEL: Record<EncounterDistance, string> = {
  near: '近',
  far: '远',
}

export const POWER_LABEL: Record<EncounterPower, string> = {
  weak: '弱',
  strong: '强',
}

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

/** 行军时长（秒）。远 / 强更久，夹在 10～30 分钟。 */
export const MARCH_DURATION_S: Readonly<Record<EncounterDistance, Record<EncounterPower, number>>> = {
  near: { weak: 10 * 60, strong: 18 * 60 },
  far: { weak: 22 * 60, strong: 30 * 60 },
}

/** 战利品只发金币，按远近强弱。绿档基准。 */
export const LOOT_GOLD_TABLE: Readonly<Record<EncounterDistance, Record<EncounterPower, number>>> = {
  near: { weak: 8, strong: 14 },
  far: { weak: 12, strong: 20 },
}

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
  rewardGold: number
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
  { id: 'merchantPawnOre', label: '矿石当', pawnWants: { ore: 2, fish: 2 } },
]

export const PAWNSHOP_DEFS = PAWN_DEFS

export const ARTISAN_DEFS: readonly ArtisanDef[] = [
  { id: 'artisanBlade', label: '修工具委托', wants: { tool: 1 }, rewardGold: 10, buffMul: 1.15, buffDurationS: 180 },
  { id: 'artisanMeal', label: '灶头加餐', wants: { meal: 2 }, rewardGold: 12, buffMul: 1.12, buffDurationS: 150 },
  { id: 'artisanStew', label: '炖锅加餐', wants: { stew: 1 }, rewardGold: 16, buffMul: 1.16, buffDurationS: 180 },
  { id: 'artisanPotion', label: '药剂试制', wants: { potion: 1 }, rewardGold: 14, buffMul: 1.18, buffDurationS: 210 },
]

export const BULK_BUY_DEFS: readonly BulkBuyDef[] = [
  { id: 'bulkBlade', label: '工具收购', wants: { tool: 1 } },
  { id: 'bulkMeal', label: '熟食收购', wants: { meal: 2 } },
  { id: 'bulkRoast', label: '烤肉收购', wants: { roast: 2 } },
  { id: 'bulkPotion', label: '药剂收购', wants: { potion: 1 } },
  { id: 'bulkCooked', label: '干粮收购', wants: { meal: 1, fish: 2 } },
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

const BASE_FOOD: EncounterNeedMap = { meal: 1 }
const FAR_FOOD_EXTRA: EncounterNeedMap = { meal: 2, fish: 2, roast: 1 }
const BASE_ARMS: EncounterNeedMap = { ore: 1 }
const STRONG_ARMS_EXTRA: EncounterNeedMap = { ore: 2 }

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

type LegacyEnemy = EnemyEncounter & {
  departGold?: number
  quality?: EncounterQuality
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

/** 远 → 更高食物/干粮；强 → 更高矿物与武器。绿档基准。 */
export function enemyNeedsFor(distance: EncounterDistance, power: EncounterPower): EncounterNeedMap {
  return mergeNeedMaps(
    BASE_FOOD,
    distance === 'far' ? FAR_FOOD_EXTRA : {},
    BASE_ARMS,
    power === 'strong' ? STRONG_ARMS_EXTRA : {},
  )
}

export function marchDurationS(distance: EncounterDistance, power: EncounterPower): number {
  return MARCH_DURATION_S[distance][power]
}

export function enemyLootGoldFor(distance: EncounterDistance, power: EncounterPower): number {
  return LOOT_GOLD_TABLE[distance][power]
}

export function pawnGoldForMap(map: EncounterNeedMap): number {
  return needEntries(map).reduce((sum, [itemId, qty]) => sum + pawnUnitGold(itemId) * qty, 0)
}

export function bulkGoldForMap(map: EncounterNeedMap): number {
  return needEntries(map).reduce((sum, [itemId, qty]) => sum + bulkUnitGold(itemId) * qty, 0)
}

export function pawnRewardGold(enc: PawnEncounter): number {
  if (typeof enc.rewardGold === 'number' && enc.rewardGold > 0) return enc.rewardGold
  return scaleGold(pawnGoldForMap(enc.pawnWants), qualityDef(enc.quality).outputMul / qualityDef(enc.quality).demandMul)
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
  if (enc.marchEndsAt == null) return 0
  return Math.max(0, Math.ceil((enc.marchEndsAt - now) / 1000))
}

export function isMarching(enc: EnemyEncounter, now = Date.now()): boolean {
  return enc.departed && !enc.lootClaimed && enc.marchEndsAt != null && now < enc.marchEndsAt
}

export function isLootReady(enc: EnemyEncounter, now = Date.now()): boolean {
  return enc.departed && !enc.lootClaimed && enc.marchEndsAt != null && now >= enc.marchEndsAt
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
  return EXPLORE_COST_TABLE[index]
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

function weightBag<T extends string>(weights: Readonly<Record<T, number>>): T[] {
  const bag: T[] = []
  for (const key of Object.keys(weights) as T[]) {
    const weight = weights[key]
    for (let i = 0; i < weight; i++) bag.push(key)
  }
  return bag
}

const KIND_WEIGHT_BAG = weightBag(ENCOUNTER_KIND_WEIGHTS)
const QUALITY_WEIGHT_BAG = weightBag({
  green: QUALITY_TABLE.green.weight,
  blue: QUALITY_TABLE.blue.weight,
  purple: QUALITY_TABLE.purple.weight,
  orange: QUALITY_TABLE.orange.weight,
})
const MERCHANT_WEIGHT_BAG = weightBag(MERCHANT_KIND_WEIGHTS)

export function pickEncounterKind(seed: number, slot: number): EncounterKind {
  const bag = KIND_WEIGHT_BAG
  return bag[(seed * 7 + slot * 5) % bag.length]
}

export function pickQuality(seed: number, slot: number): EncounterQuality {
  const bag = QUALITY_WEIGHT_BAG
  return bag[(seed * 11 + slot * 9) % bag.length]
}

export function pickMerchantKind(seed: number, slot: number): MerchantKind {
  const bag = MERCHANT_WEIGHT_BAG
  return bag[(seed * 5 + slot * 3) % bag.length]
}

function makeEnemy(seed: number, slot: number, quality: EncounterQuality): EnemyEncounter {
  const name = ENEMY_NAME_DEFS[(seed + slot) % ENEMY_NAME_DEFS.length]
  const distance: EncounterDistance = (seed + slot) % 2 === 0 ? 'near' : 'far'
  const power: EncounterPower = (seed + slot * 3) % 4 < 2 ? 'weak' : 'strong'
  const q = qualityDef(quality)
  return {
    kind: 'enemy',
    id: `${name.id}-${quality}-${seed}-${slot}`,
    label: name.label,
    quality,
    distance,
    power,
    needs: scaleNeedMap(enemyNeedsFor(distance, power), q.demandMul),
    lootGold: scaleGold(enemyLootGoldFor(distance, power), q.outputMul),
    departed: false,
    marchEndsAt: null,
    lootClaimed: false,
  }
}

function makeBlackMerchant(seed: number, slot: number, quality: EncounterQuality): BlackMerchantEncounter {
  const def = BLACK_MERCHANT_DEFS[(seed + slot) % BLACK_MERCHANT_DEFS.length]
  const q = qualityDef(quality)
  return {
    kind: 'blackMerchant',
    id: `${def.id}-${quality}-${seed}-${slot}`,
    label: def.label,
    quality,
    buyGold: scaleGold(def.buyGold, q.demandMul),
    buyOffers: scaleNeedMap(def.buyOffers, q.outputMul),
    completed: false,
  }
}

function makePasserby(seed: number, slot: number, quality: EncounterQuality): PasserbyEncounter {
  const def = PASSERBY_DEFS[(seed + slot) % PASSERBY_DEFS.length]
  const q = qualityDef(quality)
  return {
    kind: 'passerby',
    id: `${def.id}-${quality}-${seed}-${slot}`,
    label: def.label,
    quality,
    wants: scaleNeedMap(def.wants, q.demandMul),
    offers: scaleNeedMap(def.offers, q.outputMul),
    completed: false,
  }
}

function makePawn(seed: number, slot: number, quality: EncounterQuality): PawnEncounter {
  const def = PAWN_DEFS[(seed + slot) % PAWN_DEFS.length]
  const q = qualityDef(quality)
  const pawnWants = scaleNeedMap(def.pawnWants, q.demandMul)
  return {
    kind: 'pawn',
    id: `${def.id}-${quality}-${seed}-${slot}`,
    label: def.label,
    quality,
    pawnWants,
    rewardGold: scaleGold(pawnGoldForMap(def.pawnWants), q.outputMul),
    completed: false,
  }
}

function makeArtisan(seed: number, slot: number, quality: EncounterQuality): ArtisanEncounter {
  const def = ARTISAN_DEFS[(seed + slot) % ARTISAN_DEFS.length]
  const q = qualityDef(quality)
  return {
    kind: 'artisan',
    id: `${def.id}-${quality}-${seed}-${slot}`,
    label: def.label,
    quality,
    wants: scaleNeedMap(def.wants, q.demandMul),
    rewardGold: scaleGold(def.rewardGold, q.outputMul),
    buffMul: 1 + (def.buffMul - 1) * q.outputMul,
    buffDurationS: scaleQty(def.buffDurationS, q.outputMul),
    completed: false,
  }
}

function makeBulkBuy(seed: number, slot: number, quality: EncounterQuality): BulkBuyEncounter {
  const def = BULK_BUY_DEFS[(seed + slot) % BULK_BUY_DEFS.length]
  const q = qualityDef(quality)
  const wants = scaleNeedMap(def.wants, q.demandMul)
  return {
    kind: 'bulkBuy',
    id: `${def.id}-${quality}-${seed}-${slot}`,
    label: def.label,
    quality,
    wants,
    rewardGold: scaleGold(bulkGoldForMap(def.wants), q.outputMul),
    completed: false,
  }
}

function makeEncounter(seed: number, slot: number): Encounter {
  const quality = pickQuality(seed, slot)
  const kind = pickEncounterKind(seed, slot)
  if (kind === 'enemy') return makeEnemy(seed, slot, quality)
  if (kind === 'blackMerchant') return makeBlackMerchant(seed, slot, quality)
  if (kind === 'passerby') return makePasserby(seed, slot, quality)
  if (kind === 'pawn') return makePawn(seed, slot, quality)
  if (kind === 'artisan') return makeArtisan(seed, slot, quality)
  return makeBulkBuy(seed, slot, quality)
}

export function generateEncounterBoard(seed: number): Encounter[] {
  const safe = Number.isFinite(seed) && seed >= 0 ? Math.floor(seed) : 0
  return Array.from({ length: ENCOUNTER_SLOT_COUNT }, (_, slot) => makeEncounter(safe, slot))
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
    (enc.distance === 'near' || enc.distance === 'far') &&
    (enc.power === 'weak' || enc.power === 'strong') &&
    isNeedMap(enc.needs) &&
    typeof enc.lootGold === 'number' &&
    (enc.submitted === undefined || typeof enc.submitted === 'boolean') &&
    typeof enc.departed === 'boolean' &&
    (enc.marchEndsAt === null || typeof enc.marchEndsAt === 'number') &&
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

export function isValidEncounterBoard(value: unknown): value is Encounter[] {
  return Array.isArray(value) && value.length === ENCOUNTER_SLOT_COUNT && value.every(isEncounter)
}

function slotAt(save: Save, index: number): Encounter | undefined {
  if (!Number.isInteger(index) || index < 0 || index >= ENCOUNTER_SLOT_COUNT) return undefined
  return save.encounters[index]
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
  if (enc.lootClaimed) return '战利品已领取'
  if (enc.departed) return '已出发，行军中'
  return null
}

function suppliesAlreadyTaken(enc: EnemyEncounter): boolean {
  return enc.submitted === true
}

/** 一键出发：货不够则失败；货够（或旧档已扣过补给）则扣货并进入行军。 */
export function departBlockReason(save: Save, index: number): string | null {
  const enc = enemyAt(save, index)
  if (!enc) return '不是敌人偶遇'
  const status = enemyStatusReason(enc)
  if (status) return status
  if (suppliesAlreadyTaken(enc)) return null
  const missing = missingLabels(save, enc.needs)
  if (missing.length) return `货不够：${missing.join('、')}`
  return null
}

export function canDepartEncounter(save: Save, index: number): boolean {
  return departBlockReason(save, index) === null
}

/** 一次点击扣光补给并进入行军。不发金币、不做战斗。 */
export function departEncounter(save: Save, index: number, now = Date.now()): ActionResult {
  const blocked = departBlockReason(save, index)
  if (blocked) return { ok: false, reason: blocked }
  const enc = enemyAt(save, index)
  if (!enc) return { ok: false, reason: '不是敌人偶遇' }
  if (!suppliesAlreadyTaken(enc)) {
    const took = takeCosts(save, needMapToRules(enc.needs))
    if (!took.ok) return took
  }
  const durationS = marchDurationS(enc.distance, enc.power)
  save.departCount += 1
  save.lastDepartAt = now
  delete enc.submitted
  enc.departed = true
  enc.marchEndsAt = now + durationS * 1000
  enc.lootClaimed = false
  return { ok: true, message: `已出发，行军 ${formatMarchClock(durationS)}` }
}

export function claimLootBlockReason(save: Save, index: number, now = Date.now()): string | null {
  const enc = enemyAt(save, index)
  if (!enc) return '不是敌人偶遇'
  if (enc.lootClaimed) return '战利品已领取'
  if (!enc.departed || enc.marchEndsAt == null) return '先出发行军'
  if (now < enc.marchEndsAt) return '行军尚未结束'
  return null
}

export function canClaimLoot(save: Save, index: number, now = Date.now()): boolean {
  return claimLootBlockReason(save, index, now) === null
}

/** 行军到期后领金币。不加物资。 */
export function claimLoot(save: Save, index: number, now = Date.now()): ActionResult {
  const blocked = claimLootBlockReason(save, index, now)
  if (blocked) return { ok: false, reason: blocked }
  const enc = enemyAt(save, index)
  if (!enc) return { ok: false, reason: '不是敌人偶遇' }
  save.gold += enc.lootGold
  enc.lootClaimed = true
  return { ok: true, message: `战利品：金币 +${enc.lootGold}` }
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
  return { ok: true, message: '金币购买成交' }
}

export function pawnMerchant(save: Save, index: number): ActionResult {
  const blocked = pawnBlockReason(save, index)
  if (blocked) return { ok: false, reason: blocked }
  const enc = pawnAt(save, index)
  if (!enc) return { ok: false, reason: '不是当铺偶遇' }
  const gold = pawnRewardGold(enc)
  const took = takeCosts(save, needMapToRules(enc.pawnWants))
  if (!took.ok) return took
  save.gold += gold
  enc.completed = true
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
  save.gold += enc.rewardGold
  applyWorkshopBuff(save, enc.buffMul, enc.buffDurationS, now)
  enc.completed = true
  const pct = Math.round((enc.buffMul - 1) * 100)
  return {
    ok: true,
    message: `委托完成。金币 +${enc.rewardGold}，工坊产量 +${pct}% · ${formatMarchClock(enc.buffDurationS)}`,
  }
}

export function sellBulk(save: Save, index: number): ActionResult {
  const blocked = bulkBuyBlockReason(save, index)
  if (blocked) return { ok: false, reason: blocked }
  const enc = bulkBuyAt(save, index)
  if (!enc) return { ok: false, reason: '不是收购订单' }
  const took = takeCosts(save, needMapToRules(enc.wants))
  if (!took.ok) return took
  save.gold += enc.rewardGold
  enc.completed = true
  return { ok: true, message: `收购成交。金币 +${enc.rewardGold}` }
}

/** 行军中或可领战利品的敌人占位保留；未出发 / 已领奖 / 已完成 / 其它格可换。 */
export function shouldKeepOnExplore(enc: Encounter, now = Date.now()): boolean {
  if (enc.kind !== 'enemy') return false
  return isMarching(enc, now) || isLootReady(enc, now)
}

/** 探索：扣金币，只替换可刷新格，保留格占位，板子仍满 6 格。 */
export function exploreBoard(save: Save, now = Date.now()): ActionResult {
  const blocked = exploreBlockReason(save)
  if (blocked) return { ok: false, reason: blocked }
  const cost = exploreCost(save)
  const kept = save.encounters.map((enc) => (shouldKeepOnExplore(enc, now) ? enc : null))
  save.gold -= cost
  save.exploreCount += 1
  const next = generateEncounterBoard(save.exploreCount)
  save.encounters = next.map((fresh, slot) => kept[slot] ?? fresh)
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
  save.encounters[0] = {
    kind: 'enemy',
    id: old.id,
    label: old.label,
    quality: 'green',
    distance: 'near',
    power: 'weak',
    needs: { ...old.needs },
    lootGold: old.lootGold,
    departed: false,
    marchEndsAt: null,
    lootClaimed: false,
    ...(save.orderSubmitted === true ? { submitted: true } : {}),
  }
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
  const lootGold =
    typeof raw.lootGold === 'number'
      ? raw.lootGold
      : typeof raw.departGold === 'number'
        ? raw.departGold
        : enemyLootGoldFor(raw.distance, raw.power)
  const departed = raw.departed === true
  const hasMarch = typeof raw.marchEndsAt === 'number'
  // 旧存档出发当时已发补给金：视为已领取，避免再发。
  const lootClaimed = raw.lootClaimed === true || (departed && !hasMarch)
  return {
    kind: 'enemy',
    id: raw.id,
    label: raw.label,
    quality: readQuality(raw.quality),
    distance: raw.distance,
    power: raw.power,
    needs: { ...raw.needs },
    lootGold,
    departed,
    marchEndsAt: hasMarch ? raw.marchEndsAt : null,
    lootClaimed,
    ...(raw.submitted === true && !departed ? { submitted: true } : {}),
  }
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
      rewardGold: typeof raw.rewardGold === 'number' ? raw.rewardGold : 10,
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

/** 旧存档补偶遇板；单格出发字段迁进第 0 格敌人；通用商人拆成六种之一。 */
export function hydrateEncounterFields(save: Save): Save {
  const raw = save as LegacyOrderSave
  raw.exploreCount =
    Number.isFinite(raw.exploreCount) && raw.exploreCount > 0 ? Math.floor(raw.exploreCount) : 0
  raw.departCount =
    Number.isFinite(raw.departCount) && raw.departCount > 0 ? Math.floor(raw.departCount) : 0
  raw.lastDepartAt =
    typeof raw.lastDepartAt === 'number' && Number.isFinite(raw.lastDepartAt) ? raw.lastDepartAt : null
  hydrateWorkshopBuff(raw)

  if (Array.isArray(raw.encounters)) {
    raw.encounters = raw.encounters.map((slot) => migrateEncounterSlot(slot) as Encounter)
    if (raw.encounters.length > 0 && raw.encounters.every(isEncounter)) {
      if (raw.encounters.length !== ENCOUNTER_SLOT_COUNT) {
        const fresh = generateEncounterBoard(raw.exploreCount)
        raw.encounters = Array.from(
          { length: ENCOUNTER_SLOT_COUNT },
          (_, slot) => raw.encounters[slot] ?? fresh[slot],
        )
      }
    }
  }

  const hadBoard = isValidEncounterBoard(raw.encounters)
  if (!hadBoard) {
    raw.encounters = generateEncounterBoard(raw.exploreCount)
    migrateLegacyOrder(raw)
  }

  delete raw.currentOrderId
  delete raw.orderIndex
  delete raw.orderSubmitted
  return raw
}
