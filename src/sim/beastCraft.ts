import { addToBank, itemQty, takeFromBank } from './bank'
import { applyWorkshopBuff } from './encounters'
import { isStationUnlocked, unlockedStationIds } from './stationUnlock'
import { grantStationLevel } from './stationProgress'
import { ITEM_DEF, STATION_DEF } from './tables'
import type { ActionResult, ItemId, Save, StationId } from './types'

export const BEAST_FEAST_MUL = 1.2
export const BEAST_FEAST_S = 3600

type Cost = { itemId: ItemId; qty: number }

function pay(save: Save, costs: readonly Cost[]): ActionResult {
  for (const row of costs) {
    if (itemQty(save, row.itemId) < row.qty) return { ok: false, reason: `${ITEM_DEF[row.itemId].label}见底` }
  }
  for (const row of costs) {
    const took = takeFromBank(save, row.itemId, row.qty)
    if (!took.ok) return took
  }
  return { ok: true }
}

function craft(save: Save, costs: readonly Cost[], itemId: ItemId, qty: number): ActionResult {
  const paid = pay(save, costs)
  if (!paid.ok) return paid
  addToBank(save, itemId, qty)
  return { ok: true, message: `做出${ITEM_DEF[itemId].label} ×${qty}` }
}

/** 烹饪站手动：兽骨 1 + 肉 10 → 骨汤 5。不进站点循环。 */
export function craftBoneSoup(save: Save): ActionResult {
  return craft(save, [
    { itemId: 'beastBone', qty: 1 },
    { itemId: 'meat', qty: 10 },
  ], 'boneSoup', 5)
}

/** 烹饪站手动：兽筋 1 + 香料 10 → 猎人肉串 5。 */
export function craftHunterSkewer(save: Save): ActionResult {
  return craft(save, [
    { itemId: 'beastSinew', qty: 1 },
    { itemId: 'spice', qty: 10 },
  ], 'hunterSkewer', 5)
}

/** 炼金站手动：困兽油脂 1 + 草 10 → 狂兽油 3。不进随机池。 */
export function craftBeastOil(save: Save): ActionResult {
  return craft(save, [
    { itemId: 'beastFat', qty: 1 },
    { itemId: 'herb', qty: 10 },
  ], 'beastOil', 3)
}

/** 野兽心脏 1 + 肉 20 + 香料 10。做成立刻给全工坊 ×1.2，持续 3600 秒，不叠加，重复制作刷新。 */
export function craftBeastFeast(save: Save, now = Date.now()): ActionResult {
  const paid = pay(save, [
    { itemId: 'beastHeart', qty: 1 },
    { itemId: 'meat', qty: 20 },
    { itemId: 'spice', qty: 10 },
  ])
  if (!paid.ok) return paid
  applyWorkshopBuff(save, BEAST_FEAST_MUL, BEAST_FEAST_S, now, 'feast')
  return { ok: true, message: '酋长宴摆上了，全工坊产量 ×1.2，持续 1 小时' }
}

/** 困兽之核：已开放的站点直接升 1 级，经验补到下一级门槛，不加科技经验倍率。 */
export function breakthroughStation(save: Save, stationId: StationId): ActionResult {
  if (!isStationUnlocked(save, stationId)) return { ok: false, reason: '这个站点还没开放' }
  if (!save.stations[stationId]) return { ok: false, reason: '没有这个站点' }
  if (itemQty(save, 'beastCore') < 1) return { ok: false, reason: '困兽之核见底' }
  const took = takeFromBank(save, 'beastCore', 1)
  if (!took.ok) return took
  const level = grantStationLevel(save, stationId)
  return { ok: true, message: `${STATION_DEF[stationId].label}升到 Lv${level}` }
}

export function breakthroughChoices(save: Save): StationId[] {
  return unlockedStationIds(save)
}
