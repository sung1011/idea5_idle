import { addToBank, bankQty, canFit } from './bank'
import { canAffordCosts, missingCostLabels, takeCosts } from './costs'
import { ITEM_DEF, pawnUnitGold, type IoRule } from './tables'
import type {
  ActionResult,
  Encounter,
  EncounterDistance,
  EncounterNeedMap,
  EncounterPower,
  EnemyEncounter,
  ItemId,
  MerchantEncounter,
  MerchantKind,
  PasserbyEncounter,
  PawnshopEncounter,
  Save,
  ShadyEncounter,
} from './types'

export const ENCOUNTER_SLOT_COUNT = 5

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

export const MERCHANT_KIND_LABEL: Record<MerchantKind, string> = {
  shady: '黑心商人',
  passerby: '路人',
  pawnshop: '当铺',
}

/** 原商人格按此权重抽三种之一。 */
export const MERCHANT_KIND_WEIGHTS: Readonly<Record<MerchantKind, number>> = {
  shady: 2,
  passerby: 2,
  pawnshop: 2,
}

export const MERCHANT_KINDS: readonly MerchantKind[] = ['shady', 'passerby', 'pawnshop']

/** 行军时长（秒）。远 / 强更久，夹在 10～30 分钟。 */
export const MARCH_DURATION_S: Readonly<Record<EncounterDistance, Record<EncounterPower, number>>> = {
  near: { weak: 10 * 60, strong: 18 * 60 },
  far: { weak: 22 * 60, strong: 30 * 60 },
}

/** 战利品只发金币，按远近强弱。 */
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

export type ShadyDef = {
  id: string
  label: string
  buyGold: number
  buyOffers: EncounterNeedMap
}

export type PasserbyDef = {
  id: string
  label: string
  wants: EncounterNeedMap
  offers: EncounterNeedMap
}

export type PawnshopDef = {
  id: string
  label: string
  pawnWants: EncounterNeedMap
}

export const SHADY_DEFS: readonly ShadyDef[] = [
  { id: 'merchantBuy', label: '木货贩', buyGold: 8, buyOffers: { meal: 1 } },
  { id: 'merchantBuyOre', label: '矿石掮客', buyGold: 6, buyOffers: { ore: 2 } },
  { id: 'merchantBuyBlade', label: '铜器贩', buyGold: 12, buyOffers: { weapon: 1 } },
  { id: 'merchantBuyCook', label: '行脚厨子', buyGold: 14, buyOffers: { meal: 2 } },
]

export const PASSERBY_DEFS: readonly PasserbyDef[] = [
  { id: 'merchantBarter', label: '换货路人', wants: { wood: 4 }, offers: { meal: 1 } },
  { id: 'merchantBarterOre', label: '矿换路人', wants: { fish: 3 }, offers: { ore: 2 } },
  { id: 'merchantBarterBlade', label: '铜器路人', wants: { ore: 3 }, offers: { weapon: 1 } },
  { id: 'merchantBarterCook', label: '干粮路人', wants: { meal: 1 }, offers: { wood: 3 } },
]

export const PAWNSHOP_DEFS: readonly PawnshopDef[] = [
  { id: 'merchantPawn', label: '兵器当', pawnWants: { weapon: 1 } },
  { id: 'merchantPawnMeal', label: '干粮当', pawnWants: { meal: 1 } },
  { id: 'merchantPawnWood', label: '木料当', pawnWants: { wood: 4 } },
  { id: 'merchantPawnOre', label: '矿石当', pawnWants: { ore: 2, fish: 2 } },
]

/** 旧单格出发存档迁进偶遇敌人用。 */
const LEGACY_ORDER_DEFS: ReadonlyArray<{
  id: string
  label: string
  needs: EncounterNeedMap
  lootGold: number
}> = [
  { id: 'scoutRation', label: '斥候干粮', needs: { weapon: 1, meal: 2 }, lootGold: 8 },
  { id: 'caravanGuard', label: '商队护卫', needs: { weapon: 2, meal: 1, wood: 2 }, lootGold: 12 },
  { id: 'campKitchen', label: '营地开伙', needs: { meal: 3, wood: 3 }, lootGold: 10 },
  { id: 'bladeTrial', label: '试刃出征', needs: { weapon: 3 }, lootGold: 14 },
  { id: 'riverWatch', label: '河岸巡守', needs: { weapon: 1, meal: 1, fish: 2 }, lootGold: 9 },
  { id: 'timberPost', label: '木桩营地', needs: { wood: 4, meal: 1 }, lootGold: 7 },
]

const BASE_FOOD: EncounterNeedMap = { meal: 1 }
const FAR_FOOD_EXTRA: EncounterNeedMap = { meal: 2, fish: 2 }
const BASE_ARMS: EncounterNeedMap = { weapon: 1 }
const STRONG_ARMS_EXTRA: EncounterNeedMap = { weapon: 1, ore: 2 }

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

/** 远 → 更高食物/干粮；强 → 更高矿物与武器。 */
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
  return kind === 'shady' || kind === 'passerby' || kind === 'pawnshop'
}

export function isMerchantSlot(enc: Encounter): enc is MerchantEncounter {
  return isMerchantKind(enc.kind)
}

function merchantWeightBag(): MerchantKind[] {
  const bag: MerchantKind[] = []
  for (const kind of MERCHANT_KINDS) {
    const weight = MERCHANT_KIND_WEIGHTS[kind]
    for (let i = 0; i < weight; i++) bag.push(kind)
  }
  return bag
}

const MERCHANT_WEIGHT_BAG = merchantWeightBag()

function slotRole(seed: number, slot: number): 'enemy' | 'merchant' {
  const merchantSlots = new Set([(seed + 1) % ENCOUNTER_SLOT_COUNT, (seed + 3) % ENCOUNTER_SLOT_COUNT])
  return merchantSlots.has(slot) ? 'merchant' : 'enemy'
}

export function pickMerchantKind(seed: number, slot: number): MerchantKind {
  const bag = MERCHANT_WEIGHT_BAG
  return bag[(seed * 5 + slot * 3) % bag.length]
}

function makeEnemy(seed: number, slot: number): EnemyEncounter {
  const name = ENEMY_NAME_DEFS[(seed + slot) % ENEMY_NAME_DEFS.length]
  const distance: EncounterDistance = (seed + slot) % 2 === 0 ? 'near' : 'far'
  const power: EncounterPower = (seed + slot * 3) % 4 < 2 ? 'weak' : 'strong'
  return {
    kind: 'enemy',
    id: `${name.id}-${seed}-${slot}`,
    label: name.label,
    distance,
    power,
    needs: enemyNeedsFor(distance, power),
    lootGold: enemyLootGoldFor(distance, power),
    departed: false,
    marchEndsAt: null,
    lootClaimed: false,
  }
}

function makeShady(seed: number, slot: number): ShadyEncounter {
  const def = SHADY_DEFS[(seed + slot) % SHADY_DEFS.length]
  return {
    kind: 'shady',
    id: `${def.id}-${seed}-${slot}`,
    label: def.label,
    buyGold: def.buyGold,
    buyOffers: { ...def.buyOffers },
    completed: false,
  }
}

function makePasserby(seed: number, slot: number): PasserbyEncounter {
  const def = PASSERBY_DEFS[(seed + slot) % PASSERBY_DEFS.length]
  return {
    kind: 'passerby',
    id: `${def.id}-${seed}-${slot}`,
    label: def.label,
    wants: { ...def.wants },
    offers: { ...def.offers },
    completed: false,
  }
}

function makePawnshop(seed: number, slot: number): PawnshopEncounter {
  const def = PAWNSHOP_DEFS[(seed + slot) % PAWNSHOP_DEFS.length]
  return {
    kind: 'pawnshop',
    id: `${def.id}-${seed}-${slot}`,
    label: def.label,
    pawnWants: { ...def.pawnWants },
    completed: false,
  }
}

function makeMerchant(seed: number, slot: number): MerchantEncounter {
  const kind = pickMerchantKind(seed, slot)
  if (kind === 'shady') return makeShady(seed, slot)
  if (kind === 'passerby') return makePasserby(seed, slot)
  return makePawnshop(seed, slot)
}

export function generateEncounterBoard(seed: number): Encounter[] {
  const safe = Number.isFinite(seed) && seed >= 0 ? Math.floor(seed) : 0
  return Array.from({ length: ENCOUNTER_SLOT_COUNT }, (_, slot) =>
    slotRole(safe, slot) === 'merchant' ? makeMerchant(safe, slot) : makeEnemy(safe, slot),
  )
}

function isNeedMap(value: unknown): value is EncounterNeedMap {
  return !!value && typeof value === 'object'
}

function isEnemyEncounter(value: unknown): value is EnemyEncounter {
  if (!value || typeof value !== 'object') return false
  const enc = value as EnemyEncounter
  return (
    enc.kind === 'enemy' &&
    typeof enc.id === 'string' &&
    typeof enc.label === 'string' &&
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

function isShadyEncounter(value: unknown): value is ShadyEncounter {
  if (!value || typeof value !== 'object') return false
  const enc = value as ShadyEncounter
  return (
    enc.kind === 'shady' &&
    typeof enc.id === 'string' &&
    typeof enc.label === 'string' &&
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
    isNeedMap(enc.wants) &&
    isNeedMap(enc.offers) &&
    typeof enc.completed === 'boolean'
  )
}

function isPawnshopEncounter(value: unknown): value is PawnshopEncounter {
  if (!value || typeof value !== 'object') return false
  const enc = value as PawnshopEncounter
  return (
    enc.kind === 'pawnshop' &&
    typeof enc.id === 'string' &&
    typeof enc.label === 'string' &&
    isNeedMap(enc.pawnWants) &&
    typeof enc.completed === 'boolean'
  )
}

export function isMerchantEncounter(value: unknown): value is MerchantEncounter {
  return isShadyEncounter(value) || isPasserbyEncounter(value) || isPawnshopEncounter(value)
}

export function isEncounter(value: unknown): value is Encounter {
  return isEnemyEncounter(value) || isMerchantEncounter(value)
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

function canFitNeedMap(save: Save, map: EncounterNeedMap): boolean {
  return needEntries(map).every(([itemId, qty]) => canFit(save, itemId, qty))
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

export function shadyAt(save: Save, index: number): ShadyEncounter | undefined {
  const enc = slotAt(save, index)
  return enc?.kind === 'shady' ? enc : undefined
}

export function passerbyAt(save: Save, index: number): PasserbyEncounter | undefined {
  const enc = slotAt(save, index)
  return enc?.kind === 'passerby' ? enc : undefined
}

export function pawnshopAt(save: Save, index: number): PawnshopEncounter | undefined {
  const enc = slotAt(save, index)
  return enc?.kind === 'pawnshop' ? enc : undefined
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

/** 行军到期后领金币。不加银行物品。 */
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
  const enc = merchantAt(save, index)
  if (!enc) return '不是商人偶遇'
  if (enc.kind === 'shady') return '黑心商人不能以物易物'
  if (enc.kind === 'pawnshop') return '当铺不能以物易物'
  if (enc.completed) return '这笔买卖已完成'
  if (!canAffordCosts(save, needMapToRules(enc.wants))) {
    return `货不够：${missingCostLabels(save, needMapToRules(enc.wants)).join('、')}`
  }
  if (!canFitNeedMap(save, enc.offers)) return '银行装不下换得的货物'
  return null
}

export function buyMerchantBlockReason(save: Save, index: number): string | null {
  const enc = merchantAt(save, index)
  if (!enc) return '不是商人偶遇'
  if (enc.kind === 'passerby') return '路人不能购买'
  if (enc.kind === 'pawnshop') return '当铺不能购买'
  if (enc.completed) return '这笔买卖已完成'
  if (save.gold < enc.buyGold) return `金币不够：购买要 ${enc.buyGold}`
  if (!canFitNeedMap(save, enc.buyOffers)) return '银行装不下买到的货物'
  return null
}

export function pawnBlockReason(save: Save, index: number): string | null {
  const enc = merchantAt(save, index)
  if (!enc) return '不是商人偶遇'
  if (enc.kind === 'shady') return '黑心商人不能典当'
  if (enc.kind === 'passerby') return '路人不能典当'
  if (enc.completed) return '这笔买卖已完成'
  if (!needEntries(enc.pawnWants).length) return '没有可典当物品'
  if (!canAffordCosts(save, needMapToRules(enc.pawnWants))) {
    return `货不够：${missingCostLabels(save, needMapToRules(enc.pawnWants)).join('、')}`
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
  const enc = shadyAt(save, index)
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
  const enc = pawnshopAt(save, index)
  if (!enc) return { ok: false, reason: '不是当铺偶遇' }
  const gold = pawnGoldForMap(enc.pawnWants)
  const took = takeCosts(save, needMapToRules(enc.pawnWants))
  if (!took.ok) return took
  save.gold += gold
  enc.completed = true
  return { ok: true, message: `以物换钱成交。金币 +${gold}` }
}

/** 行军中或可领战利品的敌人占位保留；未出发 / 已领奖 / 商人整格可换。 */
export function shouldKeepOnExplore(enc: Encounter, now = Date.now()): boolean {
  if (enc.kind !== 'enemy') return false
  return isMarching(enc, now) || isLootReady(enc, now)
}

/** 探索：扣金币，只替换可刷新格，保留格占位，板子仍满 5 格。 */
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
  if (hasBuy) return 'shady'
  return 'passerby'
}

function migrateLegacyMerchant(raw: LegacyMerchant): MerchantEncounter {
  const kind = inferMerchantKind(raw)
  const completed = raw.completed === true
  const label = typeof raw.label === 'string' ? raw.label : MERCHANT_KIND_LABEL[kind]
  if (kind === 'shady') {
    return {
      kind: 'shady',
      id: raw.id.startsWith('merchantBuy') ? raw.id : `merchantBuy-${raw.id}`,
      label,
      buyGold: typeof raw.buyGold === 'number' ? raw.buyGold : 8,
      buyOffers: isNeedMap(raw.buyOffers) ? { ...raw.buyOffers } : { meal: 1 },
      completed,
    }
  }
  if (kind === 'pawnshop') {
    return {
      kind: 'pawnshop',
      id: raw.id.startsWith('merchantPawn') ? raw.id : `merchantPawn-${raw.id}`,
      label,
      pawnWants: isNeedMap(raw.wants) && needEntries(raw.wants).length ? { ...raw.wants } : { wood: 2 },
      completed,
    }
  }
  return {
    kind: 'passerby',
    id: raw.id.startsWith('merchantBarter') ? raw.id : `merchantBarter-${raw.id}`,
    label,
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

function migrateEncounterSlot(value: unknown): Encounter | unknown {
  if (!value || typeof value !== 'object') return value
  const raw = value as { kind?: string }
  if (raw.kind === 'enemy') return migrateEnemy(raw as LegacyEnemy)
  if (raw.kind === 'merchant') return migrateLegacyMerchant(raw as LegacyMerchant)
  if (raw.kind === 'shady' || raw.kind === 'passerby' || raw.kind === 'pawnshop') return value
  return value
}

/** 旧存档补偶遇板；单格出发字段迁进第 0 格敌人；通用商人拆成三者之一。 */
export function hydrateEncounterFields(save: Save): Save {
  const raw = save as LegacyOrderSave
  raw.exploreCount =
    Number.isFinite(raw.exploreCount) && raw.exploreCount > 0 ? Math.floor(raw.exploreCount) : 0
  raw.departCount =
    Number.isFinite(raw.departCount) && raw.departCount > 0 ? Math.floor(raw.departCount) : 0
  raw.lastDepartAt =
    typeof raw.lastDepartAt === 'number' && Number.isFinite(raw.lastDepartAt) ? raw.lastDepartAt : null

  if (Array.isArray(raw.encounters)) {
    raw.encounters = raw.encounters.map((slot) => migrateEncounterSlot(slot) as Encounter)
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
