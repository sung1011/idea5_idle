import { addToBank, bankQty, takeFromBank } from './bank'
import { hydratePotionSlots } from './potionSlots'
import { roll01 } from './rng'
import {
  BRINK_HEAL_BASE,
  BRINK_HEAL_MISSING,
  CLEAR_MIND_HEAL_RATIO,
  CLEAR_MIND_LEAVE_RATIO,
  FOCUS_DURATION_S,
  ITEM_DEF,
  POTION_BATCH_RANGE,
  POTION_ITEM_IDS,
  RENEW_DURATION_S,
  RENEW_HEAL_RATIO,
  RENEW_TICK_S,
  SALVE_HEAL_RATIO,
  STIM_DURATION_S,
  STIM_SPEED_MUL,
  STATION_IDS,
  WARD_DURATION_S,
} from './tables'
import { isWoundedHp } from './workshopHp'
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

export function blankPotionBuffs(): PotionBuffs {
  return {
    stimUntil: null,
    renewUntil: null,
    renewNextAt: null,
    wardUntil: null,
    focusUntil: null,
    focusConsumed: [],
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

export function isWardActive(save: Save): boolean {
  return isActiveUntil(buffsOf(save).wardUntil, save.elapsedS)
}

export function isFocusActive(save: Save): boolean {
  return isActiveUntil(buffsOf(save).focusUntil, save.elapsedS)
}

export function focusOutputBonus(save: Save, stationId: StationId): number {
  const buffs = buffsOf(save)
  if (!isFocusActive(save)) return 0
  return buffs.focusConsumed.includes(stationId) ? 0 : 1
}

/** 成功吞吐时领取凝神剂 +1，并标记该站本窗已用。 */
export function takeFocusOutputBonus(save: Save, stationId: StationId): number {
  const bonus = focusOutputBonus(save, stationId)
  if (bonus <= 0) return 0
  const buffs = buffsOf(save)
  if (!buffs.focusConsumed.includes(stationId)) buffs.focusConsumed.push(stationId)
  return bonus
}

export function rollAlchemyPotionBatch(save: Save): { itemId: PotionItemId; qty: number } {
  const idx = Math.min(POTION_ITEM_IDS.length - 1, Math.floor(roll01(save) * POTION_ITEM_IDS.length))
  const itemId = POTION_ITEM_IDS[idx]
  const range = POTION_BATCH_RANGE[itemId]
  const span = range.max - range.min + 1
  const qty = range.min + Math.floor(roll01(save) * span)
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

function livingWorkers(save: Save): Worker[] {
  return save.workers.filter((worker) => worker.hp > 0)
}

function allWorkers(save: Save): Worker[] {
  return save.workers
}

function applyHeal(save: Save, worker: Worker, amount: number): number {
  if (!(amount > 0)) return 0
  const next = Math.min(worker.hpMax, worker.hp + amount)
  const healed = next - worker.hp
  worker.hp = next
  if (healed > 0) syncCombatHp(save, worker)
  return healed
}

function brinkHealAmount(worker: Worker): number {
  const hpMax = Math.max(1, Math.floor(worker.hpMax))
  const ratio = Math.max(0, Math.min(1, worker.hp / hpMax))
  return healAmount(hpMax, BRINK_HEAL_BASE + BRINK_HEAL_MISSING * (1 - ratio))
}

function healAll(save: Save, amountOf: (worker: Worker) => number, livingOnly = false): number {
  let total = 0
  const crew = livingOnly ? livingWorkers(save) : allWorkers(save)
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
    const healed = healAll(save, (worker) => healAmount(worker.hpMax, SALVE_HEAL_RATIO))
    return healed > 0 ? `全体回血，合计 HP+${healed}` : '全体已满血'
  }
  if (itemId === 'renewSoup') {
    buffs.renewUntil = t + RENEW_DURATION_S
    buffs.renewNextAt = t + RENEW_TICK_S
    return '续命：每 10 秒回 5% 生命，持续 2 分钟'
  }
  if (itemId === 'brinkSalve') {
    const healed = healAll(save, brinkHealAmount)
    return healed > 0 ? `绝境回血，合计 HP+${healed}` : '全体已满血'
  }
  if (itemId === 'wardElixir') {
    buffs.wardUntil = t + WARD_DURATION_S
    return '护命：1 分钟内不受工坊劳损与战斗伤害'
  }
  if (itemId === 'focusDraft') {
    buffs.focusUntil = t + FOCUS_DURATION_S
    buffs.focusConsumed = []
    return '凝神：5 分钟内每站下一次成功吞吐 +1'
  }
  if (itemId === 'clearMind') {
    let woke = 0
    for (const worker of allWorkers(save)) {
      if (isWoundedHp(worker)) {
        const hpMax = Math.max(1, Math.floor(worker.hpMax))
        const floorHp = Math.ceil(CLEAR_MIND_LEAVE_RATIO * hpMax)
        if (worker.hp < floorHp) {
          worker.hp = Math.min(hpMax, floorHp)
          syncCombatHp(save, worker)
        }
      } else {
        applyHeal(save, worker, healAmount(worker.hpMax, CLEAR_MIND_HEAL_RATIO))
      }
      woke += 1
    }
    return woke > 0 ? '醒神：残血抬至 40%，其余立刻回 10%' : '没有工人'
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
  const took = takeFromBank(save, itemId, 1)
  if (!took.ok) return took
  const detail = applyPotionEffect(save, itemId)
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
    healAll(save, (worker) => healAmount(worker.hpMax, RENEW_HEAL_RATIO), true)
    let next = buffs.renewNextAt + RENEW_TICK_S
    while (next <= t && next <= buffs.renewUntil) next += RENEW_TICK_S
    buffs.renewNextAt = next > buffs.renewUntil ? null : next
    if (t >= buffs.renewUntil) {
      buffs.renewUntil = null
      buffs.renewNextAt = null
    }
  }
  if (buffs.stimUntil != null && t >= buffs.stimUntil) buffs.stimUntil = null
  if (buffs.wardUntil != null && t >= buffs.wardUntil) buffs.wardUntil = null
  if (buffs.focusUntil != null && t >= buffs.focusUntil) {
    buffs.focusUntil = null
    buffs.focusConsumed = []
  }
}

function hydrateBuffs(raw: unknown, elapsedS: number): PotionBuffs {
  const src = raw && typeof raw === 'object' ? (raw as Partial<PotionBuffs>) : {}
  const until = (value: unknown): number | null => {
    const n = clampElapsed(value)
    return n != null && n > elapsedS ? n : null
  }
  const consumed: StationId[] = []
  if (Array.isArray(src.focusConsumed)) {
    for (const id of src.focusConsumed) {
      if ((STATION_IDS as readonly string[]).includes(id as string) && !consumed.includes(id as StationId)) {
        consumed.push(id as StationId)
      }
    }
  }
  const focusUntil = until(src.focusUntil)
  return {
    stimUntil: until(src.stimUntil),
    renewUntil: until(src.renewUntil),
    renewNextAt: clampElapsed(src.renewNextAt),
    wardUntil: until(src.wardUntil),
    focusUntil,
    focusConsumed: focusUntil ? consumed : [],
  }
}

function remapNeedMap(map: EncounterNeedMap | undefined): void {
  if (!map) return
  const bag = map as Record<string, number | undefined>
  const qty = bag.potion
  if (typeof qty === 'number' && qty > 0) {
    delete bag.potion
    bag.salve = (bag.salve ?? 0) + Math.floor(qty)
  }
  delete bag.warDrum
}

/** 旧档通用 `potion` 并进初级药膏；清空站上残留狂暴字段（类型已删）。 */
export function hydratePotionState(save: Save, raw?: unknown): void {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const qty = bankQty(save, 'potion')
  if (qty > 0) {
    addToBank(save, 'salve', qty)
    delete save.bank.potion
  }
  save.potionSlots = hydratePotionSlots(src.potionSlots ?? save.potionSlots)
  save.potionBuffs = hydrateBuffs(src.potionBuffs ?? save.potionBuffs, save.elapsedS)
  for (const enc of save.encounters) {
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
