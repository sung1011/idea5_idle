import { cloneSave } from './clone'
import { stepStation } from './stations'
import { STATION_IDS } from './tables'
import type { Save } from './types'

export type TickOpts = {
  now?: number
}

/** 在线与离线共用。按站点结算：同站人数加速，相邻站共振。 */
export function applyTick(save: Save, opts: TickOpts = {}): void {
  save.elapsedS += 1
  save.lastTick = opts.now ?? Date.now()
  for (const id of STATION_IDS) stepStation(save, id)
}

export function tick(save: Save, opts?: TickOpts): Save {
  const next = cloneSave(save)
  applyTick(next, opts)
  return next
}

export function ticks(save: Save, n: number, opts?: TickOpts): Save {
  const next = cloneSave(save)
  for (let i = 0; i < n; i++) applyTick(next, opts)
  return next
}
