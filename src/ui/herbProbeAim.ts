/** 点侦测按钮。没有存货不能进入；正在使用时再点一次是取消。 */
export function nextHerbProbeAim(active: boolean, probes: number): boolean {
  if (probes < 1) return false
  return !active
}

/** 成功揭开后退出使用模式。没揭开则留在使用模式，方便另选一块。 */
export function herbProbeAimAfterPlot(active: boolean, used: boolean): boolean {
  if (!active) return false
  return !used
}

/** 点地图外空白处取消使用模式。 */
export function herbProbeAimOnOutside(active: boolean): boolean {
  if (!active) return false
  return false
}
