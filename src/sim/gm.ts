import { createSave, normalizeDiamonds } from './createSave'
import { syncKnightLevel } from './knightLevel'
import { spawnWorker, spawnWorkerWith } from './recruit'
import { roll01 } from './rng'
import { syncUnlockedCategories } from './stationProgress'
import { normalizeTechPoints } from './tech'
import {
  QUALITY_MAX,
  STATION_DEF,
  STATION_IDS,
  classPoolForQuality,
  pickClassFromPool,
} from './tables'
import type { ActionResult, ItemId, Save } from './types'

export const GM_GOLD_GRANT = 10000
export const GM_DIAMOND_GRANT = 10000
export const GM_TECH_POINTS_GRANT = 10000
export const GM_WORKER_GRANT = 5
export const GM_MAX_STATION_LEVEL = 10
export const GM_BASIC_ITEM_QTY = 999
export const GM_BASIC_ITEMS: ItemId[] = [
  'wood',
  'ore',
  'ironOre',
  'mithrilOre',
  'fish',
  'meat',
  'herb',
  'spice',
  'blood',
  'tooth',
  'eye',
  'meal',
  'roast',
  'tool',
  'ironTool',
  'mithrilTool',
]

/** 按 createSave 重开。调用方替换整份存档并写回 localStorage。 */
export function gmResetSave(): Save {
  return createSave()
}

export function gmAddGold(save: Save, amount = GM_GOLD_GRANT): ActionResult {
  const qty = Math.max(0, Math.floor(amount))
  save.gold += qty
  return { ok: true, message: `金币 +${qty}` }
}

export function gmAddDiamonds(save: Save, amount = GM_DIAMOND_GRANT): ActionResult {
  const qty = Math.max(0, Math.floor(amount))
  save.diamonds = normalizeDiamonds(save.diamonds) + qty
  return { ok: true, message: `钻石 +${qty}` }
}

export function gmAddWorkers(save: Save, count = GM_WORKER_GRANT): ActionResult {
  const n = Math.max(0, Math.floor(count))
  for (let i = 0; i < n; i++) spawnWorker(save)
  return { ok: true, message: `加工人 ×${n}` }
}

/** 一名彩档工人；职业从满档池随机，战斗属性走 spawn 开槽。 */
export function gmAddMaxQualityWorker(save: Save): ActionResult {
  const pool = classPoolForQuality(QUALITY_MAX)
  const classId = pickClassFromPool(pool, roll01(save))
  const worker = spawnWorkerWith(save, QUALITY_MAX, classId)
  return { ok: true, message: `满品质工人 ${worker.name ?? worker.id}` }
}

export function gmMaxStations(save: Save, level = GM_MAX_STATION_LEVEL): ActionResult {
  const target = Math.max(1, Math.floor(level))
  for (const id of STATION_IDS) {
    const station = save.stations[id]
    station.stationLevel = target
    station.stationXp = 0
    syncUnlockedCategories(station, id)
    station.progressNotice = `${STATION_DEF[id].label}升到 Lv${target}`
  }
  const knight = syncKnightLevel(save)
  if (knight.gained > 0) {
    return { ok: true, message: `站点全满级 Lv${target}，骑士 Lv${knight.to}，灵感 +${knight.gained}` }
  }
  return { ok: true, message: `站点全满级 Lv${target}` }
}

export function gmFillBankBasics(save: Save): ActionResult {
  for (const id of GM_BASIC_ITEMS) save.bank[id] = GM_BASIC_ITEM_QTY
  return { ok: true, message: '已加基础物资' }
}

export function gmAddTechPoints(save: Save, amount = GM_TECH_POINTS_GRANT): ActionResult {
  const qty = Math.max(0, Math.floor(amount))
  save.techPoints = normalizeTechPoints(save.techPoints) + qty
  return { ok: true, message: `灵感 +${qty}` }
}
