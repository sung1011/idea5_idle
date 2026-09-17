import { applyRestHeal, stepCombats } from './combat'
import { cloneSave } from './clone'
import { refreshFoodSlots } from './food'
import type { GainSink } from './gains'
import { stepStation } from './stations'
import { STATION_IDS } from './tables'
import type { Save } from './types'

export type TickOpts = {
  now?: number
  /** 仅在线 tick 传入。离线追赶不要刷「获得」漂字。 */
  onGain?: GainSink
}

/** 在线与离线共用。按站点结算：同站人数加速。 */
export function applyTick(save: Save, opts: TickOpts = {}): void {
  const now = opts.now ?? Date.now()
  save.elapsedS += 1
  save.lastTick = now
  refreshFoodSlots(save, now)
  for (const id of STATION_IDS) stepStation(save, id, now, opts.onGain)
  stepCombats(save, now)
  applyRestHeal(save)
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
