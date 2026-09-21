import { addToBank } from './bank'
import { canAffordCosts, collapseCosts, takeCosts } from './costs'
import { pushLot, type ItemLot } from './gains'
import { roll01 } from './rng'
import { inscriptionRecipePool, rollInscriptionRecipe, rollRuneBatchQty } from './runes'
import { grantStationXp, selectedCategoryDef } from './stationProgress'
import {
  FORGING_SOFT_FAIL_TAKE_RATIO,
  FORGING_SOFT_FAIL_XP_MUL,
  INSCRIPTION_SOFT_FAIL_CHANCE,
  ITEM_DEF,
  type IoRule,
  type RuneDef,
} from './tables'
import { toolUpkeepBonus } from './tech'
import { cycleOutputBonus } from './tools'
import type { Save, SoftFailRoll } from './types'

export function resolveSoftFail(chance: number, roll: number): SoftFailRoll {
  const safe = Math.min(0.99, Math.max(0, chance))
  return { chance: safe, outcome: roll < safe ? 'softFail' : 'ok' }
}

/** 软失败扣部分原料；qty 的一半向下取整，至少 1。 */
export function softFailCosts(rules: IoRule[]): IoRule[] {
  return collapseCosts(rules).map((io) => ({
    itemId: io.itemId,
    qty: Math.max(1, Math.floor(io.qty * FORGING_SOFT_FAIL_TAKE_RATIO)),
  }))
}

export function softFailXp(xpPerCycle: number): number {
  return Math.max(1, Math.floor(xpPerCycle * FORGING_SOFT_FAIL_XP_MUL))
}

export function inscriptionSoftFailChance(_recipe?: RuneDef): number {
  return INSCRIPTION_SOFT_FAIL_CHANCE
}

/** @deprecated 旧名，等同 inscriptionSoftFailChance */
export const forgingSoftFailChance = inscriptionSoftFailChance

/** 完成一次铭刻：成功出随机已解锁且付得起的符文；软失败扣部分荒晶、无成品、少量 XP。 */
export function completeInscriptionCycle(save: Save, now = Date.now(), into?: ItemLot[]): boolean {
  const recipes = inscriptionRecipePool(save).filter((row) => canAffordCosts(save, row.costs))
  const recipe = rollInscriptionRecipe(save, recipes)
  if (!recipe) return false
  const def = selectedCategoryDef(save, 'inscription')
  const rules = recipe.costs
  const fail = resolveSoftFail(inscriptionSoftFailChance(recipe), roll01(save))
  const station = save.stations.inscription

  if (fail.outcome === 'softFail') {
    if (!takeCosts(save, softFailCosts(rules)).ok) return false
    station.completed += 1
    grantStationXp(save, 'inscription', softFailXp(def.xpPerCycle))
    station.craftNotice = '软失败，荒晶损耗'
    return true
  }

  if (!takeCosts(save, rules).ok) return false
  const bonus = cycleOutputBonus(save, 'inscription', now)
  const upkeep = toolUpkeepBonus(save) > 0 ? 1 : 0
  const qty = rollRuneBatchQty(save, recipe) + bonus + upkeep
  if (!addToBank(save, recipe.id, qty).ok) return false
  pushLot(into, recipe.id, qty)
  station.completed += 1
  grantStationXp(save, 'inscription', recipe.xpPerCycle)
  station.craftNotice = `铭成${ITEM_DEF[recipe.id].label}×${qty}`
  return true
}

/** @deprecated 旧名，等同 completeInscriptionCycle */
export const completeForgingCycle = completeInscriptionCycle
