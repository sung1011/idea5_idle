import { bankQty } from './bank'
import { ITEM_DEF, isPotionItemId } from './tables'
import { POTION_SLOT_COUNT, type ActionResult, type ItemId, type PotionSlotId, type PotionSlots, type Save } from './types'

export function blankPotionSlots(): PotionSlots {
  return [null, null, null, null]
}

function clampSlotIndex(index: number): number | null {
  if (!Number.isInteger(index) || index < 0 || index >= POTION_SLOT_COUNT) return null
  return index
}

export function hydratePotionSlots(raw: unknown): PotionSlots {
  const slots = blankPotionSlots()
  if (!Array.isArray(raw)) return slots
  for (let i = 0; i < POTION_SLOT_COUNT; i++) {
    const id = raw[i]
    if (!isPotionItemId(id)) continue
    if (slots.some((taken) => taken === id)) continue
    slots[i] = id
  }
  return slots
}

export function potionSlotItem(save: Save, index: number): PotionSlotId {
  const i = clampSlotIndex(index)
  return i == null ? null : (save.potionSlots[i] ?? null)
}

/** 库存里还没装进槽的药剂种类。不扣数量。 */
export function availablePotionInstallIds(save: Save): ItemId[] {
  const taken = new Set(save.potionSlots.filter((id): id is ItemId => id != null))
  if (taken.has('potion')) return []
  return bankQty(save, 'potion') > 0 ? ['potion'] : []
}

export function installPotionSlot(save: Save, index: number, itemId: ItemId): ActionResult {
  const i = clampSlotIndex(index)
  if (i == null) return { ok: false, reason: '没有这个药剂槽' }
  if (!isPotionItemId(itemId)) return { ok: false, reason: '只能装药剂' }
  if (bankQty(save, itemId) < 1) return { ok: false, reason: `${ITEM_DEF[itemId].label}见底` }
  if (save.potionSlots.some((id, slot) => id === itemId && slot !== i)) {
    return { ok: false, reason: '这种药剂已经装上了' }
  }
  save.potionSlots[i] = itemId
  return { ok: true, message: `装上${ITEM_DEF[itemId].label}` }
}

export function clearPotionSlot(save: Save, index: number): ActionResult {
  const i = clampSlotIndex(index)
  if (i == null) return { ok: false, reason: '没有这个药剂槽' }
  if (!save.potionSlots[i]) return { ok: true }
  save.potionSlots[i] = null
  return { ok: true, message: '已卸下药剂' }
}
