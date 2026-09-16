import { addToBank, bankQty, canFit } from './bank'
import { canAffordCosts, missingCostLabels, takeCosts } from './costs'
import { ITEM_DEF, type IoRule } from './tables'
import type {
  ActionResult,
  Encounter,
  EncounterDistance,
  EncounterNeedMap,
  EncounterPower,
  EnemyEncounter,
  ItemId,
  MerchantEncounter,
  Save,
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

export type EncounterLine = {
  itemId: ItemId
  label: string
  need: number
  have: number
  missing: number
}

export type EnemyNameDef = { id: string; label: string }

export const ENEMY_NAME_DEFS: readonly EnemyNameDef[] = [
  { id: 'wolfScout', label: '狼群斥候' },
  { id: 'banditCamp', label: '匪帮营地' },
  { id: 'wildBoar', label: '山猪' },
  { id: 'riverRaider', label: '河盗' },
  { id: 'hillBrigand', label: '山贼' },
]

export type MerchantDef = {
  id: string
  label: string
  wants: EncounterNeedMap
  offers: EncounterNeedMap
  buyGold: number
}

export const MERCHANT_DEFS: readonly MerchantDef[] = [
  { id: 'woodPeddler', label: '木货贩', wants: { wood: 4 }, offers: { meal: 1 }, buyGold: 8 },
  { id: 'oreBroker', label: '矿石掮客', wants: { fish: 3 }, offers: { ore: 2 }, buyGold: 6 },
  { id: 'bladeSeller', label: '铜器贩', wants: { ore: 3 }, offers: { weapon: 1 }, buyGold: 12 },
  { id: 'campCook', label: '行脚厨子', wants: { wood: 2, fish: 2 }, offers: { meal: 2 }, buyGold: 14 },
  { id: 'rationBuyer', label: '干粮商', wants: { meal: 1 }, offers: { wood: 3 }, buyGold: 5 },
]

/** 旧单订单存档迁进偶遇敌人用。 */
const LEGACY_ORDER_DEFS: ReadonlyArray<{
  id: string
  label: string
  needs: EncounterNeedMap
  departGold: number
}> = [
  { id: 'scoutRation', label: '斥候干粮', needs: { weapon: 1, meal: 2 }, departGold: 8 },
  { id: 'caravanGuard', label: '商队护卫', needs: { weapon: 2, meal: 1, wood: 2 }, departGold: 12 },
  { id: 'campKitchen', label: '营地开伙', needs: { meal: 3, wood: 3 }, departGold: 10 },
  { id: 'bladeTrial', label: '试刃出征', needs: { weapon: 3 }, departGold: 14 },
  { id: 'riverWatch', label: '河岸巡守', needs: { weapon: 1, meal: 1, fish: 2 }, departGold: 9 },
  { id: 'timberPost', label: '木桩营地', needs: { wood: 4, meal: 1 }, departGold: 7 },
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

export function enemyDepartGoldFor(distance: EncounterDistance, power: EncounterPower): number {
  return 6 + (distance === 'far' ? 4 : 0) + (power === 'strong' ? 5 : 0)
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

export function formatNeedMap(map: EncounterNeedMap): string {
  const lines = needEntries(map)
  if (!lines.length) return '—'
  return lines.map(([itemId, qty]) => `${ITEM_DEF[itemId].label}×${qty}`).join(' + ')
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

function slotKind(seed: number, slot: number): Encounter['kind'] {
  const merchantSlots = new Set([(seed + 1) % ENCOUNTER_SLOT_COUNT, (seed + 3) % ENCOUNTER_SLOT_COUNT])
  return merchantSlots.has(slot) ? 'merchant' : 'enemy'
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
    departGold: enemyDepartGoldFor(distance, power),
    submitted: false,
    departed: false,
  }
}

function makeMerchant(seed: number, slot: number): MerchantEncounter {
  const def = MERCHANT_DEFS[(seed + slot) % MERCHANT_DEFS.length]
  return {
    kind: 'merchant',
    id: `${def.id}-${seed}-${slot}`,
    label: def.label,
    wants: { ...def.wants },
    offers: { ...def.offers },
    buyGold: def.buyGold,
    buyOffers: { ...def.offers },
    completed: false,
  }
}

export function generateEncounterBoard(seed: number): Encounter[] {
  const safe = Number.isFinite(seed) && seed >= 0 ? Math.floor(seed) : 0
  return Array.from({ length: ENCOUNTER_SLOT_COUNT }, (_, slot) =>
    slotKind(safe, slot) === 'merchant' ? makeMerchant(safe, slot) : makeEnemy(safe, slot),
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
    typeof enc.departGold === 'number' &&
    typeof enc.submitted === 'boolean' &&
    typeof enc.departed === 'boolean'
  )
}

function isMerchantEncounter(value: unknown): value is MerchantEncounter {
  if (!value || typeof value !== 'object') return false
  const enc = value as MerchantEncounter
  return (
    enc.kind === 'merchant' &&
    typeof enc.id === 'string' &&
    typeof enc.label === 'string' &&
    isNeedMap(enc.wants) &&
    isNeedMap(enc.offers) &&
    typeof enc.buyGold === 'number' &&
    isNeedMap(enc.buyOffers) &&
    typeof enc.completed === 'boolean'
  )
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
  return enc?.kind === 'merchant' ? enc : undefined
}

export function submitSupplyBlockReason(save: Save, index: number): string | null {
  const enc = enemyAt(save, index)
  if (!enc) return '不是敌人偶遇'
  if (enc.departed) return '已出发（战斗稍后）'
  if (enc.submitted) return '补给已提交，可以出发'
  const missing = missingLabels(save, enc.needs)
  if (missing.length) return `货不够：${missing.join('、')}`
  return null
}

export function departBlockReason(save: Save, index: number): string | null {
  const enc = enemyAt(save, index)
  if (!enc) return '不是敌人偶遇'
  if (enc.departed) return '已出发（战斗稍后）'
  if (!enc.submitted) return '先提交补给'
  return null
}

export function canSubmitSupply(save: Save, index: number): boolean {
  return submitSupplyBlockReason(save, index) === null
}

export function canDepartEncounter(save: Save, index: number): boolean {
  return departBlockReason(save, index) === null
}

export function submitSupply(save: Save, index: number): ActionResult {
  const blocked = submitSupplyBlockReason(save, index)
  if (blocked) return { ok: false, reason: blocked }
  const enc = enemyAt(save, index)
  if (!enc) return { ok: false, reason: '不是敌人偶遇' }
  const took = takeCosts(save, needMapToRules(enc.needs))
  if (!took.ok) return took
  enc.submitted = true
  return { ok: true }
}

/** 出发门闩。已提交则发补给金并标记该格，不做战斗 tick。 */
export function departEncounter(save: Save, index: number, now = Date.now()): ActionResult {
  const blocked = departBlockReason(save, index)
  if (blocked) return { ok: false, reason: blocked }
  const enc = enemyAt(save, index)
  if (!enc) return { ok: false, reason: '不是敌人偶遇' }
  save.gold += enc.departGold
  save.departCount += 1
  save.lastDepartAt = now
  enc.departed = true
  return { ok: true, message: `已出发（战斗稍后）。补给金 +${enc.departGold}` }
}

export function barterBlockReason(save: Save, index: number): string | null {
  const enc = merchantAt(save, index)
  if (!enc) return '不是商人偶遇'
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
  if (enc.completed) return '这笔买卖已完成'
  if (save.gold < enc.buyGold) return `金币不够：购买要 ${enc.buyGold}`
  if (!canFitNeedMap(save, enc.buyOffers)) return '银行装不下买到的货物'
  return null
}

export function canBarter(save: Save, index: number): boolean {
  return barterBlockReason(save, index) === null
}

export function canBuyMerchant(save: Save, index: number): boolean {
  return buyMerchantBlockReason(save, index) === null
}

export function barterMerchant(save: Save, index: number): ActionResult {
  const blocked = barterBlockReason(save, index)
  if (blocked) return { ok: false, reason: blocked }
  const enc = merchantAt(save, index)
  if (!enc) return { ok: false, reason: '不是商人偶遇' }
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
  const enc = merchantAt(save, index)
  if (!enc) return { ok: false, reason: '不是商人偶遇' }
  save.gold -= enc.buyGold
  const added = addNeedMap(save, enc.buyOffers)
  if (!added.ok) return added
  enc.completed = true
  return { ok: true, message: '金币购买成交' }
}

/** 探索：扣表驱动金币，重抽整板 5 格。 */
export function exploreBoard(save: Save): ActionResult {
  const blocked = exploreBlockReason(save)
  if (blocked) return { ok: false, reason: blocked }
  const cost = exploreCost(save)
  save.gold -= cost
  save.exploreCount += 1
  save.encounters = generateEncounterBoard(save.exploreCount)
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
    departGold: old.departGold,
    submitted: save.orderSubmitted === true,
    departed: false,
  }
}

/** 旧存档补偶遇板；单订单字段迁进第 0 格敌人。 */
export function hydrateEncounterFields(save: Save): Save {
  const raw = save as LegacyOrderSave
  raw.exploreCount =
    Number.isFinite(raw.exploreCount) && raw.exploreCount > 0 ? Math.floor(raw.exploreCount) : 0
  raw.departCount =
    Number.isFinite(raw.departCount) && raw.departCount > 0 ? Math.floor(raw.departCount) : 0
  raw.lastDepartAt =
    typeof raw.lastDepartAt === 'number' && Number.isFinite(raw.lastDepartAt) ? raw.lastDepartAt : null

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
