import { assignRestingToFirstEmpty } from './assign'
import { pullWaitingManualRounds } from './workshopDispatch'
import { syncGuideQuestMet } from './mainlineQuest'
import { applyRestHeal, stepCombats, type CombatLogSink } from './combat'
import { stepBeastPvp } from './beastPvp'
import { stepHerbPvp } from './herbPvp'
import { stepTreasureMines, type TreasureDropSink } from './treasureMine'
import { expireTimedMarketOrders } from './marketTimed'
import { ensureDungeonDay } from './dungeon'
import { cloneSave } from './clone'
import { refreshFoodSlots } from './food'
import type { GainSink } from './gains'
import { ensureGuidePotionCampTarget } from './guideQuest'
import { applyPotionTicks } from './potions'
import { stepTravelingMerchant } from './travelingMerchant'
import { stepStation } from './stations'
import { STATION_IDS } from './tables'
import type { Save } from './types'

export type TickOpts = {
  now?: number
  /** 仅在线 tick 传入。离线追赶不要刷站卡「获得」漂字。 */
  onGain?: GainSink
  /** 仅在线 tick 传入。离线追赶不要刷订单卡战斗漂字。 */
  onCombatLog?: CombatLogSink
  /** 仅在线 tick 传入。离线追赶不要刷夺宝矿卡漂字。 */
  onTreasureDrop?: TreasureDropSink
  /** 离线追赶。来袭不判定；回来后由离线结算重新计时。 */
  offline?: boolean
}

/** 在线与离线共用。按站点结算：同站人数加速。 */
export function applyTick(save: Save, opts: TickOpts = {}): void {
  const now = opts.now ?? Date.now()
  save.elapsedS += 1
  save.lastTick = now
  stepTravelingMerchant(save)
  ensureDungeonDay(save, now)
  expireTimedMarketOrders(save, now)
  applyPotionTicks(save)
  refreshFoodSlots(save, now)
  for (const id of STATION_IDS) stepStation(save, id, now, opts.onGain)
  pullWaitingManualRounds(save)
  assignRestingToFirstEmpty(save)
  stepCombats(save, now, opts.onCombatLog)
  stepTreasureMines(save, opts.onTreasureDrop, { offline: opts.offline === true, now })
  stepHerbPvp(save, now, { offline: opts.offline === true })
  stepBeastPvp(save, now, { offline: opts.offline === true })
  applyRestHeal(save)
  ensureGuidePotionCampTarget(save)
  syncGuideQuestMet(save)
}

export function tick(save: Save, opts?: TickOpts): Save {
  const next = cloneSave(save)
  applyTick(next, opts)
  return next
}

export function ticks(save: Save, n: number, opts?: TickOpts): Save {
  const next = cloneSave(save)
  const start = opts?.now ?? Date.now()
  for (let i = 0; i < n; i++) applyTick(next, { ...opts, now: start + (i + 1) * 1000 })
  return next
}
