import { addToBank } from './bank'
import { collapseCosts, takeCosts } from './costs'
import { pickConsume, stationResonating } from './query'
import { roll01 } from './rng'
import { grantStationXp, selectedCategoryDef } from './stationProgress'
import {
  FORGING_SOFT_FAIL_CHANCE,
  FORGING_SOFT_FAIL_TAKE_RATIO,
  FORGING_SOFT_FAIL_XP_MUL,
  isToolItemId,
  ITEM_DEF,
  RESONANCE_BONUS_EVERY,
  type IoRule,
} from './tables'
import { cycleOutputBonus, forgingMatchStation, pushForgedTools } from './tools'
import type { CategoryId, Save, SoftFailRoll } from './types'

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

export function forgingSoftFailChance(categoryId: CategoryId): number {
  return FORGING_SOFT_FAIL_CHANCE[categoryId] ?? FORGING_SOFT_FAIL_CHANCE.default
}

/** 完成一次锻造：成功出工具；软失败扣部分矿、无成品、少量 XP。不停站。 */
export function completeForgingCycle(save: Save, now = Date.now()): boolean {
  const pick = pickConsume(save, 'forging')
  if (!pick) return false
  const def = selectedCategoryDef(save, 'forging')
  const rules = pick.rules
  const fail = resolveSoftFail(forgingSoftFailChance(def.id), roll01(save))
  const station = save.stations.forging
  const resonating = stationResonating(save, 'forging')
  if (resonating) station.resonanceStreak += 1
  else station.resonanceStreak = 0

  if (fail.outcome === 'softFail') {
    if (!takeCosts(save, softFailCosts(rules)).ok) return false
    station.completed += 1
    grantStationXp(save, 'forging', softFailXp(def.xpPerCycle))
    station.craftNotice = '软失败，矿石损耗'
    return true
  }

  if (!takeCosts(save, rules).ok) return false
  const extra = resonating && station.resonanceStreak % RESONANCE_BONUS_EVERY === 0
  const bonus = cycleOutputBonus(save, 'forging', extra, now)
  for (const io of def.outputs) {
    const qty = io.qty + (io === def.outputs[0] ? bonus : 0)
    if (!addToBank(save, io.itemId, qty).ok) return false
  }
  if (extra) addToBank(save, 'blueprint', 1)
  const out = def.outputs[0]
  if (out && isToolItemId(out.itemId)) {
    pushForgedTools(save, out.itemId, forgingMatchStation(save), out.qty + bonus)
  }
  station.completed += 1
  grantStationXp(save, 'forging', def.xpPerCycle)
  station.craftNotice = out ? `锻成${ITEM_DEF[out.itemId].label}` : '锻造成功'
  return true
}

