import { addToBank, bankQty, takeFromBank } from './bank'
import { hydratePotionSlots, LEGACY_POTION_ID } from './potionSlots'
import { roll01 } from './rng'
import {
  BEAST_OIL_CAMP_TARGETS,
  BEAST_OIL_DURATION_S,
  BEAST_OIL_SPEED_MUL,
  BRINK_HEAL_RATIO,
  BRINK_LOW_RATIO,
  BRINK_LOW_TARGET_RATIO,
  CLEAR_MIND_PRIMARY_RATIO,
  CLEAR_MIND_SECONDARY_RATIO,
  DOUBLE_MIST_DOUBLE_RATE,
  ITEM_DEF,
  POTION_BATCH_RANGE,
  RENEW_DURATION_S,
  RENEW_HEAL_RATIO,
  RENEW_TICK_S,
  RUSH_CAMP_TARGETS,
  RUSH_CYCLE_CUT,
  SALVE_HEAL_RATIO,
  STIM_CAMP_TARGETS,
  STIM_DURATION_S,
  STIM_SPEED_MUL,
  normalizeAlchemyLevel,
  unlockedPotionIds,
} from './tables'
import { assignedWorkers, restingWorkers } from './assign'
import { alchemyBatchBonus } from './tech'
import { isFullWorkshopHp, workerFatigueDebt } from './workshopHp'
import type {
  ActionResult,
  EncounterNeedMap,
  PotionItemId,
  PotionSlots,
  Save,
  StationId,
  Worker,
  WorkerPotionBuff,
} from './types'
import { POTION_SLOT_COUNT } from './types'

export { POTION_SLOT_COUNT }
export { installPotionSlot, unequipPotionSlot } from './potionSlots'

export const POTION_NO_DUTY_TIP = '营地没有苦工可用药'
export const POTION_FULL_HP_TIP = '营地苦工已满血'

const HEAL_POTIONS = new Set<PotionItemId>(['salve', 'brinkSalve', 'clearMind', 'renewSoup'])

function isAssistLike(worker: Pick<Worker, 'id' | 'guest'>): boolean {
  return worker.guest === true || worker.id.startsWith('assist-')
}

/** 喝药只打营地里的人：休息、不在战斗 / 夺宝 / 割草 / 困兽，也不是助战。 */
export function potionCampWorkers(save: Save): Worker[] {
  return restingWorkers(save).filter((worker) => !isAssistLike(worker))
}

function slotsOf(save: Save): PotionSlots {
  if (!Array.isArray(save.potionSlots) || save.potionSlots.length !== POTION_SLOT_COUNT) {
    save.potionSlots = hydratePotionSlots(save.potionSlots)
  }
  return save.potionSlots
}

function isActiveUntil(until: number | null | undefined, elapsedS: number): boolean {
  return typeof until === 'number' && elapsedS < until
}

function potionOf(worker: Worker): WorkerPotionBuff {
  if (!worker.potion) worker.potion = {}
  return worker.potion
}

export function potionSlotItem(save: Save, index: number): PotionItemId | null {
  if (index < 0 || index >= POTION_SLOT_COUNT) return null
  return slotsOf(save)[index] ?? null
}

export function potionRemainS(until: number | null | undefined, elapsedS: number): number {
  if (!isActiveUntil(until, elapsedS)) return 0
  return Math.max(0, until! - elapsedS)
}

/** 这个人当前带着的药剂。赶工粉和双份雾没有倒计时，也算在内。 */
export function workerActivePotionIds(worker: Worker, elapsedS: number): PotionItemId[] {
  const buff = worker.potion
  if (!buff) return []
  const ids: PotionItemId[] = []
  if (isActiveUntil(buff.stimUntil, elapsedS)) ids.push('stim')
  if (isActiveUntil(buff.beastOilUntil, elapsedS)) ids.push('beastOil')
  if (buff.rush) ids.push('rushPowder')
  if (buff.doubleMist === 2 || buff.doubleMist === 3) ids.push('doubleMist')
  if (isActiveUntil(buff.renewUntil, elapsedS)) ids.push('renewSoup')
  return ids
}

export function anyWorkerHasPotionBuff(save: Save): boolean {
  return save.workers.some((worker) => workerActivePotionIds(worker, save.elapsedS).length > 0)
}

/** 在岗这名苦工的工作效率。嗜血 ×1.5、狂兽油 ×2 叠乘，赶工粉把周期缩短 40%。 */
export function workerWorkSpeedMul(worker: Worker, elapsedS: number): number {
  const buff = worker.potion
  if (!buff) return 1
  let mul = 1
  if (isActiveUntil(buff.stimUntil, elapsedS)) mul *= STIM_SPEED_MUL
  if (isActiveUntil(buff.beastOilUntil, elapsedS)) mul *= BEAST_OIL_SPEED_MUL
  if (buff.rush) mul *= 1 / (1 - RUSH_CYCLE_CUT)
  return mul
}

/** 站上在岗苦工的药剂速度。没人则为 1。 */
export function stationPotionSpeedMul(save: Save, stationId: StationId): number {
  const crew = assignedWorkers(save, stationId)
  if (!crew.length) return 1
  let mul = 1
  for (const worker of crew) mul *= workerWorkSpeedMul(worker, save.elapsedS)
  return mul
}

function stationWorker(save: Save, stationId: StationId): Worker | null {
  return assignedWorkers(save, stationId).find((worker) => !isAssistLike(worker)) ?? null
}

/** 双份雾倍率。这名在岗苦工没有标记则为 1，不消耗。 */
export function doubleMistMul(save: Save, stationId: StationId): number {
  const mul = stationWorker(save, stationId)?.potion?.doubleMist
  return mul === 2 || mul === 3 ? mul : 1
}

export function mistQty(save: Save, stationId: StationId, qty: number): number {
  const mul = doubleMistMul(save, stationId)
  return mul <= 1 ? qty : qty * mul
}

/** 这名在岗苦工成功产出后清掉他的双份雾。 */
export function consumeDoubleMist(save: Save, stationId: StationId): void {
  const worker = stationWorker(save, stationId)
  if (worker?.potion?.doubleMist) worker.potion.doubleMist = null
}

/** 这名在岗苦工走完一轮后清掉赶工粉。 */
export function consumeRushCycle(save: Save, stationId: StationId): void {
  const worker = stationWorker(save, stationId)
  if (worker?.potion?.rush) worker.potion.rush = false
}

/** 炼金站等级。字段缺失或非法时按 1 级。 */
export function alchemyStationLevel(
  save: { stations?: { alchemy?: { stationLevel?: unknown } } } | null | undefined,
): number {
  return normalizeAlchemyLevel(save?.stations?.alchemy?.stationLevel)
}

/** 已解锁药剂里等概率一种。瓶数区间、配伍札记加成不变。 */
export function rollAlchemyPotionBatch(save: Save): { itemId: PotionItemId; qty: number } {
  const pool = unlockedPotionIds(alchemyStationLevel(save))
  const idx = Math.min(pool.length - 1, Math.floor(roll01(save) * pool.length))
  const itemId = pool[idx] ?? 'stim'
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

/** 和营地休息一样：治疗量先抵劳损债，剩下的再加血。加到上限且债清完时 hp 钉在 hpMax、债归零。 */
function applyHeal(save: Save, worker: Worker, amount: number): number {
  if (!(amount > 0)) return 0
  const max = Math.max(1, Math.floor(worker.hpMax))
  const before = worker.hp
  const debt = workerFatigueDebt(worker)
  let points = amount
  if (debt > 0) {
    const cut = Math.min(debt, points)
    worker.fatigueDebt = debt - cut
    points -= cut
  }
  if (points > 0) worker.hp = Math.min(max, worker.hp + points)
  if (worker.hp >= max && workerFatigueDebt(worker) <= 0) {
    worker.hp = max
    worker.fatigueDebt = 0
  }
  if (worker.hp > max) worker.hp = max
  if (worker.hp < 0) worker.hp = 0
  const healed = worker.hp - before
  if (healed > 0) syncCombatHp(save, worker)
  if (healed > 0) return healed
  const debtPaid = debt - workerFatigueDebt(worker)
  return debtPaid > 0 ? debtPaid : 0
}

function hpRatio(worker: Worker): number {
  const hpMax = Math.max(1, worker.hpMax)
  return worker.hp / hpMax
}

/** 未满血（含劳损债）才选。按 HP/hpMax 升序，平局按 id，最多 2 人。 */
function clearMindTargets(save: Save): Worker[] {
  return potionCampWorkers(save)
    .filter((worker) => !isFullWorkshopHp(worker))
    .sort((a, b) => hpRatio(a) - hpRatio(b) || a.id.localeCompare(b.id))
    .slice(0, 2)
}

function campAllFull(save: Save): boolean {
  const crew = potionCampWorkers(save)
  return crew.length > 0 && crew.every((worker) => isFullWorkshopHp(worker))
}

function applyBrink(save: Save, worker: Worker): number {
  const hpMax = Math.max(1, Math.floor(worker.hpMax))
  if (worker.hp / hpMax <= BRINK_LOW_RATIO) {
    const floorHp = Math.min(hpMax, Math.ceil(hpMax * BRINK_LOW_TARGET_RATIO))
    if (worker.hp >= floorHp && workerFatigueDebt(worker) <= 0) return 0
    const need = Math.max(0, floorHp - worker.hp) + workerFatigueDebt(worker)
    return applyHeal(save, worker, need)
  }
  return applyHeal(save, worker, Math.ceil(hpMax * BRINK_HEAL_RATIO))
}

function pickRandom(save: Save, workers: readonly Worker[], count: number): Worker[] {
  const pool = workers.slice()
  const picked: Worker[] = []
  const take = Math.min(count, pool.length)
  for (let i = 0; i < take; i++) {
    const idx = Math.min(pool.length - 1, Math.floor(roll01(save) * pool.length))
    const [row] = pool.splice(idx, 1)
    if (row) picked.push(row)
  }
  return picked
}

function applyPotionEffect(save: Save, itemId: PotionItemId): string {
  const t = save.elapsedS
  const camp = potionCampWorkers(save)
  if (itemId === 'stim') {
    const targets = pickRandom(save, camp, STIM_CAMP_TARGETS)
    for (const worker of targets) potionOf(worker).stimUntil = t + STIM_DURATION_S
    return `营地 ${targets.length} 名苦工工作效率 ×1.5，持续 3 分钟`
  }
  if (itemId === 'salve') {
    let healed = 0
    for (const worker of camp) healed += applyHeal(save, worker, healAmount(worker.hpMax, SALVE_HEAL_RATIO))
    return healed > 0 ? `营地回血，合计 HP+${healed}` : '营地已满血'
  }
  if (itemId === 'renewSoup') {
    for (const worker of camp) {
      const buff = potionOf(worker)
      buff.renewUntil = t + RENEW_DURATION_S
      buff.renewNextAt = t + RENEW_TICK_S
    }
    return '营地苦工每 10 秒回 5% 生命，持续 2 分钟'
  }
  if (itemId === 'brinkSalve') {
    let healed = 0
    for (const worker of camp) healed += applyBrink(save, worker)
    return healed > 0 ? `营地背水回血，合计 HP+${healed}` : '营地已满血'
  }
  if (itemId === 'rushPowder') {
    const targets = camp.slice(0, RUSH_CAMP_TARGETS)
    for (const worker of targets) potionOf(worker).rush = true
    return `营地队首起 ${targets.length} 人下一轮干活耗时缩短 40%`
  }
  if (itemId === 'doubleMist') {
    const head = camp[0]
    if (!head) return POTION_NO_DUTY_TIP
    const mul = roll01(save) < DOUBLE_MIST_DOUBLE_RATE ? 2 : 3
    potionOf(head).doubleMist = mul
    return `营地队首下一轮成功产出 ×${mul}`
  }
  if (itemId === 'clearMind') {
    const targets = clearMindTargets(save)
    const ratios = [CLEAR_MIND_PRIMARY_RATIO, CLEAR_MIND_SECONDARY_RATIO]
    for (let i = 0; i < targets.length; i++) {
      applyHeal(save, targets[i], healAmount(targets[i].hpMax, ratios[i]))
    }
    return targets.length > 0 ? `图腾：营地最残 ${targets.length} 人回血` : POTION_FULL_HP_TIP
  }
  if (itemId === 'beastOil') {
    const targets = pickRandom(save, camp, BEAST_OIL_CAMP_TARGETS)
    for (const worker of targets) potionOf(worker).beastOilUntil = t + BEAST_OIL_DURATION_S
    return `营地 ${targets.length} 名苦工效率 ×2，持续 3 分钟`
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
  if (!potionCampWorkers(save).length) return { ok: false, reason: POTION_NO_DUTY_TIP }
  if (itemId === 'clearMind' && clearMindTargets(save).length === 0) {
    return { ok: false, reason: POTION_FULL_HP_TIP }
  }
  if (HEAL_POTIONS.has(itemId) && itemId !== 'clearMind' && campAllFull(save)) {
    return { ok: false, reason: POTION_FULL_HP_TIP }
  }
  const took = takeFromBank(save, itemId, 1)
  if (!took.ok) return took
  const detail = applyPotionEffect(save, itemId)
  save.guideQuestPotionUsed = true
  return { ok: true, message: `用了${ITEM_DEF[itemId].label}：${detail}` }
}

function healRenew(save: Save, worker: Worker): void {
  if (worker.hp <= 0) return
  applyHeal(save, worker, healAmount(worker.hpMax, RENEW_HEAL_RATIO))
}

export function applyPotionTicks(save: Save): void {
  const t = save.elapsedS
  for (const worker of save.workers) {
    const buff = worker.potion
    if (!buff) continue
    if (buff.renewUntil != null && t > buff.renewUntil) {
      buff.renewUntil = null
      buff.renewNextAt = null
    } else if (
      buff.renewUntil != null &&
      buff.renewNextAt != null &&
      t >= buff.renewNextAt &&
      t <= buff.renewUntil
    ) {
      healRenew(save, worker)
      let next = buff.renewNextAt + RENEW_TICK_S
      while (next <= t && next <= buff.renewUntil) next += RENEW_TICK_S
      buff.renewNextAt = next > buff.renewUntil ? null : next
      if (t >= buff.renewUntil) {
        buff.renewUntil = null
        buff.renewNextAt = null
      }
    }
    if (buff.stimUntil != null && t >= buff.stimUntil) buff.stimUntil = null
    if (buff.beastOilUntil != null && t >= buff.beastOilUntil) buff.beastOilUntil = null
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
 * 凝神剂 `focusDraft`、护命符药 `wardElixir` 的库存与订单迁到双份雾 / 赶工粉。
 * 账号级时效不再保留：效果改挂在苦工身上，旧档由存档版本整档丢弃。
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
  delete (save as { potionBuffs?: unknown }).potionBuffs
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

/** 主线等随机要药：只在当前已解锁药剂里等概率抽。等级缺省按 1。 */
export function pickMainNeedPotion(roll: number, stationLevel?: unknown): PotionItemId {
  const pool = unlockedPotionIds(stationLevel ?? 1)
  const t = Number.isFinite(roll) ? Math.min(0.999999, Math.max(0, roll)) : 0
  return pool[Math.min(pool.length - 1, Math.floor(t * pool.length))] ?? 'stim'
}
