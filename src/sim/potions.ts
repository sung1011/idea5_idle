import { addToBank, bankQty, takeFromBank } from './bank'
import { hydratePotionSlots, LEGACY_POTION_ID } from './potionSlots'
import { roll01 } from './rng'
import {
  BRINK_HEAL_RATIO,
  BRINK_LOW_RATIO,
  BRINK_LOW_TARGET_RATIO,
  CLEAR_MIND_PRIMARY_RATIO,
  CLEAR_MIND_SECONDARY_MAX_RATIO,
  CLEAR_MIND_SECONDARY_RATIO,
  DOUBLE_MIST_DOUBLE_RATE,
  ITEM_DEF,
  PLAYABLE_STATION_IDS,
  POTION_BATCH_RANGE,
  POTION_ITEM_IDS,
  RENEW_DURATION_S,
  RENEW_HEAL_RATIO,
  RENEW_TICK_S,
  RUSH_CYCLE_CUT,
  SALVE_HEAL_RATIO,
  STATION_DEF,
  STIM_DURATION_S,
  STIM_SPEED_MUL,
} from './tables'
import { alchemyBatchBonus } from './tech'
import type {
  ActionResult,
  EncounterNeedMap,
  PotionBuffs,
  PotionItemId,
  PotionSlots,
  Save,
  StationId,
  Worker,
} from './types'
import { POTION_SLOT_COUNT } from './types'

export { POTION_SLOT_COUNT }
export { installPotionSlot, unequipPotionSlot } from './potionSlots'

export const POTION_NO_DUTY_TIP = '没有在岗工人可用药'
export const POTION_FULL_HP_TIP = '在岗工人已满血'

function isAssistLike(worker: Pick<Worker, 'id' | 'guest'>): boolean {
  return worker.guest === true || worker.id.startsWith('assist-')
}

/** 工人页点槽：只打六站在岗，排除休息 / 主线与地牢出战 / 助战。 */
export function isPotionDutyWorker(worker: Worker): boolean {
  if (isAssistLike(worker)) return false
  const station = worker.assignment
  return !!station && (PLAYABLE_STATION_IDS as readonly string[]).includes(station)
}

export function potionDutyWorkers(save: Save): Worker[] {
  return save.workers.filter(isPotionDutyWorker)
}

export function blankPotionBuffs(): PotionBuffs {
  return {
    stimUntil: null,
    renewUntil: null,
    renewNextAt: null,
    doubleMist: null,
    rushStation: null,
  }
}

function clampElapsed(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return null
  return Math.floor(raw)
}

function slotsOf(save: Save): PotionSlots {
  if (!Array.isArray(save.potionSlots) || save.potionSlots.length !== POTION_SLOT_COUNT) {
    save.potionSlots = hydratePotionSlots(save.potionSlots)
  }
  return save.potionSlots
}

function buffsOf(save: Save): PotionBuffs {
  if (!save.potionBuffs) save.potionBuffs = blankPotionBuffs()
  return save.potionBuffs
}

function isActiveUntil(until: number | null, elapsedS: number): boolean {
  return typeof until === 'number' && elapsedS < until
}

export function potionSlotItem(save: Save, index: number): PotionItemId | null {
  if (index < 0 || index >= POTION_SLOT_COUNT) return null
  return slotsOf(save)[index] ?? null
}

export function potionRemainS(until: number | null, elapsedS: number): number {
  if (!isActiveUntil(until, elapsedS)) return 0
  return Math.max(0, until! - elapsedS)
}

export function isStimActive(save: Save): boolean {
  return isActiveUntil(buffsOf(save).stimUntil, save.elapsedS)
}

export function stimSpeedMul(save: Save): number {
  return isStimActive(save) ? STIM_SPEED_MUL : 1
}

/** 双份雾倍率。没有标记或不是这一站则为 1，不消耗。 */
export function doubleMistMul(save: Save, stationId: StationId): number {
  const mark = buffsOf(save).doubleMist
  if (!mark || mark.stationId !== stationId) return 1
  return mark.mul
}

export function mistQty(save: Save, stationId: StationId, qty: number): number {
  const mul = doubleMistMul(save, stationId)
  return mul <= 1 ? qty : qty * mul
}

/** 该站成功产出后清掉双份雾。 */
export function consumeDoubleMist(save: Save, stationId: StationId): void {
  if (buffsOf(save).doubleMist?.stationId === stationId) buffsOf(save).doubleMist = null
}

/** 赶工粉：标记站的周期速度。缩短 40% 即周期 ×0.6，速度 ÷0.6。 */
export function rushSpeedMul(save: Save, stationId: StationId): number {
  if (buffsOf(save).rushStation !== stationId) return 1
  return 1 / (1 - RUSH_CYCLE_CUT)
}

/** 这一轮产出周期走完后清掉赶工粉。 */
export function consumeRushCycle(save: Save, stationId: StationId): void {
  if (buffsOf(save).rushStation === stationId) buffsOf(save).rushStation = null
}

function dutyStations(save: Save): StationId[] {
  const taken = new Set<StationId>()
  for (const worker of potionDutyWorkers(save)) {
    const station = worker.assignment
    if (station) taken.add(station)
  }
  return PLAYABLE_STATION_IDS.filter((id) => taken.has(id))
}

function pickDutyStation(save: Save): StationId | null {
  const stations = dutyStations(save)
  if (!stations.length) return null
  const idx = Math.min(stations.length - 1, Math.floor(roll01(save) * stations.length))
  return stations[idx] ?? null
}

export function rollAlchemyPotionBatch(save: Save): { itemId: PotionItemId; qty: number } {
  const idx = Math.min(POTION_ITEM_IDS.length - 1, Math.floor(roll01(save) * POTION_ITEM_IDS.length))
  const itemId = POTION_ITEM_IDS[idx]
  const range = POTION_BATCH_RANGE[itemId]
  const span = range.max - range.min + 1
  const qty = range.min + Math.floor(roll01(save) * span) + alchemyBatchBonus(save)
  return { itemId, qty }
}

function healAmount(hpMax: number, ratio: number): number {
  return Math.max(1, Math.ceil(Math.max(1, Math.floor(hpMax)) * ratio))
}

function syncCombatHp(save: Save, worker: Worker): void {
  for (const enc of save.encounters) {
    if (enc.kind !== 'enemy' || !enc.combat) continue
    const fighter = enc.combat.workers.find((row) => row.id === worker.id)
    if (!fighter) continue
    fighter.hp = Math.max(0, Math.min(fighter.hpMax, worker.hp))
  }
}

function livingDutyWorkers(save: Save): Worker[] {
  return potionDutyWorkers(save).filter((worker) => worker.hp > 0)
}

function applyHeal(save: Save, worker: Worker, amount: number): number {
  if (!(amount > 0)) return 0
  const next = Math.min(worker.hpMax, worker.hp + amount)
  const healed = next - worker.hp
  worker.hp = next
  if (healed > 0) syncCombatHp(save, worker)
  return healed
}

function hpRatio(worker: Worker): number {
  const hpMax = Math.max(1, worker.hpMax)
  return worker.hp / hpMax
}

/** 满血不选。按 HP/hpMax 升序，第 2 人还须 ≤50%。 */
function clearMindTargets(save: Save): Worker[] {
  const wounded = potionDutyWorkers(save)
    .filter((worker) => worker.hp < worker.hpMax)
    .sort((a, b) => hpRatio(a) - hpRatio(b) || a.id.localeCompare(b.id))
  const picked: Worker[] = []
  if (wounded[0]) picked.push(wounded[0])
  if (wounded[1] && hpRatio(wounded[1]) <= CLEAR_MIND_SECONDARY_MAX_RATIO) picked.push(wounded[1])
  return picked
}

function applyBrink(save: Save, worker: Worker): number {
  const hpMax = Math.max(1, Math.floor(worker.hpMax))
  if (worker.hp / hpMax <= BRINK_LOW_RATIO) {
    const floorHp = Math.min(hpMax, Math.ceil(hpMax * BRINK_LOW_TARGET_RATIO))
    if (worker.hp >= floorHp) return 0
    const healed = floorHp - worker.hp
    worker.hp = floorHp
    syncCombatHp(save, worker)
    return healed
  }
  return applyHeal(save, worker, Math.ceil(hpMax * BRINK_HEAL_RATIO))
}

function healDuty(save: Save, amountOf: (worker: Worker) => number, livingOnly = false): number {
  let total = 0
  const crew = livingOnly ? livingDutyWorkers(save) : potionDutyWorkers(save)
  for (const worker of crew) total += applyHeal(save, worker, amountOf(worker))
  return total
}

function applyPotionEffect(save: Save, itemId: PotionItemId): string {
  const buffs = buffsOf(save)
  const t = save.elapsedS
  if (itemId === 'stim') {
    buffs.stimUntil = t + STIM_DURATION_S
    return '在岗工人工作效率 ×1.5，持续 3 分钟'
  }
  if (itemId === 'salve') {
    const healed = healDuty(save, (worker) => healAmount(worker.hpMax, SALVE_HEAL_RATIO))
    return healed > 0 ? `在岗回血，合计 HP+${healed}` : '在岗已满血'
  }
  if (itemId === 'renewSoup') {
    buffs.renewUntil = t + RENEW_DURATION_S
    buffs.renewNextAt = t + RENEW_TICK_S
    return '续命：每 10 秒回 5% 生命，持续 2 分钟'
  }
  if (itemId === 'brinkSalve') {
    let healed = 0
    for (const worker of potionDutyWorkers(save)) healed += applyBrink(save, worker)
    return healed > 0 ? `在岗绝境回血，合计 HP+${healed}` : '在岗已满血'
  }
  if (itemId === 'rushPowder') {
    const stationId = pickDutyStation(save)
    if (!stationId) return POTION_NO_DUTY_TIP
    buffs.rushStation = stationId
    return `${STATION_DEF[stationId].label}下一次产出周期缩短 40%`
  }
  if (itemId === 'doubleMist') {
    const stationId = pickDutyStation(save)
    if (!stationId) return POTION_NO_DUTY_TIP
    const mul = roll01(save) < DOUBLE_MIST_DOUBLE_RATE ? 2 : 3
    buffs.doubleMist = { stationId, mul }
    return `${STATION_DEF[stationId].label}下一批成功产出 ×${mul}`
  }
  if (itemId === 'clearMind') {
    const targets = clearMindTargets(save)
    const ratios = [CLEAR_MIND_PRIMARY_RATIO, CLEAR_MIND_SECONDARY_RATIO]
    for (let i = 0; i < targets.length; i++) {
      applyHeal(save, targets[i], healAmount(targets[i].hpMax, ratios[i]))
    }
    return targets.length > 0 ? `醒神：最残 ${targets.length} 人回血` : POTION_FULL_HP_TIP
  }
  const _unreachable: never = itemId
  return _unreachable
}

/** 点已装配槽：扣物资 1 瓶并立刻生效。无 CD。库存为 0 仍保留装配。 */
export function usePotionSlot(save: Save, index: number, _now = Date.now()): ActionResult {
  if (index < 0 || index >= POTION_SLOT_COUNT) return { ok: false, reason: '没有这个槽' }
  const itemId = slotsOf(save)[index]
  if (!itemId) return { ok: false, reason: '空槽' }
  if (bankQty(save, itemId) < 1) return { ok: false, reason: `${ITEM_DEF[itemId].label}见底` }
  if (!potionDutyWorkers(save).length) return { ok: false, reason: POTION_NO_DUTY_TIP }
  if (itemId === 'clearMind' && clearMindTargets(save).length === 0) {
    return { ok: false, reason: POTION_FULL_HP_TIP }
  }
  if ((itemId === 'doubleMist' || itemId === 'rushPowder') && dutyStations(save).length === 0) {
    return { ok: false, reason: POTION_NO_DUTY_TIP }
  }
  const took = takeFromBank(save, itemId, 1)
  if (!took.ok) return took
  const detail = applyPotionEffect(save, itemId)
  save.guideQuestPotionUsed = true
  return { ok: true, message: `用了${ITEM_DEF[itemId].label}：${detail}` }
}

export function applyPotionTicks(save: Save): void {
  const buffs = buffsOf(save)
  const t = save.elapsedS
  if (buffs.renewUntil != null && t > buffs.renewUntil) {
    buffs.renewUntil = null
    buffs.renewNextAt = null
  } else if (
    buffs.renewUntil != null &&
    buffs.renewNextAt != null &&
    t >= buffs.renewNextAt &&
    t <= buffs.renewUntil
  ) {
    healDuty(save, (worker) => healAmount(worker.hpMax, RENEW_HEAL_RATIO), true)
    let next = buffs.renewNextAt + RENEW_TICK_S
    while (next <= t && next <= buffs.renewUntil) next += RENEW_TICK_S
    buffs.renewNextAt = next > buffs.renewUntil ? null : next
    if (t >= buffs.renewUntil) {
      buffs.renewUntil = null
      buffs.renewNextAt = null
    }
  }
  if (buffs.stimUntil != null && t >= buffs.stimUntil) buffs.stimUntil = null
}

function hydrateBuffs(raw: unknown, elapsedS: number): PotionBuffs {
  const src = raw && typeof raw === 'object' ? (raw as Partial<PotionBuffs>) : {}
  const until = (value: unknown): number | null => {
    const n = clampElapsed(value)
    return n != null && n > elapsedS ? n : null
  }
  const stationOf = (id: unknown): StationId | null =>
    (PLAYABLE_STATION_IDS as readonly string[]).includes(id as string) ? (id as StationId) : null
  let doubleMist: PotionBuffs['doubleMist'] = null
  const mist = src.doubleMist
  if (mist && typeof mist === 'object') {
    const stationId = stationOf(mist.stationId)
    const mul = mist.mul === 3 ? 3 : mist.mul === 2 ? 2 : null
    if (stationId && mul) doubleMist = { stationId, mul }
  }
  return {
    stimUntil: until(src.stimUntil),
    renewUntil: until(src.renewUntil),
    renewNextAt: clampElapsed(src.renewNextAt),
    doubleMist,
    rushStation: stationOf(src.rushStation),
  }
}

function foldLegacyQty(bag: Record<string, number | undefined>, from: string, to: PotionItemId): void {
  const qty = bag[from]
  if (typeof qty === 'number' && qty > 0) bag[to] = (bag[to] ?? 0) + Math.floor(qty)
  delete bag[from]
}

function remapNeedMap(map: EncounterNeedMap | undefined): void {
  if (!map) return
  const bag = map as Record<string, number | undefined>
  for (const [from, to] of Object.entries(LEGACY_POTION_ID)) foldLegacyQty(bag, from, to)
  delete bag.warDrum
}

/**
 * 旧档通用 `potion` 并进回春散 `salve`。
 * 凝神剂 `focusDraft`、护命符药 `wardElixir` 的库存与订单迁到双份雾 / 赶工粉；旧时效（护命 / 凝神）不保留。
 * 库存若已由 hydrateBank 折过，这里再看 save.bank 是空操作。
 */
export function hydratePotionState(save: Save, raw?: unknown): void {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const bank = save.bank as Record<string, number | undefined>
  for (const [from, to] of Object.entries(LEGACY_POTION_ID)) {
    const qty = bank[from]
    if (typeof qty === 'number' && qty > 0) addToBank(save, to, Math.floor(qty))
    delete bank[from]
  }
  save.potionSlots = hydratePotionSlots(src.potionSlots ?? save.potionSlots)
  save.potionBuffs = hydrateBuffs(src.potionBuffs ?? save.potionBuffs, save.elapsedS)
  for (const enc of [...save.encounters, ...(save.marketEncounters ?? [])]) {
    if (enc.kind === 'enemy') remapNeedMap(enc.needs)
    else if (enc.kind === 'blackMerchant') remapNeedMap(enc.buyOffers)
    else if (enc.kind === 'passerby') {
      remapNeedMap(enc.wants)
      remapNeedMap(enc.offers)
    } else if (enc.kind === 'pawn') remapNeedMap(enc.pawnWants)
    else if (enc.kind === 'artisan') remapNeedMap(enc.wants)
    else if (enc.kind === 'bulkBuy') remapNeedMap(enc.wants)
  }
}

export function pickMainNeedPotion(roll: number): PotionItemId {
  const t = Number.isFinite(roll) ? Math.min(0.999999, Math.max(0, roll)) : 0
  return POTION_ITEM_IDS[Math.min(POTION_ITEM_IDS.length - 1, Math.floor(t * POTION_ITEM_IDS.length))]
}
